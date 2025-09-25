// (수정된 결과)
// public/js/tabs/adventure.js
import { api, auth } from '../api.js';
import { withBlocker, ui } from '../ui/frame.js';
import { sessionKeyManager } from '../session-key-manager.js';

const ROOT_SELECTOR = '[data-view="adventure"]';
let myCharacters = [];
let allWorlds = [];
let currentAdventure = {
    id: null,
    graph: null,
    currentNodeKey: null,
    character: null,
    characterState: null,
    // [추가] 현재 선택된 세계관 ID를 임시 저장
    selectedWorldId: null, 
};

// --- 템플릿 함수들 ---

// (1, 2, 3, 4번 템플릿은 기존과 동일)
function adventureHubTemplate() {
    return `
    <div class="section-h">모험</div>
    <div class="grid3" style="padding:0 16px 16px">
        <div class="card create-card" data-hub-action="explore">
            <div class="icon"><svg class="ico"><use href="#i-map"/></svg></div>
            <div><div class="t">탐험</div><div class="s">이야기 지도를 따라 모험하기</div></div>
        </div>
        <div class="card create-card disabled" data-hub-action="plaza">
            <div class="icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4c-4.41 0-8 3.59-8 8s3.59 8 8 8 8-3.59 8-8-3.59-8-8-8zm0 14c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm-1-8h2v2h-2v-2zm0 4h2v2h-2v-2z"/></svg></div>
            <div><div class="t">광장</div><div class="s">준비 중...</div></div>
        </div>
        <div class="card create-card disabled" data-hub-action="raid">
            <div class="icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg></div>
            <div><div class="t">레이드</div><div class="s">준비 중...</div></div>
        </div>
        <div class="card create-card disabled" data-hub-action="inventory">
            <div class="icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-4V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-8-2h4v2h-4V4z"/></svg></div>
            <div><div class="t">가방</div><div class="s">준비 중...</div></div>
        </div>
    </div>`;
}

function characterSelectTemplate(characters) {
    if (characters.length === 0) {
        return `<div class="card pad" style="margin: 0 16px;">
            <div class="small">모험을 떠날 캐릭터가 없습니다.</div>
            <p>먼저 [생성] 탭에서 캐릭터를 만들어주세요.</p>
            <button class="btn secondary back-btn" data-target="hub" style="margin-top:12px;">‹ 뒤로가기</button>
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
            ${c.ongoingAdventure ? `
            <div class="ongoing-adventure-badge">
                <button class="btn small resume-btn" data-char-id="${c.id}">모험 계속하기</button>
            </div>
            ` : ''}
        </div>
        `).join('')}
    </div>
    <button class="btn secondary back-btn" data-target="hub" style="margin:16px;">‹ 뒤로가기</button>
    `;
}

function worldSelectTemplate(character) {
    return `
    <div class="section-h">어느 세계관을 탐험할까요?</div>
    <div class="list" style="padding:0 16px 16px;">
        <div class="card info-card world-select-card" data-world-select-type="my" style="cursor:pointer;">
            <div class="name">내 세계관 탐험하기</div>
            <div class="desc small">${character.worldName}</div>
        </div>
        <div class="card info-card world-select-card" data-world-select-type="other" style="cursor:pointer;">
            <div class="name">다른 세계관 탐험하기</div>
            <div class="desc small">다른 유저들이 생성한 세계관을 탐험합니다.</div>
        </div>
    </div>
    <button class="btn secondary back-btn" data-target="char-select" style="margin:16px;">‹ 캐릭터 다시 선택</button>
    `;
}

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
    <button class="btn secondary back-btn" data-target="world-type-select" style="margin:16px;">‹ 뒤로가기</button>
    `;
}


