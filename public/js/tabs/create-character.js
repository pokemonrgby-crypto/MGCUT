// public/js/tabs/create-character.js
import { api } from '../api.js';
import { withBlocker, ui } from '../ui/frame.js';

const rootSel = '[data-view="create-character"]';
let worldsCache = [];
let promptsCache = [];
let selectedWorld = null;
let selectedPrompt = null;

// [수정] 개선된 카드 디자인을 위한 템플릿
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

// 프롬프트 카드 템플릿
function promptCardTemplate(p) {
    return `
    <div class="card info-card prompt-select-card" data-id="${p.id}">
        <div class="name">${p.title}</div>
        <div class="desc small">${p.content.substring(0, 100)}...</div>
    </div>
    `;
}

export function mount() {
    const root = document.querySelector(rootSel);
    if (!root || root.dataset.mounted === '1') return;
    root.dataset.mounted = '1';

    // 뷰 및 요소 캐싱
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
            // 최신순으로 정렬
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
        selectedWorld = worldsCache.find(w => w.id === worldId);
        
        await withBlocker(async () => {
          const worldRes = await api.getWorld(worldId);
          selectedWorld = worldRes.data;
          
          selectedWorldInfoEl.innerHTML = `
              <div class="card world-image-card" data-id="${selectedWorld.id}" style="aspect-ratio: 1/1; background: url('${selectedWorld.coverUrl}') center/cover; cursor:pointer;" title="클릭하여 세계관 정보 보기"></div>
              <h3 style="margin-top:12px;">${selectedWorld.name}</h3>
              <p class="small" style="opacity:0.8; line-height:1.6;">${selectedWorld.introLong || selectedWorld.introShort}</p>
          `;
        });
        
        changeStep(2);
    };

    // --- 2단계 로직: 프롬프트 선택 ---
    const loadPrompts = async () => {
        try {
            const res = await api.listPrompts();
            // [중요] 검증된 프롬프트만 필터링
            promptsCache = (res.data || []).filter(p => p.lastValidatedAt);
            promptListEl.innerHTML = promptsCache.map(promptCardTemplate).join('') || '<div class="card pad small">사용 가능한 (검증된) 프롬프트가 없습니다.</div>';
        } catch (e) {
            promptListEl.innerHTML = `<div class="card pad err">프롬프트 로딩 실패: ${e.message}</div>`;
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
        const userInput = `캐릭터 이름: ${root.querySelector('#cc-char-name').value.trim()}\n추가 요청: ${root.querySelector('#cc-char-input').value.trim()}`;
        const imageFile = root.querySelector('#cc-char-image').files[0];

        if (!selectedWorld?.id || !selectedPrompt?.id) return alert('세계관과 프롬프트가 올바르게 선택되지 않았습니다.');
        if (!root.querySelector('#cc-char-name').value.trim()) return alert('캐릭터 이름을 입력해주세요.');
        // TODO: 이미지 업로드 로직은 별도 구현 필요 (e.g. Firebase Storage)
        if(imageFile) {
            alert('이미지 업로드 기능은 아직 지원되지 않습니다.');
            console.log("선택된 이미지 파일:", imageFile);
        }

        try {
            const res = await withBlocker(() => api.createCharacter({
                worldId: selectedWorld.id,
                promptId: selectedPrompt.id,
                userInput,
            }));
            alert(`캐릭터 생성 성공! (ID: ${res.data.id})`);
            window.location.hash = '#home';
        } catch (e) {
            alert(`생성 실패: ${e.message}`);
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
            loadPrompts(); // 미리 로드
        }
    });
    observer.observe(root, { attributes: true, attributeFilter: ['style'] });
}
