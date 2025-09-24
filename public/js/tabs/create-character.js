// public/js/tabs/create-character.js
import { api, storage, auth } from '../api.js';
import { withBlocker, ui } from '../ui/frame.js';
import { sessionKeyManager } from '../session-key-manager.js';

const rootSel = '[data-view="create-character"]';
let worldsCache = [];
let promptsCache = [];
let selectedWorld = null;
let selectedPrompt = null;

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
                <div 
                    class="card world-image-card" 
                    data-id="${selectedWorld.id}" 
                    style="aspect-ratio: 1/1; background: url('${selectedWorld.coverUrl || ''}') center/cover; cursor:pointer;" 
                    title="클릭하여 세계관 정보 보기"
                ></div>
                <h3 style="margin-top:12px;">${selectedWorld.name}</h3>
                <p class="small" style="opacity:0.8; line-height:1.6;">${selectedWorld.introShort}</p>
            `;
        });
        changeStep(2);
    };
    
    selectedWorldInfoEl.onclick = (e) => {
        const card = e.target.closest('.world-image-card');
        if (card && card.dataset.id) {
            window.location.hash = `#world/${card.dataset.id}`;
        }
    };

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

    root.querySelector('#btn-char-create-final').onclick = async () => {
        if (!selectedWorld || !selectedPrompt) return alert('세계관과 프롬프트가 올바르게 선택되지 않았습니다.');
        const characterName = root.querySelector('#cc-char-name').value.trim();
        if (!characterName) return alert('캐릭터 이름을 입력해주세요.');

        try {
            await withBlocker(async () => {
                const decryptedKey = await sessionKeyManager.getDecryptedKey();
                
                const imageFile = root.querySelector('#cc-char-image').files[0];
                let imageUrl = '';
                if (imageFile) {
                    const userId = auth.currentUser?.uid;
                    if (!userId) throw new Error('이미지를 업로드하려면 로그인이 필요합니다.');
                    imageUrl = await storage.uploadImage(`characters/${userId}`, imageFile);
                }

                const payload = {
                    worldId: selectedWorld.id,
                    promptId: selectedPrompt.id === 'default-basic' ? null : selectedPrompt.id,
                    userInput: {
                      name: characterName,
                      request: root.querySelector('#cc-char-input').value.trim(),
                    },
                    imageUrl: imageUrl
                };
                
                const res = await api.generateCharacter(payload, decryptedKey);

                alert(`캐릭터 생성 성공! (ID: ${res.data.id})`);
                ui.navTo(`character/${res.data.id}`);
            });
        } catch (e) {
            if (e.message.includes('COOLDOWN')) {
                alert('캐릭터를 너무 자주 생성하고 있습니다. 잠시 후 다시 시도해주세요.');
            } else {
                alert(`생성 실패: ${e.message}`);
            }
            console.error(e);
        }
    };

    root.querySelector('#cc-btn-back-to-step1').onclick = () => changeStep(1);
    root.querySelector('#cc-btn-back-to-step2').onclick = () => changeStep(2);

    const observer = new MutationObserver(() => {
        if (root.style.display !== 'none') {
            changeStep(1);
            loadWorlds();
            loadPrompts();
        }
    });
    observer.observe(root, { attributes: true, attributeFilter: ['style'] });
}