// 5. 명소 선택 화면
function siteSelectTemplate(sites, worldName) {
     if (sites.length === 0) {
        return `<div class="card pad" style="margin: 0 16px;">
            <p>이 세계관에는 아직 탐험할 수 있는 명소가 없습니다.</p>
            <button class="btn secondary back-btn" data-target="world-type-select" style="margin-top:12px;">‹ 뒤로가기</button>
        </div>`;
    }
    // [수정] 명소 카드에 상세 설명을 포함한 data-site-json 속성 추가
    return `
    <div class="section-h" style="padding-bottom: 12px;">${worldName}: 탐험할 명소 선택</div>
    <div class="rail" style="padding-left: 16px; padding-right: 16px;">
        ${sites.map(s => `
        <div class="card site-card" data-site-json='${JSON.stringify(s)}' style="cursor:pointer;">
            <div class="bg" style="background-image:url('${s.imageUrl || ''}')"></div>
            <div class="grad"></div>
            <div class="title shadow-title">${s.name}</div>
            <div class="difficulty small">${s.difficulty || 'Normal'}</div>
        </div>
        `).join('')}
    </div>
    <button class="btn secondary back-btn" data-target="world-type-select" style="margin:16px;">‹ 뒤로가기</button>
    `;
}

// 6. 모험 진행 화면
function adventurePlayTemplate(node, characterState) {
    const staminaBar = `
        <div class="stamina-bar">
            <div class="label">STAMINA</div>
            <div class="bar-bg">
                <div class="bar-fill" style="width: ${characterState.stamina}%;"></div>
            </div>
            <div class="value">${characterState.stamina} / 100</div>
        </div>`;

    if (node.isEndpoint) {
         return `
            <div class="adventure-view">
                ${staminaBar}
                <div class="situation-card">
                    <h3>에피소드 종료</h3>
                    <p>${node.outcome}</p>
                </div>
                <button class="btn back-btn" data-target="hub" style="margin:16px 0;">모험 선택 화면으로</button>
            </div>
         `;
    }

    return `
    <div class="adventure-view">
        ${staminaBar}
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
         <button class="btn secondary back-btn" data-target="hub" style="margin:16px 0;">‹ 모험 포기</button>
    </div>`;
}

// --- 렌더링 함수들 ---

