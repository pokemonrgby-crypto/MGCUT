// (수정된 결과)
// public/js/tabs/adventure.js
import { api, auth } from '../api.js';
import { withBlocker, ui } from '../ui/frame.js';
import { sessionKeyManager } from '../session-key-manager.js';

const ROOT_SELECTOR = '[data-view="adventure"]';
let myCharacters = [];
let currentAdventure = {
    id: null,
    graph: null,
    currentNodeKey: null
};

// 캐릭터 선택 화면 템플릿
function characterSelectTemplate(characters) {
    if (characters.length === 0) {
        return `<div class="card pad" style="margin: 0 16px;">
            <div class="small">모험을 떠날 캐릭터가 없습니다.</div>
            <p>먼저 [생성] 탭에서 캐릭터를 만들어주세요.</p>
        </div>`;
    }
    return `
    <div class="section-h" style="padding-bottom: 12px;">모험을 시작할 캐릭터 선택</div>
    <div class="list" style="padding:0 16px 16px">
        ${characters.map(c => `
        <div class="card character-select-card" data-char-id="${c.id}" data-world-id="${c.worldId}">
            <div class="bg" style="background-image:url('${c.imageUrl || ''}')"></div>
            <div class="info">
                <div class="name">${c.name}</div>
                <div class="world small">소속: ${c.worldName}</div>
            </div>
        </div>
        `).join('')}
    </div>`;
}

// 명소 선택 화면 템플릿
function siteSelectTemplate(sites, worldName) {
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
    <button id="back-to-char-select" class="btn secondary" style="margin:16px;">‹ 캐릭터 다시 선택</button>
    `;
}

// 모험 진행 화면 템플릿
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
             <button id="back-to-char-select" class="btn secondary" style="margin:16px;">‹ 모험 포기</button>
        </div>
     `;
}


async function renderCharacterSelect() {
    const root = document.querySelector(ROOT_SELECTOR);
    root.innerHTML = `<div class="spinner"></div>`;
    try {
        const res = await api.getMyCharacters();
        myCharacters = res.data || [];
        root.innerHTML = characterSelectTemplate(myCharacters);
    } catch (e) {
        root.innerHTML = `<div class="card pad err" style="margin: 0 16px;">캐릭터 목록을 불러오는 데 실패했습니다: ${e.message}</div>`;
    }
}

async function renderSiteSelect(worldId) {
    const root = document.querySelector(ROOT_SELECTOR);
    root.innerHTML = `<div class="spinner"></div>`;
    try {
        const res = await api.getWorld(worldId);
        const world = res.data;
        const sites = world.sites || [];
        if (sites.length === 0) {
            root.innerHTML = `<div class="card pad" style="margin: 0 16px;">
                <p>이 세계관에는 아직 탐험할 수 있는 명소가 없습니다.</p>
                <button id="back-to-char-select" class="btn secondary" style="margin-top:12px;">‹ 캐릭터 다시 선택</button>
            </div>`;
        } else {
            root.innerHTML = siteSelectTemplate(sites, world.name);
        }
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
    
    // TODO: 전투 노드 및 엔드포인트 처리
    if (node.isEndpoint) {
         root.innerHTML = `
            <div class="adventure-view">
                <div class="situation-card">
                    <h3>에피소드 종료</h3>
                    <p>${node.outcome}</p>
                </div>
                <button id="back-to-char-select" class="btn" style="margin:16px;">모험 선택 화면으로</button>
            </div>
         `;
         return;
    }

    root.innerHTML = adventurePlayTemplate(node);
}

export function mount() {
    renderCharacterSelect();

    const root = document.querySelector(ROOT_SELECTOR);
    root.addEventListener('click', async (e) => {
        const charCard = e.target.closest('.character-select-card');
        if (charCard) {
            const worldId = charCard.dataset.worldId;
            if (!worldId) {
                alert('이 캐릭터는 소속된 세계관이 없어 모험을 떠날 수 없습니다.');
                return;
            }
            sessionStorage.setItem('adventure_char_id', charCard.dataset.charId);
            await withBlocker(() => renderSiteSelect(worldId));
            return;
        }

        if (e.target.id === 'back-to-char-select') {
            sessionStorage.removeItem('adventure_char_id');
            currentAdventure.id = null; // 모험 상태 초기화
            await withBlocker(renderCharacterSelect);
            return;
        }

        const siteCard = e.target.closest('.site-card');
        if (siteCard) {
            const siteName = siteCard.dataset.siteName;
            const charId = sessionStorage.getItem('adventure_char_id');
            if (!charId) {
                alert('오류: 캐릭터가 선택되지 않았습니다.');
                return renderCharacterSelect();
            }

            try {
                const password = await sessionKeyManager.getPassword();
                await withBlocker(async () => {
                    const res = await api.startAdventure(charId, siteName, password);
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

        const choiceBtn = e.target.closest('.choice-btn');
        if (choiceBtn) {
            const nextNodeKey = choiceBtn.dataset.nextNode;
            renderAdventureNode(nextNodeKey);
        }
    });
}
