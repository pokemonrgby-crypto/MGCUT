// public/js/tabs/adventure-detail.js
import { api } from '../api.js';
import { ui, withBlocker, handleCooldown } from '../ui/frame.js';

const ROOT_SELECTOR = '[data-view="adventure-detail"]';
let currentAdventure = null;
let isProcessingNext = false;

function loadingTemplate() {
    return `
    <div class="sim-loading" style="min-height: 300px;">
      <div class="spinner"></div>
      <div class="dots" style="margin-top: 12px; font-size: 16px;">이야기를 준비중입니다<span>.</span><span>.</span><span>.</span></div>
    </div>`;
}

function resultTemplate(result, staminaState) {
    return `
    <div class="adventure-view">
        ${staminaBarTemplate(staminaState)}
        <div class="situation-card">
            <h3>선택 결과</h3>
            <p>${result.replace(/\n/g, '<br>')}</p>
        </div>
        <div class="choices-list" style="margin-top: 16px;">
            <button class="btn full" id="btn-adventure-next">다음으로</button>
        </div>
    </div>`;
}

function situationTemplate(node, characterState) {
    const choices = Array.isArray(node.choices) ? node.choices : [];
    return `
    <div class="adventure-view">
        ${staminaBarTemplate(characterState)}
        <div class="situation-card"><p>${(node.situation || '').replace(/\n/g, '<br>')}</p></div>
        <div class="choices-list" style="margin-top: 16px; display:flex; flex-direction:column; gap:8px;">
            ${choices.map(choice => {
                const action = choice.action || '';
                // [수정] data-enemy 속성을 제거하여 JSON 파싱 오류 원천 차단
                const btnClass = action === 'enter_battle' ? 'btn choice-btn btn-danger' : 'btn choice-btn';
                const icon = action === 'enter_battle' ? '⚔️ ' : '';

                return `<button class="${btnClass}" data-choice="${choice.text}" data-action="${action}">${icon}${choice.text}</button>`;
            }).join('')}
        </div>
        <div style="margin-top: 24px;">
            <button class="btn secondary leave-btn">모험 포기</button>
        </div>
    </div>`;
}

function staminaBarTemplate(state) {
     return `
        <div class="stamina-bar">
            <div class="label">STAMINA</div>
            <div class="bar-bg"><div class="bar-fill" style="width: ${state.stamina || 100}%;"></div></div>
            <div class="value">${state.stamina || 100} / 100</div>
        </div>`;
}

async function renderCurrentState() {
    const root = document.querySelector(ROOT_SELECTOR);
    if (!currentAdventure) {
        root.innerHTML = `<div class="card pad err">모험 정보를 불러올 수 없습니다.</div>`;
        return;
    }
    
    if (isProcessingNext) {
         root.innerHTML = loadingTemplate();
    } else if (currentAdventure.lastResult) {
        root.innerHTML = resultTemplate(currentAdventure.lastResult, currentAdventure.characterState);
    } else if (currentAdventure.currentNode) {
        root.innerHTML = situationTemplate(currentAdventure.currentNode, currentAdventure.characterState);
    } else {
        root.innerHTML = loadingTemplate();
    }
}

async function proceedToNextStep(choiceText) {
    if (isProcessingNext) return;
    isProcessingNext = true;
    await renderCurrentState();

    try {
        const res = await api.proceedAdventure(currentAdventure.id, { choice: choiceText });
        const { newItem } = res.data;
        if (newItem) alert(`아이템 획득: ${newItem.name} (${newItem.grade})`);
        
        const updatedAdventureRes = await api.getAdventure(currentAdventure.id);
        currentAdventure = updatedAdventureRes.data;

    } catch (e) {
        alert(`진행 실패: ${e.message}`);
        const choiceBtn = document.querySelector(`[data-choice="${choiceText}"]`);
        if(choiceBtn) handleCooldown(e, choiceBtn);
        const updatedAdventureRes = await api.getAdventure(currentAdventure.id);
        currentAdventure = updatedAdventureRes.data;
    } finally {
        isProcessingNext = false;
        await renderCurrentState();
    }
}

export function mount(adventureId) {
    if (!adventureId) {
        document.querySelector(ROOT_SELECTOR).innerHTML = `<div class="card pad err" style="margin:16px;">잘못된 접근입니다.</div>`;
        return;
    }
    
    isProcessingNext = true;
    withBlocker(async () => {
        const res = await api.getAdventure(adventureId);
        if (!res.ok) throw new Error('진행 중인 모험 정보를 가져올 수 없습니다.');
        currentAdventure = res.data;
        isProcessingNext = false;
        await renderCurrentState();
    });

    const root = document.querySelector(ROOT_SELECTOR);
    if (root.dataset.listener) return;
    root.dataset.listener = 'true';

    root.addEventListener('click', async (e) => {
        if (isProcessingNext) return;

        const choiceBtn = e.target.closest('.choice-btn');
        const nextBtn = e.target.closest('#btn-adventure-next');
        const leaveBtn = e.target.closest('.leave-btn');

        if (choiceBtn) {
            const choiceAction = choiceBtn.dataset.action;
            
            if (choiceAction === 'enter_battle') {
                try {
                    // [수정] DOM의 data 속성을 파싱하는 대신, 메모리의 'currentAdventure' 객체에서 직접 enemy 데이터를 가져옴
                    const enemyData = currentAdventure?.currentNode?.enemy;
                    if (!enemyData) {
                        throw new Error("현재 모험 정보에서 적 데이터를 찾을 수 없습니다.");
                    }

                    await withBlocker(async () => {
                        await api.startAdventureCombat(currentAdventure.id, enemyData);
                        ui.navTo(`adventure-combat/${currentAdventure.id}`);
                    });
                } catch(err) {
                    alert(`전투 시작 실패: ${err.message}`);
                }
                return;
            }

            const choiceText = choiceBtn.dataset.choice;
            // [수정] choiceText가 비어있지 않은지 확인하는 방어 로직 추가
            if (choiceText) {
                await proceedToNextStep(choiceText);
            }

        } else if (nextBtn) {
            isProcessingNext = true;
            await renderCurrentState();
            try {
                await api.postAdventureNext(currentAdventure.id);
                const res = await api.getAdventure(currentAdventure.id);
                currentAdventure = res.data;
            } catch(err) {
                 alert(`오류: ${err.message}`);
            } finally {
                 isProcessingNext = false;
                 await renderCurrentState();
            }

        } else if (leaveBtn) {
            if (confirm('정말로 모험을 중단하시겠습니까? 현재까지의 진행 상황은 사라집니다.')) {
                // TODO: 모험 포기(삭제) API 호출 구현
                alert('모험이 중단되었습니다.');
                ui.navTo('adventure');
            }
        }
    });
}
