// public/js/tabs/adventure-combat.js
import { api } from '../api.js';
import { ui, withBlocker } from '../ui/frame.js';

const ROOT_SELECTOR = '[data-view="adventure-combat"]';
let currentAdventureId = null;
let currentCombatState = null;

function healthBarTemplate(entity) {
    const healthPercent = (entity.health / entity.maxHealth) * 100;
    return `
    <div class="combat-entity-bar">
        <div class="name">${entity.name}</div>
        <div class="hp-bar">
            <div class="bar-bg"><div class="bar-fill" style="width: ${healthPercent}%;"></div></div>
            <div class="value">${entity.health} / ${entity.maxHealth}</div>
        </div>
    </div>
    `;
}

function combatTemplate(state) {
    if (!state) return '<div class="spinner"></div>';

    const player = state.player;
    const enemy = state.enemy;

    if (state.status !== 'ongoing') {
        let resultTitle = '';
        let resultMessage = '';
        if (state.status === 'won') {
            resultTitle = '승리!';
            resultMessage = '적을 물리치고 모험을 계속합니다.';
        } else if (state.status === 'lost') {
            resultTitle = '패배...';
            resultMessage = '체력을 모두 잃었습니다. 모험이 종료됩니다.';
        } else if (state.status === 'fled') {
            resultTitle = '후퇴';
            resultMessage = '성공적으로 도망쳤습니다. 모험을 계속합니다.';
        }
        return `
        <div class="combat-view">
            <div class="section-h">전투 종료: ${resultTitle}</div>
            <div class="card pad" style="margin: 0 16px 16px; text-align: center;">
                <p>${resultMessage}</p>
                <button class="btn full" id="btn-return-to-adventure" style="margin-top: 16px;">모험 탭으로 돌아가기</button>
            </div>
            <div class="card pad" style="margin: 0 16px 16px; max-height: 300px; overflow-y: auto;" id="combat-log-area">
                ${state.log.map(line => `<p class="small">${line}</p>`).join('')}
            </div>
        </div>
        `;
    }

    return `
    <div class="combat-view">
        <div class="combat-entities">
            ${healthBarTemplate(player)}
            ${healthBarTemplate(enemy)}
        </div>
        
        <div class="card pad" style="margin: 16px; min-height: 150px; max-height: 300px; overflow-y: auto;" id="combat-log-area">
            ${state.log.map(line => `<p class="small">${line}</p>`).join('')}
        </div>

        <div class="card pad" style="margin: 0 16px;">
            <div class="tabs small">
                <button class="tab on" data-action-tab="skills">스킬</button>
                <button class="tab" data-action-tab="items">아이템</button>
                <button class="tab" data-action-tab="etc">기타</button>
            </div>
            <div class="action-panels">
                <div class="action-panel skills active" style="display:flex; flex-direction:column; gap:8px;">
                    ${player.skills.length > 0 ? player.skills.map(s => `<button class="btn full combat-action-btn" data-action-type="skill" data-action-id="${s.id}">${s.name}</button>`).join('') : '<div class="small" style="text-align:center; padding: 12px 0;">사용할 수 있는 스킬이 없습니다.</div>'}
                </div>
                <div class="action-panel items" style="display:none; flex-direction:column; gap:8px;">
                     ${player.items.length > 0 ? player.items.map(i => `<button class="btn full combat-action-btn" data-action-type="item" data-action-id="${i.id}">${i.name} (${i.grade})</button>`).join('') : '<div class="small" style="text-align:center; padding: 12px 0;">사용할 수 있는 아이템이 없습니다.</div>'}
                </div>
                <div class="action-panel etc" style="display:none; flex-direction:column; gap:8px;">
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
    
    if (state.status === 'ongoing') {
        // 탭 전환 이벤트 바인딩
        root.querySelectorAll('.tabs .tab').forEach(btn => {
            btn.onclick = () => {
                root.querySelectorAll('.tabs .tab').forEach(b => b.classList.remove('on'));
                btn.classList.add('on');
                const targetPanelClass = btn.dataset.actionTab;
                root.querySelectorAll('.action-panel').forEach(p => {
                    p.style.display = p.classList.contains(targetPanelClass) ? 'flex' : 'none';
                });
            };
        });
    }
}

async function takeTurn(action) {
    ui.busy(true);
    // AI의 응답 속도를 고려하여 최소 로딩 시간을 2초로 설정
    const loadingTimer = new Promise(resolve => setTimeout(resolve, 2000)); 
    
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
        // 에러 발생 시 최신 상태를 다시 불러와 UI를 복구
        const latestState = await api.getAdventure(currentAdventureId);
        if (latestState.ok && latestState.data.combatState) {
            currentCombatState = latestState.data.combatState;
            render(currentCombatState);
        }
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
            // 전투가 진행 중일 때만 버튼이 작동하도록
            if(currentCombatState && currentCombatState.status === 'ongoing') {
                const action = {
                    type: actionBtn.dataset.actionType,
                    id: actionBtn.dataset.actionId
                };
                takeTurn(action);
            }
        }
        
        const returnBtn = e.target.closest('#btn-return-to-adventure');
        if (returnBtn) {
            ui.navTo('adventure');
        }
    });
}
