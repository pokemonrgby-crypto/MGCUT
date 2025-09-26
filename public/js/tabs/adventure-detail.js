// public/js/tabs/adventure-detail.js
import { api } from '../api.js';
import { withBlocker, ui } from '../ui/frame.js';

const ROOT_SELECTOR = '[data-view="adventure-detail"]';
let currentAdventure = {
    id: null,
    graph: null,
    characterState: null,
};

function adventurePlayTemplate(node, characterState) {
    const staminaBar = `
        <div class="stamina-bar">
            <div class="label">STAMINA</div>
            <div class="bar-bg"><div class="bar-fill" style="width: ${characterState.stamina}%;"></div></div>
            <div class="value">${characterState.stamina} / 100</div>
        </div>`;

    if (node.isEndpoint) {
        return `
            <div class="adventure-view" style="padding: 0 16px;">
                ${staminaBar}
                <div class="situation-card">
                    <h3>에피소드 종료</h3>
                    <p>${node.outcome.replace(/\n/g, '<br>')}</p>
                </div>
                <div class="choices-list" style="margin-top: 16px; display:flex; flex-direction:column; gap:8px;">
                    <button class="btn continue-btn">다음 모험 계속하기</button>
                    <button class="btn secondary leave-btn">모험 종료</button>
                </div>
            </div>`;
    }

    return `
    <div class="adventure-view" style="padding: 0 16px;">
        ${staminaBar}
        <div class="situation-card"><p>${node.situation.replace(/\n/g, '<br>')}</p></div>
        <div class="choices-list" style="margin-top: 16px; display:flex; flex-direction:column; gap:8px;">
            ${(node.choices || []).map(choice => {
                if (choice.action === 'enter_battle') {
                    return `<button class="btn choice-btn btn-danger" data-action="enter_battle" data-enemy='${JSON.stringify(node.enemy || {})}'>⚔️ ${choice.text}</button>`;
                }
                return `<button class="btn choice-btn" data-next-node="${choice.nextNode}" data-choice-text="${choice.text}">${choice.text}</button>`;
            }).join('')}
        </div>
        <div style="margin-top: 24px;">
            <button class="btn secondary leave-btn">모험 포기</button>
        </div>
    </div>`;
}

async function render(adventureId) {
    const root = document.querySelector(ROOT_SELECTOR);
    root.innerHTML = `<div class="spinner"></div>`;
    try {
        const res = await api.getAdventure(adventureId);
        if (!res.ok) throw new Error('진행 중인 모험 정보를 가져올 수 없습니다.');
        
        const adventure = res.data;
        currentAdventure.id = adventure.id;
        currentAdventure.graph = adventure.storyGraph;
        currentAdventure.characterState = adventure.characterState;

        const node = adventure.storyGraph.nodes[adventure.currentNodeKey];
        root.innerHTML = adventurePlayTemplate(node, adventure.characterState);

    } catch(e) {
        root.innerHTML = `<div class="card pad err" style="margin: 16px;">오류: ${e.message}</div>`;
    }
}

export function mount(adventureId) {
    if (!adventureId) {
        document.querySelector(ROOT_SELECTOR).innerHTML = `<div class="card pad err" style="margin:16px;">잘못된 접근입니다.</div>`;
        return;
    }
    render(adventureId);

    const root = document.querySelector(ROOT_SELECTOR);
    if (root.dataset.listener) return;
    root.dataset.listener = 'true';

    root.addEventListener('click', async (e) => {
        const choiceBtn = e.target.closest('.choice-btn');
        const continueBtn = e.target.closest('.continue-btn');
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

            const nextNodeKey = choiceBtn.dataset.nextNode;
            const choiceText = choiceBtn.dataset.choiceText;
            await withBlocker(async () => {
                const res = await api.proceedAdventure(currentAdventure.id, { nextNodeKey, choiceText });
                const { newCharacterState, newItem } = res.data;
                currentAdventure.characterState = newCharacterState;
                if (newItem) alert(`아이템 획득: ${newItem.name} (${newItem.grade})`);
                await render(currentAdventure.id);
            });

        } else if (continueBtn) {
            await withBlocker(async () => {
                await api.continueAdventure(currentAdventure.id);
                await render(currentAdventure.id);
            });
        } else if (leaveBtn) {
            if (confirm('정말로 모험을 중단하시겠습니까?')) {
                ui.navTo('adventure');
            }
        }
    });
}
