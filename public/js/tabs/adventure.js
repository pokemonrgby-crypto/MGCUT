// public/js/tabs/adventure.js
import { api, auth } from '../api.js';
import { withBlocker, ui } from '../ui/frame.js';
import { sessionKeyManager } from '../session-key-manager.js';

const ROOT_SELECTOR = '[data-view="adventure"]';
let myCharacters = [];
let allWorlds = []; // 전체 세계관 목록 캐시
let currentAdventure = {
    id: null,
    graph: null,
    currentNodeKey: null,
    character: null, // 현재 선택된 캐릭터 정보 저장
};

// --- 템플릿 함수들 ---

// 1. 모험 탭 허브 UI
function adventureHubTemplate() {
    return `
    <div class="section-h">모험</div>
    <div class="grid3" style="padding:0 16px 16px">
        <div class="card create-card" data-hub-action="explore">
            <div class="icon"><svg class="ico"><use href="#i-map"/></svg></div>
            <div><div class="t">탐험</div><div class="s">이야기 지도를 따라 모험하기</div></div>
        </div>
        <div class="card create-card" data-hub-action="plaza">
            <div class="icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4c-4.41 0-8 3.59-8 8s3.59 8 8 8 8-3.59 8-8-3.59-8-8-8zm0 14c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm-1-8h2v2h-2v-2zm0 4h2v2h-2v-2z"/></svg></div>
            <div><div class="t">광장</div><div class="s">다른 모험가들과 교류</div></div>
        </div>
        <div class="card create-card" data-hub-action="raid">
            <div class="icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg></div>
            <div><div class="t">레이드</div><div class="s">강력한 적 함께 토벌</div></div>
        </div>
        <div class="card create-card" data-hub-action="inventory">
            <div class="icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-4V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-8-2h4v2h-4V4z"/></svg></div>
            <div><div class="t">가방</div><div class="s">획득한 아이템 확인</div></div>
        </div>
    </div>`;
}

// 2. 캐릭터 선택 화면
function characterSelectTemplate(characters) {
    if (characters.length === 0) {
        return `<div class="card pad" style="margin: 0 16px;">
            <div class="small">모험을 떠날 캐릭터가 없습니다.</div>
            <p>먼저 [생성] 탭에서 캐릭터를 만들어주세요.</p>
            <button id="back-to-hub" class="btn secondary" style="margin-top:12px;">‹ 뒤로가기</button>
        </div>`;
    }
    return `
    <div class="section-h" style="padding-bottom: 12px;">모험을 시작할 캐릭터 선택</div>
    <div class="list" style="padding:0 16px 16px">
        ${characters.map(c => `
        <div class="card character-select-card" data-char-id="${c.id}">
            <div class="bg" style="background-image:url('${c.imageUrl || ''}')"></div>
            <div class="info">
                <div class="name">${c.name}</div>
                <div class="world small">소속: ${c.worldName}</div>
            </div>
        </div>
        `).join('')}
    </div>
    <button id="back-to-hub" class="btn secondary" style="margin:16px;">‹ 뒤로가기</button>
    `;
}

// 3. 탐험할 세계관 선택 화면
function worldSelectTemplate(character) {
    return `
    <div class="section-h">어느 세계관을 탐험할까요?</div>
    <div class="list" style="padding:0 16px 16px;">
        <div class="card info-card" data-world-select-type="my" style="cursor:pointer;">
            <div class="name">내 세계관 탐험하기</div>
            <div class="desc small">${character.worldName}</div>
        </div>
        <div class="card info-card" data-world-select-type="other" style="cursor:pointer;">
            <div class="name">다른 세계관 탐험하기</div>
            <div class="desc small">다른 유저들이 생성한 세계관을 탐험합니다.</div>
        </div>
    </div>
    <button id="back-to-char-select" class="btn secondary" style="margin:16px;">‹ 캐릭터 다시 선택</button>
    `;
}

