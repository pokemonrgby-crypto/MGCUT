// public/js/tabs/adventure-combat.js
import { api } from '../api.js';
import { ui } from '../ui/frame.js';

const ROOT_SELECTOR = '[data-view="adventure-combat"]';
let currentAdventureId = null;
let currentCombatState = null;

function combatTemplate(state) {
    if (!state) return '<div class="spinner"></div>';

    const player = state.player;
    const enemy = state.enemy;

    return `
    <div class="combat-view">
        <div class="section-h">전투: ${enemy.name}</div>
        
        <div class="card pad" style="margin: 0 16px 16px; min-height: 150px; max-height: 300px; overflow-y: auto;" id="combat-log-area">
            ${state.log.map(line => `<p class="small">${line}</p>`).join('')}
        </div>

        <div class="card pad" style="margin: 0 16px;">
            <div class="tabs small">
                <button class="tab on" data-action-tab="skills">스킬</button>
                <button class="tab" data-action-tab="items">아이템</button>
                <button class="tab" data-action-tab="etc">기타</button>
            </div>
            <div class="action-panels">
                <div class="action-panel skills active">
                    ${player.skills.map(s => `<button class="btn full combat-action-btn" data-action-type="skill" data-action-id="${s.id}">${s.name}</button>`).join('')}
                </div>
                <div class="action-panel items" style="display:none;">
                     ${player.items.map(i => `<button class="btn full combat-action-btn" data-action-type="item" data-action-id="${i.id}">${i.name} (${i.grade})</button>`).join('')}
                </div>
                <div class="action-panel etc" style="display:none;">
                    <button class="btn full secondary combat-action-btn" data-action-type="flee">도망치기</button>
                </div>
            </div>
        </div>
    </div>
    `;
}

function render(state) {
    const root = document.querySelector(ROOT_SELECTOR);
    root.innerHTML = combatTemplate(state);

    // 로그 창 항상 아래로 스크롤
    const logArea = root.querySelector('#combat-log-area');
    if (logArea) {
        logArea.scrollTop = logArea.scrollHeight;
    }

    // 탭 전환 이벤트 바인딩
    root.querySelectorAll('.tabs .tab').forEach(btn => {
        btn.onclick = () => {
            root.querySelectorAll('.tabs .tab').forEach(b => b.classList.remove('on'));
            btn.classList.add('on');
            const targetPanelClass = btn.dataset.actionTab;
            root.querySelectorAll('.action-panel').forEach(p => {
                p.style.display = p.classList.contains(targetPanelClass) ? '' : 'none';
            });
        };
    });
}

async function takeTurn(action) {
    ui.busy(true);
    const loadingTimer = new Promise(resolve => setTimeout(resolve, 5000)); // 최소 5초 로딩
    
    try {
        const apiCall = api.takeCombatTurn(currentAdventureId, action);
        const [_, res] = await Promise.all([loadingTimer, apiCall]);

        if (res.ok) {
            currentCombatState = res.data.combatState;
            render(currentCombatState);
        } else {
            throw new Error(res.error || '턴 진행에 실패했습니다.');
        }
    } catch (e) {
        alert(`오류: ${e.message}`);
    } finally {
        ui.busy(false);
    }
}


export function mount(adventureId) {
    currentAdventureId = adventureId;
    const root = document.querySelector(ROOT_SELECTOR);
    root.innerHTML = '<div class="spinner"></div>';

    // 저장된 전투 상태를 가져와서 렌더링
    api.getAdventure(adventureId).then(res => {
        if (res.ok && res.data.combatState) {
            currentCombatState = res.data.combatState;
            render(currentCombatState);
        } else {
           root.innerHTML = `<div class="card pad err">전투 정보를 불러올 수 없습니다.</div>`;
        }
    });

    if (root.dataset.listener) return;
    root.dataset.listener = 'true';

    root.addEventListener('click', e => {
        const actionBtn = e.target.closest('.combat-action-btn');
        if (actionBtn) {
            const action = {
                type: actionBtn.dataset.actionType,
                id: actionBtn.dataset.actionId
            };
            takeTurn(action);
        }
    });
}
