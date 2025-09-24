// public/js/tabs/create-character.js
import { api, storage } from '../api.js';
import { withBlocker, ui } from '../ui/frame.js';

const rootSel = '[data-view="create-character"]';
let worldsCache = [];
let promptsCache = [];
let selectedWorld = null;
let selectedPrompt = null;

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

    const changeStep = (targetStep) => { /* ... 기존과 동일 ... */ };

    // --- 1단계 로직: 세계관 선택 ---
    const renderWorlds = () => { /* ... 기존과 동일 ... */ };
    const loadWorlds = async () => { /* ... 기존과 동일 ... */ };
    searchInput.oninput = renderWorlds;
    worldListEl.onclick = async (e) => { /* ... 기존과 동일 ... */ };

    // --- 2단계 로직: 프롬프트 선택 ---
    const loadPrompts = async () => { /* ... 기존과 동일 ... */ };
    promptListEl.onclick = (e) => { /* ... 기존과 동일 ... */ };

    // --- 3단계 로직: 정보 입력 및 생성 ---
    root.querySelector('#btn-char-create-final').onclick = async () => {
        if (!selectedWorld || !selectedPrompt) return alert('세계관과 프롬프트가 올바르게 선택되지 않았습니다.');
        const characterName = root.querySelector('#cc-char-name').value.trim();
        if (!characterName) return alert('캐릭터 이름을 입력해주세요.');

        try {
            await withBlocker(async () => {
                const imageFile = root.querySelector('#cc-char-image').files[0];
                let imageUrl = '';
                if (imageFile) {
                    const userId = auth.currentUser?.uid;
                    if (!userId) throw new Error('로그인이 필요합니다.');
                    imageUrl = await storage.uploadImage(`characters/${userId}`, imageFile);
                }

                const res = await api.generateCharacter({
                    worldId: selectedWorld.id,
                    promptId: selectedPrompt.id === 'default-basic' ? null : selectedPrompt.id,
                    userInput: {
                      name: characterName,
                      request: root.querySelector('#cc-char-input').value.trim(),
                    },
                    imageUrl: imageUrl
                });

                alert(`캐릭터 생성 성공! (ID: ${res.data.id})`);
                ui.navTo(`character/${res.data.id}`);
            });
        } catch (e) {
            if (e.message === 'COOLDOWN') {
                alert('캐릭터를 너무 자주 생성하고 있습니다. 잠시 후 다시 시도해주세요.');
            } else {
                alert(`생성 실패: ${e.message}`);
            }
            console.error(e);
        }
    };

    // 뒤로가기 버튼
    root.querySelector('#cc-btn-back-to-step1').onclick = () => changeStep(1);
    root.querySelector('#cc-btn-back-to-step2').onclick = () => changeStep(2);

    // 뷰 활성화 시 초기화
    const observer = new MutationObserver(() => {
        if (root.style.display !== 'none') {
            changeStep(1);
            loadWorlds();
            loadPrompts();
        }
    });
    observer.observe(root, { attributes: true, attributeFilter: ['style'] });
}

// 기존 카드 템플릿 함수들은 여기에 그대로 둡니다.
function worldCardTemplate(w) {
    const desc = (w.introShort || '');
    const shortDesc = desc.substring(0, 80);
    return `<div class="card world-select-card" data-id="${w.id}"><div class="image-box" style="background-image:url('${w.coverUrl || ''}')"></div><div class="text-box"><div class="title">${w.name}</div><div class="desc">${shortDesc}${desc.length > 80 ? '...' : ''}</div></div></div>`;
}
function promptCardTemplate(p) {
    return `<div class="card info-card prompt-select-card" data-id="${p.id}"><div class="name">${p.title}</div><div class="desc small">${p.content.substring(0, 100)}...</div></div>`;
}
