// public/js/tabs/create-character.js
import { api, storage } from '../api.js';
import { withBlocker, ui } from '../ui/frame.js';
import { callClientSideGemini } from '../lib/gemini-client.js';

const rootSel = '[data-view="create-character"]';
let worldsCache = [];
let promptsCache = [];
let characterBasePrompt = '';
let selectedWorld = null;
let selectedPrompt = null;

// 카드 템플릿
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
    </div>
    `;
}

function promptCardTemplate(p) {
    return `
    <div class="card info-card prompt-select-card" data-id="${p.id}">
        <div class="name">${p.title}</div>
        <div class="desc small">${p.content.substring(0, 100)}...</div>
    </div>
    `;
}

// [수정] 서버의 buildWorldText와 유사한 역할을 하는 클라이언트 함수 -> 전체 정보 포함하도록 수정
function buildWorldTextForAI(w){
  if (!w) return '';
  // 객체에서 주요 정보를 추출하여 텍스트로 변환
  const worldInfo = {
    name: w.name,
    introShort: w.introShort,
    introLong: w.introLong,
    sites: (w.sites || []).map(s => ({ name: s.name, description: s.description })),
    factions: (w.factions || []).map(f => ({ name: f.name, description: f.description })),
    npcs: (w.npcs || []).map(n => ({ name: n.name, description: n.description })),
    episodes: (w.episodes || []).map(e => ({ title: e.title, summary: e.content.replace(/<[^>]+>/g, "").substring(0, 200) + '...' }))
  };

  // JSON.stringify를 사용하여 가독성 좋은 문자열로 변환
  return JSON.stringify(worldInfo, null, 2);
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
            worldsCache = (res.data || []).sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            renderWorlds();
        } catch (e) {
            worldListEl.innerHTML = `<div class="card pad err">세계관 로딩 실패: ${e.message}</div>`;
        }
    };

    searchInput.oninput = renderWorlds;

    worldListEl.onclick = async (e) => {
        const card = e.target.closest('.world-select-card');
        if (!card) {
            const imgCard = e.target.closest('.world-image-card');
            if (imgCard) window.location.hash = `#world/${imgCard.dataset.id}`;
            return;
        }

        const worldId = card.dataset.id;
        
        await withBlocker(async () => {
          const worldRes = await api.getWorld(worldId);
          selectedWorld = worldRes.data;
          
          selectedWorldInfoEl.innerHTML = `
              <div class="card world-image-card" data-id="${selectedWorld.id}" style="aspect-ratio: 1/1; background: url('${selectedWorld.coverUrl}') center/cover; cursor:pointer;" title="클릭하여 세계관 정보 보기"></div>
              <h3 style="margin-top:12px;">${selectedWorld.name}</h3>
              <p class="small" style="opacity:0.8; line-height:1.6;">${selectedWorld.introShort}</p>
          `;
        });
        
        changeStep(2);
    };

    // --- 2단계 로직: 프롬프트 선택 ---
    const loadPrompts = async () => {
        // 기본 제공 프롬프트 정의
        const defaultPrompt = {
            id: 'default-basic',
            title: '⭐ 기본 프롬프트',
            content: '사용자의 입력에 따라 자유롭게 캐릭터의 서사를 구성합니다. 캐릭터의 개성이 잘 드러나도록 외형, 성격, 배경을 구체적으로 묘사해주세요.',
            lastValidatedAt: new Date().toISOString() // 검증된 것으로 간주
        };

        try {
            const res = await api.listPrompts();
            const fetchedPrompts = (res.data || []).filter(p => p.lastValidatedAt);
            promptsCache = [defaultPrompt, ...fetchedPrompts];
            
            promptListEl.innerHTML = promptsCache.map(promptCardTemplate).join('') || '<div class="card pad small">사용 가능한 (검증된) 프롬프트가 없습니다.</div>';
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
        if (!root.querySelector('#cc-char-name').value.trim()) return alert('캐릭터 이름을 입력해주세요.');
        if (!characterBasePrompt) return alert('캐릭터 기본 프롬프트를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');

        const worldText = buildWorldTextForAI(selectedWorld);
        const promptText = selectedPrompt.content;
        const userInputText = `캐릭터 이름: ${root.querySelector('#cc-char-name').value.trim()}\n추가 요청: ${root.querySelector('#cc-char-input').value.trim()}`;
        
        const composedUser = [
            `### 세계관 정보 (JSON)`, worldText,
            `### 생성 프롬프트`, promptText,
            `### 사용자 요청`, userInputText,
            `\n\n위 정보를 바탕으로 JSON 스키마에 맞춰 캐릭터를 생성해줘.`,
        ].join('\n\n');

        try {
            await withBlocker(async () => {
                const imageFile = root.querySelector('#cc-char-image').files[0];
                let imageUrl = '';
                if (imageFile) {
                    imageUrl = await storage.uploadImage(`characters/${Date.now()}_${imageFile.name}`, imageFile);
                }

                const characterJson = await callClientSideGemini({
                    system: characterBasePrompt,
                    user: composedUser
                });
                
                if (!characterJson) throw new Error('AI가 유효한 JSON을 생성하지 못했습니다. 모델이나 프롬프트를 확인해주세요.');
                
                const res = await api.saveCharacter({
                    worldId: selectedWorld.id,
                    promptId: selectedPrompt.id === 'default-basic' ? null : selectedPrompt.id, // 기본 프롬프트는 ID 저장 안함
                    characterData: characterJson,
                    imageUrl: imageUrl
                });

                alert(`캐릭터 생성 성공! (ID: ${res.data.id})`);
                window.location.hash = '#home';
            });
        } catch (e) {
            alert(`생성 실패: ${e.message}`);
            console.error(e);
        }
    };

    // 뒤로가기 버튼
    root.querySelector('#cc-btn-back-to-step1').onclick = () => changeStep(1);
    root.querySelector('#cc-btn-back-to-step2').onclick = () => changeStep(2);

    // 뷰가 활성화될 때마다 초기화
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