// 4. 타 세계관 목록
function otherWorldsListTemplate(worlds) {
    return `
    <div class="section-h">탐험할 세계관 선택</div>
    <div class="list" style="padding:0 16px 16px;">
    ${worlds.map(w => `
        <div class="card world-select-card" data-world-id="${w.id}">
            <div class="image-box" style="background-image:url('${w.coverUrl || ''}')"></div>
            <div class="text-box">
              <div class="title">${w.name}</div>
              <div class="desc small">${(w.introShort || '').substring(0, 80)}...</div>
            </div>
        </div>
    `).join('')}
    </div>
    <button id="back-to-world-type-select" class="btn secondary" style="margin:16px;">‹ 뒤로가기</button>
    `;
}

// 5. 명소 선택 화면
function siteSelectTemplate(sites, worldName) {
     if (sites.length === 0) {
        return `<div class="card pad" style="margin: 0 16px;">
            <p>이 세계관에는 아직 탐험할 수 있는 명소가 없습니다.</p>
            <button id="back-to-world-type-select" class="btn secondary" style="margin-top:12px;">‹ 뒤로가기</button>
        </div>`;
    }
    return `
    <div class="section-h" style="padding-bottom: 12px;">${worldName}: 탐험할 명소 선택</div>
    <div class="rail" style="padding-left: 16px; padding-right: 16px;">
        ${sites.map(s => `
        <div class="card site-card" data-site-name="${s.name}" style="cursor:pointer;">
            <div class="bg" style="background-image:url('${s.imageUrl || ''}')"></div>
            <div class="grad"></div>
            <div class="title shadow-title">${s.name}</div>
            <div class="difficulty small">${s.difficulty || 'Normal'}</div>
        </div>
        `).join('')}
    </div>
    <button id="back-to-world-type-select" class="btn secondary" style="margin:16px;">‹ 뒤로가기</button>
    `;
}

// 6. 모험 진행 화면
function adventurePlayTemplate(node) {
     return `
        <div class="adventure-view">
            <div class="situation-card">
                <p>${node.situation.replace(/\n/g, '<br>')}</p>
            </div>
            <div class="choices-list">
                ${(node.choices || []).map((choice) => `
                    <button class="btn choice-btn" data-next-node="${choice.nextNode}">
                        ${choice.text}
                    </button>
                `).join('')}
            </div>
             <button id="back-to-hub" class="btn secondary" style="margin:16px;">‹ 모험 포기</button>
        </div>
     `;
}

// --- 렌더링 함수들 ---

async function renderAdventureHub() {
    const root = document.querySelector(ROOT_SELECTOR);
    root.innerHTML = adventureHubTemplate();
}

async function renderCharacterSelect() {
    const root = document.querySelector(ROOT_SELECTOR);
    root.innerHTML = `<div class="spinner"></div>`;
    try {
        if (myCharacters.length === 0) {
            const res = await api.getMyCharacters();
            myCharacters = res.data || [];
        }
        root.innerHTML = characterSelectTemplate(myCharacters);
    } catch (e) {
        root.innerHTML = `<div class="card pad err" style="margin: 0 16px;">캐릭터 목록을 불러오는 데 실패했습니다: ${e.message}</div>`;
    }
}

async function renderWorldSelect(charId) {
    const character = myCharacters.find(c => c.id === charId);
    if (!character) {
        alert('캐릭터 정보를 찾을 수 없습니다.');
        return renderCharacterSelect();
    }
    currentAdventure.character = character; // 캐릭터 정보 저장
    const root = document.querySelector(ROOT_SELECTOR);
    root.innerHTML = worldSelectTemplate(character);
}

async function renderOtherWorldsList() {
    const root = document.querySelector(ROOT_SELECTOR);
    root.innerHTML = `<div class="spinner"></div>`;
    try {
        if (allWorlds.length === 0) {
            const res = await api.listWorlds();
            allWorlds = (res.data || []).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        }
        root.innerHTML = otherWorldsListTemplate(allWorlds);
    } catch (e) {
        root.innerHTML = `<div class="card pad err">다른 세계관 목록을 불러오는 데 실패했습니다: ${e.message}</div>`;
    }
}

