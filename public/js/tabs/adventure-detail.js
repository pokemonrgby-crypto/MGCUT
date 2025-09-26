// public/js/tabs/adventure-detail.js
import { api } from '../api.js';
import { ui, withBlocker, handleCooldown } from '../ui/frame.js';

const ROOT_SELECTOR = '[data-view="adventure-detail"]';
let currentAdventure = null;
let isLoadingNext = false;

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
    return `
    <div class="adventure-view">
        ${staminaBarTemplate(characterState)}
        <div class="situation-card"><p>${(node.situation || '').replace(/\n/g, '<br>')}</p></div>
        <div class="choices-list" style="margin-top: 16px; display:flex; flex-direction:column; gap:8px;">
            ${(node.choices || []).map(choice => {
                if (choice.action === 'enter_battle') {
                    return `<button class="btn choice-btn btn-danger" data-action="enter_battle" data-enemy='${JSON.stringify(node.enemy || {})}'>⚔️ ${choice.text}</button>`;
                }
                return `<button class="btn choice-btn" data-choice="${choice.text}">${choice.text}</button>`;
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
    
    if (currentAdventure.lastResult && !isLoadingNext) {
        root.innerHTML = resultTemplate(currentAdventure.lastResult, currentAdventure.characterState);
    } else if (currentAdventure.currentNode) {
        root.innerHTML = situationTemplate(currentAdventure.currentNode, currentAdventure.characterState);
    } else {
        root.innerHTML = loadingTemplate();
    }
}

async function proceedToNextStep(choiceText) {
    const root = document.querySelector(ROOT_SELECTOR);
    root.innerHTML = loadingTemplate();
    isLoadingNext = true;

    try {
        const timer = new Promise(resolve => setTimeout(resolve, 10000));
        const apiCall = api.proceedAdventure(currentAdventure.id, { choice: choiceText });
        
        const [, res] = await Promise.all([timer, apiCall]);

        const { newItem } = res.data;
        if (newItem) alert(`아이템 획득: ${newItem.name} (${newItem.grade})`);
        
        // 최신 모험 정보 다시 불러오기
        const updatedAdventureRes = await api.getAdventure(currentAdventure.id);
        currentAdventure = updatedAdventureRes.data;

        await renderCurrentState();

    } catch (e) {
        alert(`진행 실패: ${e.message}`);
        const proceedBtn = root.querySelector('.choice-btn');
        if (proceedBtn) handleCooldown(e, proceedBtn);
        // 에러 발생 시 모험 상세 정보 다시 로드
        const updatedAdventureRes = await api.getAdventure(currentAdventure.id);
        currentAdventure = updatedAdventureRes.data;
        await renderCurrentState();
    } finally {
        isLoadingNext = false;
    }
}

export function mount(adventureId) {
    if (!adventureId) {
        document.querySelector(ROOT_SELECTOR).innerHTML = `<div class="card pad err" style="margin:16px;">잘못된 접근입니다.</div>`;
        return;
    }
    
    withBlocker(async () => {
        const res = await api.getAdventure(adventureId);
        if (!res.ok) throw new Error('진행 중인 모험 정보를 가져올 수 없습니다.');
        currentAdventure = res.data;
        await renderCurrentState();
    });

    const root = document.querySelector(ROOT_SELECTOR);
    if (root.dataset.listener) return;
    root.dataset.listener = 'true';

    root.addEventListener('click', async (e) => {
        if (isLoadingNext) return;

        const choiceBtn = e.target.closest('.choice-btn');
        const nextBtn = e.target.closest('#btn-adventure-next');
        const leaveBtn = e.target.closest('.leave-btn');

        if (choiceBtn) {
            const choiceAction = choiceBtn.dataset.action;
            if (choiceAction === 'enter_battle') {
                try {
                    const enemyData = JSON.parse(choiceBtn.dataset.enemy);
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
            await proceedToNextStep(choiceText);

        } else if (nextBtn) {
            await withBlocker(async () => {
                await api.postAdventureNext(currentAdventure.id); // 서버의 lastResult를 null로
                const res = await api.getAdventure(currentAdventure.id); // 최신 상태 가져오기
                currentAdventure = res.data;
                await renderCurrentState();
            });
        } else if (leaveBtn) {
            if (confirm('정말로 모험을 중단하시겠습니까? 현재까지의 진행 상황은 사라집니다.')) {
                // TODO: 모험 포기(삭제) API 호출 구현
                alert('모험이 중단되었습니다.');
                ui.navTo('adventure');
            }
        }
    });
}
