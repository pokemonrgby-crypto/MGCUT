// public/js/tabs/create-character.js
import { api, storage, auth } from '../api.js';
import { withBlocker, ui } from '../ui/frame.js';
import { callClientSideGemini } from '../lib/gemini-client.js';

const rootSel = '[data-view="create-character"]';
let worldsCache = [];
let promptsCache = [];
let characterBasePrompt = ''; // AI 호출에 사용할 기본 프롬프트
let selectedWorld = null;
let selectedPrompt = null;

/**
 * 세계관 정보를 AI에게 전달할 텍스트 형식으로 변환합니다.
 * @param {object} w - 세계관 데이터 객체
 * @returns {string} - AI 입력용으로 변환된 텍스트
 */
function buildWorldTextForAI(w) {
    if (!w) return '';
    const worldInfo = {
        name: w.name,
        introShort: w.introShort,
        introLong: w.introLong,
        sites: (w.sites || []).map(s => ({ name: s.name, description: s.description })),
        factions: (w.factions || []).map(f => ({ name: f.name, description: f.description })),
        npcs: (w.npcs || []).map(n => ({ name: n.name, description: n.description })),
        episodes: (w.episodes || []).map(e => ({ title: e.title, summary: e.content.replace(/<[^>]+>/g, "").substring(0, 200) + '...' }))
    };
    return JSON.stringify(worldInfo, null, 2);
}

/**
 * 세계관 선택 카드 HTML을 생성합니다.
 * @param {object} w - 세계관 데이터
 * @returns {string} HTML 문자열
 */
function worldCardTemplate(w) {
    const desc = (w.introShort || '');
    const shortDesc = desc.substring(0, 80);
    return `
    <div class="card world-select-card" data-id="${w.id}">
        <div class="image-box" style="background-image:url('${w.coverUrl || ''}')"></div>
        <div class="text-box">
          <div class="title">${w.name}</div>
          <div class="desc">${shortDesc}${desc.length > 80 ? '...' : ''}</div>
        </div>
    </div>`;
}

/**
 * 프롬프트 선택 카드 HTML을 생성합니다.
 * @param {object} p - 프롬프트 데이터
 * @returns {string} HTML 문자열
 */
function promptCardTemplate(p) {
    return `
    <div class="card info-card prompt-select-card" data-id="${p.id}">
        <div class="name">${p.title}</div>
        <div class="desc small">${p.content.substring(0, 100)}...</div>
    </div>`;
}

