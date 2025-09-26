// public/js/tabs/adventure-combat.js
import { api } from '../api.js';
import { ui } from '../ui/frame.js';

const ROOT_SELECTOR = '[data-view="adventure-combat"]';
let currentAdventureId = null;
let currentCombatState = null;
let isProcessingTurn = false;

/**
 * [신규] 로그 한 줄을 분석하여 실시간으로 UI를 업데이트하는 함수
 * @param {string} logLine - 분석할 로그 텍스트
 */
function parseLogAndUpdateUI(logLine) {
    if (!currentCombatState) return;

    const root = document.querySelector(ROOT_SELECTOR);
    let entityCard;

    // 정규식을 사용하여 로그에서 HP 변경 정보 추출
    const hpMatch = logLine.match(/([^\s(]+)은\(는\) (\d+)의 피해를 입었다\. \(HP: (\d+)\)|([^\s(]+)의 체력이 (\d+)만큼 회복되었다\. \(HP: (\d+)\)|\[효과\] ([^\s(]+)은\(는\) .*? (\d+)의 피해를 입었다|\[효과\] ([^\s(]+)은\(는\) .*? (\d+) 회복했다/);

    if (hpMatch) {
        const name = hpMatch[1] || hpMatch[4] || hpMatch[7] || hpMatch[9];
        const newHp = parseInt(hpMatch[3] || hpMatch[6] || (currentCombatState.player.name === name ? currentCombatState.player.health : currentCombatState.enemy.health), 10);
        
        const isPlayer = currentCombatState.player.name === name;
        const entity = isPlayer ? currentCombatState.player : currentCombatState.enemy;
        entityCard = root.querySelector(isPlayer ? '.player' : '.enemy');
        
        // 실제 상태 업데이트
        entity.health = newHp;

        if (entityCard) {
            const healthPercent = (entity.health / entity.maxHealth) * 100;
            entityCard.querySelector('.bar-fill').style.width = `${healthPercent}%`;
            entityCard.querySelector('.value').textContent = `${entity.health} / ${entity.maxHealth}`;
        }
    }
    
    // [신규] 상태이상 발생/제거 시 실시간 아이콘 업데이트
    const statusAddMatch = logLine.match(/([^\s(]+)은\(는\) (.*?) 효과에 걸렸다!/);
    const statusRemoveMatch = logLine.match(/([^\s(]+)의 (.*?) 효과가 사라졌다\./);

    if (statusAddMatch || statusRemoveMatch) {
        // 상태이상 변경이 감지되면 플레이어와 적의 상태 UI를 모두 최신 정보로 갱신
        updateCombatUI(currentCombatState);
    }
}


// 한 줄씩 로그를 표시하는 함수
function showLogsSequentially(logArea, logs, callback) {
    if (logs.length === 0) {
        if (callback) callback();
        return;
    }
    const log = logs.shift();
    
    // [수정] 로그를 표시하기 직전에 UI 업데이트 함수 호출
    parseLogAndUpdateUI(log);

    const p = document.createElement('p');
    p.className = 'small combat-log-line';
    p.innerHTML = log;
    logArea.appendChild(p);
    logArea.scrollTop = logArea.scrollHeight;

    setTimeout(() => showLogsSequentially(logArea, logs, callback), 700);
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
    if (state.status !== 'ongoing') {
        let resultTitle = '', resultMessage = '', buttonText = '모험 계속하기';
        if (state.status === 'won') {
            resultTitle = '승리!';
            resultMessage = '적을 물리치고 모험을 계속합니다.';
        } else if (state.status === 'lost') {
            resultTitle = '패배...';
            resultMessage = '체력을 모두 잃었습니다. 모험이 종료됩니다.';
            buttonText = '모험 목록으로 돌아가기';
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
                <h2>${resultTitle}</h2><p>${resultMessage}</p>
                <button class="btn full" id="btn-return-to-adventure" style="margin-top: 16px;">${buttonText}</button>
            </div>
             ${entityCardTemplate(player, true)}
        </div>`;
    }
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
                <div class="action-panel skills active">${player.skills.length > 0 ? player.skills.map(s => `<button class="btn full combat-action-btn" data-action-type="skill" data-action-id="${s.id}">${s.name}</button>`).join('') : '<div class="small-text">사용할 스킬이 없습니다.</div>'}</div>
                <div class="action-panel items">${player.items.length > 0 ? player.items.map(i => `<button class="btn full combat-action-btn" data-action-type="item" data-action-id="${i.id}">${i.name} <small>(${i.grade})</small></button>`).join('') : '<div class="small-text">사용할 아이템이 없습니다.</div>'}</div>
                <div class="action-panel etc"><button class="btn full secondary combat-action-btn" data-action-type="flee">도망치기</button></div>
            </div>
        </div>
    </div>`;
}

function updateCombatUI(state) {
    const root = document.querySelector(ROOT_SELECTOR);
    if (!root || !state) return;
    const entities = [{ data: state.player, selector: '.combat-entity-card.player' }, { data: state.enemy, selector: '.combat-entity-card.enemy' }];
    entities.forEach(entityInfo => {
        const card = root.querySelector(entityInfo.selector);
        if (card) {
            const healthPercent = (entityInfo.data.health / entityInfo.data.maxHealth) * 100;
            card.querySelector('.bar-fill').style.width = `${healthPercent}%`;
            card.querySelector('.value').textContent = `${entityInfo.data.health} / ${entityInfo.data.maxHealth}`;
            const effectsContainer = card.querySelector('.status-effects');
            if (effectsContainer) {
                effectsContainer.innerHTML = (entityInfo.data.status || []).filter(s => s.duration > 0).map(s => `
                    <div class="effect-badge" title="${s.name}"><span class="icon">${s.icon || '❓'}</span><span class="duration">${s.duration}</span></div>
                `).join('');
            }
        }
    });
    if (state.status === 'ongoing') {
        root.querySelectorAll('.combat-action-btn, .tabs .tab').forEach(el => el.disabled = false);
    }
}

function render(state) {
    const root = document.querySelector(ROOT_SELECTOR);
    root.innerHTML = combatTemplate(state);
    const logArea = root.querySelector('.combat-log-container');
    if (logArea) logArea.scrollTop = logArea.scrollHeight;
    if (state.status === 'ongoing') {
        root.querySelectorAll('.tabs .tab').forEach(btn => {
            btn.onclick = () => {
                if (isProcessingTurn) return;
                root.querySelectorAll('.tabs .tab').forEach(b => b.classList.remove('on'));
                btn.classList.add('on');
                const targetPanelClass = btn.dataset.actionTab;
                root.querySelectorAll('.action-panel').forEach(p => p.classList.toggle('active', p.classList.contains(targetPanelClass)));
            };
        });
    }
}

async function takeTurn(action) {
    if (isProcessingTurn) return;
    isProcessingTurn = true;
    const root = document.querySelector(ROOT_SELECTOR);
    root.querySelectorAll('.combat-action-btn, .tabs .tab').forEach(el => el.disabled = true);
    const logArea = document.querySelector('.combat-log-container');
    const processingMsg = document.createElement('p');
    processingMsg.className = 'small combat-log-line';
    processingMsg.innerHTML = '<i>처리 중...</i>';
    logArea.appendChild(processingMsg);
    logArea.scrollTop = logArea.scrollHeight;
    try {
        const res = await api.takeCombatTurn(currentAdventureId, action);
        if (res.ok) {
            const { turnLog, combatState, droppedItem } = res.data;
            currentCombatState = combatState;
            logArea.removeChild(processingMsg);

            // [추가] 아이템 획득 시 알림 표시
            if (droppedItem) {
                setTimeout(() => {
                    alert(`전리품 획득: ${droppedItem.name} (${droppedItem.grade})`);
                }, (turnLog.length + 1) * 700); // 로그 표시가 끝난 후에 알림
            }

            showLogsSequentially(logArea, turnLog || [], () => {
                isProcessingTurn = false;
                if (currentCombatState.status !== 'ongoing') {
                    render(currentCombatState);
                } else {
                    updateCombatUI(currentCombatState);
                }
            });
        } else {
            throw new Error(res.error || '턴 진행에 실패했습니다.');
        }
    } catch (e) {
        alert(`오류: ${e.message}`);
        isProcessingTurn = false;
        if(logArea.contains(processingMsg)) logArea.removeChild(processingMsg);
        root.querySelectorAll('.combat-action-btn, .tabs .tab').forEach(el => el.disabled = false);
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
            takeTurn({ type: actionBtn.dataset.actionType, id: actionBtn.dataset.actionId });
        }
        const returnBtn = e.target.closest('#btn-return-to-adventure');
        if (returnBtn) {
            if (currentCombatState.status === 'lost') {
                ui.navTo('adventure');
            } else {
                ui.navTo(`adventure-detail/${currentAdventureId}`);
            }
        }
    });
}
