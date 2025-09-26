// public/js/tabs/adventure-combat.js
import { api } from '../api.js';
import { ui } from '../ui/frame.js';

const ROOT_SELECTOR = '[data-view="adventure-combat"]';
let currentAdventureId = null;
let currentCombatState = null;
let isProcessingTurn = false;

// 한 줄씩 로그를 표시하는 함수
function showLogsSequentially(logArea, logs, callback) {
    if (logs.length === 0) {
        if (callback) callback();
        return;
    }
    const log = logs.shift();
    const p = document.createElement('p');
    p.className = 'small combat-log-line';
    p.innerHTML = log; // 텍스트 대신 HTML을 바로 삽입하여 스타일링된 로그 지원
    logArea.appendChild(p);
    logArea.scrollTop = logArea.scrollHeight;

    setTimeout(() => showLogsSequentially(logArea, logs, callback), 700); // 0.7초 간격
}


function entityCardTemplate(entity, isPlayer = false) {
    const healthPercent = (entity.health / entity.maxHealth) * 100;
    return `
    <div class="combat-entity-card ${isPlayer ? 'player' : 'enemy'}">
        <div class="name">${entity.name}</div>
        <div class="hp-bar">
            <div class="bar-bg"><div class="bar-fill" style="width: ${healthPercent}%;"></div></div>
            <div class="value">${entity.health} / ${entity.maxHealth}</div>
        </div>
        <div class="status-effects">
            ${(entity.status || []).filter(s => s.duration > 0).map(s => `
                <div class="effect-badge" title="${s.name}">
                    <span class="icon">${s.icon || '❓'}</span>
                    <span class="duration">${s.duration}</span>
                </div>
            `).join('')}
        </div>
    </div>
    `;
}

function combatTemplate(state) {
    if (!state) return '<div class="spinner"></div>';

    const player = state.player;
    const enemy = state.enemy;

    // 전투 종료 화면
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
             ${entityCardTemplate(enemy)}
             <div class="card pad combat-log-container" style="margin: 12px 0; min-height: 200px; max-height: 40vh; overflow-y: auto;">
                ${state.log.map(line => `<p class="small">${line}</p>`).join('')}
            </div>
            <div class="card pad" style="text-align: center;">
                <h2>${resultTitle}</h2>
                <p>${resultMessage}</p>
                <button class="btn full" id="btn-return-to-adventure" style="margin-top: 16px;">모험 계속하기</button>
            </div>
             ${entityCardTemplate(player, true)}
        </div>
        `;
    }

    // 전투 진행 화면
    return `
    <div class="combat-view">
        ${entityCardTemplate(enemy)}

        <div class="card pad combat-log-container" style="margin: 12px 0; min-height: 200px; max-height: 40vh; overflow-y: auto;">
             ${state.log.map(line => `<p class="small combat-log-line">${line}</p>`).join('')}
        </div>

        ${entityCardTemplate(player, true)}

        <div class="card pad combat-actions-container">
            <div class="tabs small">
                <button class="tab on" data-action-tab="skills">스킬</button>
                <button class="tab" data-action-tab="items">아이템</button>
                <button class="tab" data-action-tab="etc">기타</button>
            </div>
            <div class="action-panels">
                <div class="action-panel skills active">
                    ${player.skills.length > 0 ? player.skills.map(s => `<button class="btn full combat-action-btn" data-action-type="skill" data-action-id="${s.id}">${s.name} <small>(${s.type})</small></button>`).join('') : '<div class="small-text">사용할 스킬이 없습니다.</div>'}
                </div>
                <div class="action-panel items">
                     ${player.items.length > 0 ? player.items.map(i => `<button class="btn full combat-action-btn" data-action-type="item" data-action-id="${i.id}">${i.name} <small>(${i.grade})</small></button>`).join('') : '<div class="small-text">사용할 아이템이 없습니다.</div>'}
                </div>
                <div class="action-panel etc">
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

    const logArea = root.querySelector('.combat-log-container');
    if (logArea) {
        logArea.scrollTop = logArea.scrollHeight;
    }
    
    if (state.status === 'ongoing') {
        root.querySelectorAll('.tabs .tab').forEach(btn => {
            btn.onclick = () => {
                if (isProcessingTurn) return;
                root.querySelectorAll('.tabs .tab').forEach(b => b.classList.remove('on'));
                btn.classList.add('on');
                const targetPanelClass = btn.dataset.actionTab;
                root.querySelectorAll('.action-panel').forEach(p => {
                    p.classList.toggle('active', p.classList.contains(targetPanelClass));
                });
            };
        });
    }
}

async function takeTurn(action) {
    if (isProcessingTurn) return;
    isProcessingTurn = true;
    ui.busy(true); 
    
    // 기존 로그를 지우고 "처리 중..." 메시지 추가
    const logArea = document.querySelector('.combat-log-container');
    logArea.innerHTML = '<p class="small combat-log-line"><i>처리 중...</i></p>';

    try {
        const res = await api.takeCombatTurn(currentAdventureId, action);
        if (res.ok) {
            // 서버로부터 받은 새 로그 목록
            const newLogs = res.data.turnLog || [];
            currentCombatState = res.data.combatState;

            // 로그를 순차적으로 표시
            logArea.innerHTML = ''; // "처리 중..." 메시지 제거
            showLogsSequentially(logArea, newLogs, () => {
                // 모든 로그가 표시된 후 최종 상태로 UI를 다시 렌더링
                render(currentCombatState);
                isProcessingTurn = false;
                ui.busy(false);
            });

        } else {
            throw new Error(res.error || '턴 진행에 실패했습니다.');
        }
    } catch (e) {
        alert(`오류: ${e.message}`);
        isProcessingTurn = false;
        ui.busy(false);
        // 에러 발생 시 UI를 마지막으로 성공한 상태로 복구
        render(currentCombatState);
    }
}


export function mount(adventureId) {
    currentAdventureId = adventureId;
    isProcessingTurn = false;
    const root = document.querySelector(ROOT_SELECTOR);
    root.innerHTML = '<div class="spinner"></div>';

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
        if (actionBtn && currentCombatState?.status === 'ongoing' && !isProcessingTurn) {
            const action = {
                type: actionBtn.dataset.actionType,
                id: actionBtn.dataset.actionId
            };
            takeTurn(action);
        }
        
        const returnBtn = e.target.closest('#btn-return-to-adventure');
        if (returnBtn) {
            // 전투가 끝났으므로 adventure 메인 화면으로 이동
            ui.navTo('adventure');
        }
    });
}