export function mount() {
    const root = document.querySelector(rootSel);
    if (!root || root.dataset.mounted === '1') return;
    root.dataset.mounted = '1';

    const step1 = root.querySelector('#cc-step1-world-selection');
    const step2 = root.querySelector('#cc-step2-prompt-selection');
    const step3 = root.querySelector('#cc-step3-character-input');
    const worldListEl = root.querySelector('#cc-world-list');
    const searchInput = root.querySelector('#cc-world-search');
    const promptListEl = root.querySelector('#cc-prompt-list');
    const selectedWorldInfoEl = root.querySelector('#cc-selected-world-info');

    const changeStep = (targetStep) => {
        step1.style.display = (targetStep === 1) ? '' : 'none';
        step2.style.display = (targetStep === 2) ? '' : 'none';
        step3.style.display = (targetStep === 3) ? '' : 'none';
    };

    // --- 1단계 로직: 세계관 선택 ---
    const renderWorlds = () => {
        const term = searchInput.value.toLowerCase();
        const filtered = term ? worldsCache.filter(w => w.name.toLowerCase().includes(term)) : worldsCache;
        worldListEl.innerHTML = filtered.map(worldCardTemplate).join('') || '<div class="card pad small">검색 결과가 없습니다.</div>';
    };

    const loadWorlds = async () => {
        try {
            const res = await api.listWorlds();
            worldsCache = (res.data || []).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            renderWorlds();
        } catch (e) {
            worldListEl.innerHTML = `<div class="card pad err">세계관 로딩 실패: ${e.message}</div>`;
        }
    };
    searchInput.oninput = renderWorlds;

    worldListEl.onclick = async (e) => {
        const card = e.target.closest('.world-select-card');
        if (!card) return;

        const worldId = card.dataset.id;
        await withBlocker(async () => {
            const worldRes = await api.getWorld(worldId);
            selectedWorld = worldRes.data;
            selectedWorldInfoEl.innerHTML = `
                <div class="card" style="padding:12px; text-align:center;">
                    <div style="font-weight:700;">${selectedWorld.name}</div>
                    <div class="small" style="opacity:0.8; margin-top:4px;">${selectedWorld.introShort}</div>
                </div>`;
        });
        changeStep(2);
    };

    // --- 2단계 로직: 프롬프트 선택 ---
    const loadPrompts = async () => {
        const defaultPrompt = {
            id: 'default-basic',
            title: '⭐ 기본 프롬프트',
            content: '사용자의 입력에 따라 자유롭게 캐릭터의 서사를 구성합니다.',
        };
        try {
            const res = await api.listPrompts();
            promptsCache = [defaultPrompt, ...(res.data || [])];
            promptListEl.innerHTML = promptsCache.map(promptCardTemplate).join('');
        } catch (e) {
            console.error("프롬프트 로딩 실패:", e);
            promptsCache = [defaultPrompt];
            promptListEl.innerHTML = promptsCache.map(promptCardTemplate).join('');
        }
    };

    promptListEl.onclick = (e) => {
        const card = e.target.closest('.prompt-select-card');
        if (!card) return;
        selectedPrompt = promptsCache.find(p => p.id === card.dataset.id);
        changeStep(3);
    };

    // --- 3단계 로직: 정보 입력 및 생성 ---
    root.querySelector('#btn-char-create-final').onclick = async () => {
        if (!selectedWorld || !selectedPrompt) return alert('세계관과 프롬프트가 올바르게 선택되지 않았습니다.');
        const characterName = root.querySelector('#cc-char-name').value.trim();
        if (!characterName) return alert('캐릭터 이름을 입력해주세요.');
        if (!characterBasePrompt) return alert('캐릭터 기본 프롬프트를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');

        try {
            await withBlocker(async () => {
                const imageFile = root.querySelector('#cc-char-image').files[0];
                let imageUrl = '';
                if (imageFile) {
                    const userId = auth.currentUser?.uid;
                    if (!userId) throw new Error('이미지를 업로드하려면 로그인이 필요합니다.');
                    imageUrl = await storage.uploadImage(`characters/${userId}`, imageFile);
                }

                const worldText = buildWorldTextForAI(selectedWorld);
                const promptText = selectedPrompt.content;
                const userInputText = `캐릭터 이름: ${characterName}\n추가 요청: ${root.querySelector('#cc-char-input').value.trim() || '(없음)'}`;
                
                const composedUser = [
                    `### 세계관 정보 (JSON)`, worldText,
                    `### 생성 프롬프트`, promptText,
                    `### 사용자 요청`, userInputText,
                    `\n\n위 정보를 바탕으로 JSON 스키마에 맞춰 캐릭터를 생성해줘.`,
                ].join('\n\n');

                const characterJson = await callClientSideGemini({
                    system: characterBasePrompt,
                    user: composedUser
                });
                
                if (!characterJson) throw new Error('AI가 유효한 JSON을 생성하지 못했습니다.');

                // 서버에 저장하는 API 호출 (기존 generateCharacter 활용)
                const res = await api.saveCharacter({ // `generateCharacter` 대신 `saveCharacter`와 같은 별도 API가 필요할 수 있음. 우선 `generateCharacter`를 수정없이 사용한다고 가정.
                    worldId: selectedWorld.id,
                    promptId: selectedPrompt.id === 'default-basic' ? null : selectedPrompt.id,
                    characterData: { ...characterJson, name: characterName }, // AI가 생성한 이름 대신 사용자가 입력한 이름 보장
                    imageUrl: imageUrl
                });

                alert(`캐릭터 생성 성공! (ID: ${res.data.id})`);
                ui.navTo(`character/${res.data.id}`);
            });
        } catch (e) {
            // COOLDOWN 에러는 현재 서버 로직에만 있으므로 클라이언트에서는 일반 오류로 처리됩니다.
            alert(`생성 실패: ${e.message}`);
            console.error(e);
        }
    };

    // 뒤로가기 버튼
    root.querySelector('#cc-btn-back-to-step1').onclick = () => changeStep(1);
    root.querySelector('#cc-btn-back-to-step2').onclick = () => changeStep(2);

    // 뷰 활성화 시 초기화 및 기본 프롬프트 로드
    const observer = new MutationObserver(() => {
        if (root.style.display !== 'none') {
            changeStep(1);
            loadWorlds();
            loadPrompts();
        }
    });
    observer.observe(root, { attributes: true, attributeFilter: ['style'] });
    
    api.getSystemPrompt('character-base')
      .then(res => { characterBasePrompt = res.data.content; })
      .catch(e => console.error('Character base prompt 로딩 실패:', e));
}