async function renderView(viewName, ...args) {
    const root = document.querySelector(ROOT_SELECTOR);
    root.innerHTML = `<div class="spinner"></div>`;
    try {
        let content = '';
        switch(viewName) {
            case 'hub':
                content = adventureHubTemplate();
                break;
            case 'char-select':
                if (myCharacters.length === 0) {
                    const res = await api.getMyCharacters();
                    myCharacters = res.data || [];
                }
                const ongoingAdventures = await Promise.all(
                    myCharacters.map(c => api.getCharacterAdventures(c.id, true))
                );
                myCharacters.forEach((c, i) => {
                    c.ongoingAdventure = ongoingAdventures[i].data;
                });
                content = characterSelectTemplate(myCharacters);
                break;
            case 'world-type-select':
                const charId = args[0];
                const character = myCharacters.find(c => c.id === charId);
                if (!character) throw new Error('캐릭터 정보를 찾을 수 없습니다.');
                currentAdventure.character = character;
                content = worldSelectTemplate(character);
                break;
            case 'other-worlds':
                 if (allWorlds.length === 0) {
                    const res = await api.listWorlds();
                    allWorlds = (res.data || []).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
                }
                content = otherWorldsListTemplate(allWorlds);
                break;
            case 'site-select':
                const worldId = args[0];
                currentAdventure.selectedWorldId = worldId; // [수정] 선택한 월드 ID 저장
                const res = await api.getWorld(worldId);
                const world = res.data;
                content = siteSelectTemplate(world.sites || [], world.name);
                break;
            case 'play':
                const { graph, nodeKey, characterState } = args[0];
                currentAdventure.graph = graph;
                currentAdventure.currentNodeKey = nodeKey;
                currentAdventure.characterState = characterState;
                const node = graph.nodes[nodeKey];
                content = adventurePlayTemplate(node, characterState);
                break;
        }
        root.innerHTML = content;
    } catch(e) {
        root.innerHTML = `<div class="card pad err" style="margin: 0 16px;">오류: ${e.message}</div>`;
    }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// [신규] 명소 확인 모달을 생성하고 표시하는 함수
function showSiteConfirmModal(site) {
    // 기존 모달 제거
    document.querySelector('.site-confirm-modal')?.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-layer site-confirm-modal';
    modal.innerHTML = `
      <div class="modal-card">
        <button class="modal-close" aria-label="닫기">×</button>
        <div class="modal-body">
          <h3>${site.name}</h3>
          <p class="small" style="margin-top:4px;">난이도: ${site.difficulty || 'Normal'}</p>
          <p style="margin-top:12px; white-space: pre-wrap;">${site.description}</p>
          <button id="btn-start-adventure-confirm" class="btn full" style="margin-top:16px;">탐험 시작</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-layer') || e.target.classList.contains('modal-close')) {
            modal.remove();
        }
    });
    
    return new Promise((resolve) => {
        modal.querySelector('#btn-start-adventure-confirm').onclick = () => {
            modal.remove();
            resolve(true); // 시작 확정
        };
    });
}

export function mount() {
    const root = document.querySelector(ROOT_SELECTOR);
    if (root.dataset.eventListenerAttached === 'true') {
        renderView('hub');
        return;
    }

    renderView('hub');

    root.addEventListener('click', async (e) => {
        const target = e.target;
        const targetCard = target.closest('.card');
        if (targetCard && targetCard.classList.contains('disabled')) return;
        
        e.preventDefault();

        const backBtn = target.closest('.back-btn');
        if (backBtn) {
            const targetView = backBtn.dataset.target;
            // ... (뒤로가기 로직)
            return;
        }

        const hubCard = target.closest('[data-hub-action]');
        if (hubCard) {
            if (hubCard.dataset.hubAction === 'explore') await withBlocker(() => renderView('char-select'));
            return;
        }

        const charCard = target.closest('.character-select-card:not(:has(.resume-btn))');
        if (charCard) {
            await withBlocker(() => renderView('world-type-select', charCard.dataset.charId));
            return;
        }

        const resumeBtn = target.closest('.resume-btn');
        if (resumeBtn) {
            // ... (이어하기 로직)
            return;
        }

        // [수정] '다른 세계관 탐험' 버그 수정
        const worldSelectCard = target.closest('.world-select-card');
        if (worldSelectCard) {
            const type = worldSelectCard.dataset.worldSelectType;
            if (type === 'my') {
                await withBlocker(() => renderView('site-select', currentAdventure.character.worldId));
            } else if (type === 'other') {
                await withBlocker(() => renderView('other-worlds'));
            } else if (worldSelectCard.dataset.worldId) { // '다른 세계관 목록'에서 선택 시
                await withBlocker(() => renderView('site-select', worldSelectCard.dataset.worldId));
            }
            return;
        }

        // [수정] 명소 카드 클릭 시 모달 표시
        const siteCard = target.closest('.site-card');
        if (siteCard) {
            const site = JSON.parse(siteCard.dataset.siteJson);
            const confirmed = await showSiteConfirmModal(site);

            if (confirmed) {
                if (!currentAdventure.character) return alert('오류: 캐릭터가 선택되지 않았습니다.');
                
                try {
                    const password = await sessionKeyManager.getPassword();
                    await withBlocker(async () => {
                        const res = await api.startAdventure({
                            characterId: currentAdventure.character.id,
                            worldId: currentAdventure.selectedWorldId, // 현재 선택된 월드 ID 사용
                            siteName: site.name,
                            password
                        });
                        currentAdventure.id = res.data.adventureId;
                        await renderView('play', {
                            graph: res.data.storyGraph,
                            nodeKey: res.data.storyGraph.startNode,
                            characterState: res.data.characterState
                        });
                    });
                } catch (err) {
                    if (!err.message.includes('사용자가')) alert(`모험 시작 실패: ${err.message}`);
                }
            }
            return;
        }

        const choiceBtn = target.closest('.choice-btn');
        if (choiceBtn) {
            const nextNodeKey = choiceBtn.dataset.nextNode;
            await withBlocker(async () => {
                await sleep(700);
                const res = await api.proceedAdventure(currentAdventure.id, { nextNodeKey });
                const { newNode, newCharacterState } = res.data;
                currentAdventure.currentNodeKey = nextNodeKey;
                currentAdventure.characterState = newCharacterState;
                await renderView('play', {
                    graph: currentAdventure.graph,
                    nodeKey: nextNodeKey,
                    characterState: newCharacterState,
                });
            });
        }
    });

    root.dataset.eventListenerAttached = 'true';
}