async function renderSiteSelect(worldId) {
    const root = document.querySelector(ROOT_SELECTOR);
    root.innerHTML = `<div class="spinner"></div>`;
    try {
        const res = await api.getWorld(worldId);
        const world = res.data;
        root.innerHTML = siteSelectTemplate(world.sites || [], world.name);
    } catch (e) {
        root.innerHTML = `<div class="card pad err" style="margin: 0 16px;">명소 정보를 불러오는 데 실패했습니다: ${e.message}</div>`;
    }
}

function renderAdventureNode(nodeKey) {
    const root = document.querySelector(ROOT_SELECTOR);
    const node = currentAdventure.graph.nodes[nodeKey];
    if (!node) {
        root.innerHTML = `<div class="card pad err">오류: 다음 노드를 찾을 수 없습니다.</div>`;
        return;
    }
    currentAdventure.currentNodeKey = nodeKey;
    if (node.isEndpoint) {
         root.innerHTML = `
            <div class="adventure-view">
                <div class="situation-card">
                    <h3>에피소드 종료</h3>
                    <p>${node.outcome}</p>
                </div>
                <button id="back-to-hub" class="btn" style="margin:16px;">모험 선택 화면으로</button>
            </div>
         `;
         return;
    }
    root.innerHTML = adventurePlayTemplate(node);
}

// --- 초기화 및 이벤트 핸들링 ---

export function mount() {
    renderAdventureHub(); // 초기 화면은 허브

    const root = document.querySelector(ROOT_SELECTOR);
    root.addEventListener('click', async (e) => {
        const hubCard = e.target.closest('[data-hub-action]');
        if (hubCard) {
            const action = hubCard.dataset.hubAction;
            if (action === 'explore') {
                await withBlocker(renderCharacterSelect);
            } else {
                alert('준비 중인 기능입니다.');
            }
            return;
        }
        
        // 뒤로가기 버튼 처리
        if (e.target.id === 'back-to-hub') {
            await withBlocker(renderAdventureHub);
            return;
        }
        if (e.target.id === 'back-to-char-select') {
            await withBlocker(renderCharacterSelect);
            return;
        }
        if (e.target.id === 'back-to-world-type-select') {
            await withBlocker(() => renderWorldSelect(currentAdventure.character.id));
            return;
        }

        // 캐릭터 선택
        const charCard = e.target.closest('.character-select-card');
        if (charCard) {
            await withBlocker(() => renderWorldSelect(charCard.dataset.charId));
            return;
        }

        // 세계관 종류 선택
        const worldTypeCard = e.target.closest('[data-world-select-type]');
        if (worldTypeCard) {
            const type = worldTypeCard.dataset.worldSelectType;
            if (type === 'my') {
                await withBlocker(() => renderSiteSelect(currentAdventure.character.worldId));
            } else {
                await withBlocker(renderOtherWorldsList);
            }
            return;
        }
        
        // 다른 세계관 목록에서 선택
        const otherWorldCard = e.target.closest('.world-select-card');
        if(otherWorldCard) {
            await withBlocker(() => renderSiteSelect(otherWorldCard.dataset.worldId));
            return;
        }

        // 명소 선택
        const siteCard = e.target.closest('.site-card');
        if (siteCard) {
            const siteName = siteCard.dataset.siteName;
            if (!currentAdventure.character) {
                alert('오류: 캐릭터가 선택되지 않았습니다.');
                return renderCharacterSelect();
            }
            try {
                const password = await sessionKeyManager.getPassword();
                await withBlocker(async () => {
                    const res = await api.startAdventure(currentAdventure.character.id, siteName, password);
                    currentAdventure.id = res.data.adventureId;
                    currentAdventure.graph = res.data.storyGraph;
                    renderAdventureNode(currentAdventure.graph.startNode);
                });
            } catch (err) {
                if (!err.message.includes('사용자가')) {
                    alert(`모험 시작 실패: ${err.message}`);
                }
            }
            return;
        }

        // 모험 중 선택지 클릭
        const choiceBtn = e.target.closest('.choice-btn');
        if (choiceBtn) {
            const nextNodeKey = choiceBtn.dataset.nextNode;
            renderAdventureNode(nextNodeKey);
        }
    });
}
