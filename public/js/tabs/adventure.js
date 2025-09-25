// public/js/tabs/adventure.js
import { api, auth } from '../api.js';
import { withBlocker, ui } from '../ui/frame.js';
import { sessionKeyManager } from '../session-key-manager.js';

const ROOT_SELECTOR = '[data-view="adventure"]';
let myCharacters = [];
let allWorlds = []; // 전체 세계관 목록 캐시
let currentAdventure = {
    id: null,
    node: null,
    character: null,
};

// --- 템플릿 함수들 ---

// 1. 모험 탭 허브 UI (수정)
function adventureHubTemplate() {
    // [수정] 준비 중인 기능에 disabled 클래스 추가
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

// 2. 캐릭터 선택 화면
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
        </div>
        `).join('')}
    </div>
    <button class="btn secondary back-btn" data-target="hub" style="margin:16px;">‹ 뒤로가기</button>
    `;
}

// 3. 탐험할 세계관 선택 화면
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
    <button class="btn secondary back-btn" data-target="world-type-select" style="margin:16px;">‹ 뒤로가기</button>
    `;
}

// 6. 모험 진행 화면
function adventurePlayTemplate(node) {
    if (node.type === 'combat') {
        return `
        <div class="adventure-view">
            <div class="situation-card">
                <h3>전투 발생!</h3>
                <p>${node.situation.replace(/\n/g, '<br>')}</p>
                <div class="info-card" style="margin-top:12px;">
                    <div class="name">${node.enemy.name}</div>
                    <div class="desc">${node.enemy.description}</div>
                </div>
            </div>
            <div class="choices-list">
                <button class="btn choice-btn" data-choice-text="전투를 시작한다">전투를 시작한다</button>
                <button class="btn secondary choice-btn" data-choice-text="도망친다">도망친다 (미구현)</button>
            </div>
             <button class="btn secondary back-btn" data-target="hub" style="margin:16px;">‹ 모험 포기</button>
        </div>`;
    }

    return `
    <div class="adventure-view">
        <div class="situation-card">
            <p>${node.situation.replace(/\n/g, '<br>')}</p>
        </div>
        <div class="choices-list">
            ${(node.choices || []).map((choice) => `
                <button class="btn choice-btn" data-choice-text="${choice.text}">
                    ${choice.text}
                </button>
            `).join('')}
        </div>
         <button class="btn secondary back-btn" data-target="hub" style="margin:16px;">‹ 모험 포기</button>
    </div>`;
}

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
                const res = await api.getWorld(worldId);
                const world = res.data;
                content = siteSelectTemplate(world.sites || [], world.name);
                break;
            case 'play':
                const node = args[0];
                currentAdventure.node = node;
                content = adventurePlayTemplate(node);
                break;
        }
        root.innerHTML = content;
    } catch(e) {
        root.innerHTML = `<div class="card pad err" style="margin: 0 16px;">오류: ${e.message}</div>`;
    }
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
        const targetCard = target.closest('.card'); // 클릭된 카드 요소

        // [수정] 비활성화된 카드 클릭 시 아무것도 하지 않음
        if (targetCard && targetCard.classList.contains('disabled')) {
            return;
        }
        
        e.preventDefault();

        // 뒤로가기 버튼 처리 (수정)
        const backBtn = target.closest('.back-btn');
        if (backBtn) {
            const targetView = backBtn.dataset.target;
            switch (targetView) {
                case 'hub':
                    await withBlocker(() => renderView('hub'));
                    break;
                case 'char-select':
                    await withBlocker(() => renderView('char-select'));
                    break;
                case 'world-type-select':
                    // [수정] 뒤로 갈 때 character 정보가 있는지 확인
                    if (currentAdventure.character?.id) {
                        await withBlocker(() => renderView('world-type-select', currentAdventure.character.id));
                    } else {
                        await withBlocker(() => renderView('char-select')); // 정보 없으면 캐릭터 선택으로
                    }
                    break;
            }
            return;
        }

        const hubCard = target.closest('[data-hub-action]');
        if (hubCard) {
            const action = hubCard.dataset.hubAction;
            if (action === 'explore') {
                await withBlocker(() => renderView('char-select'));
            }
            // '준비 중' 알림은 비활성화 처리로 대체되었으므로 else 블록 제거
            return;
        }

        const charCard = target.closest('.character-select-card');
        if (charCard) {
            await withBlocker(() => renderView('world-type-select', charCard.dataset.charId));
            return;
        }

        const worldSelectCard = target.closest('.world-select-card');
        if (worldSelectCard) {
            const type = worldSelectCard.dataset.worldSelectType;
            if (type === 'my') {
                await withBlocker(() => renderView('site-select', currentAdventure.character.worldId));
            } else if (type === 'other') {
                await withBlocker(() => renderView('other-worlds'));
            } else {
                await withBlocker(() => renderView('site-select', worldSelectCard.dataset.worldId));
            }
            return;
        }

        const siteCard = target.closest('.site-card');
        if (siteCard) {
            const siteName = siteCard.dataset.siteName;
            if (!currentAdventure.character) return alert('오류: 캐릭터가 선택되지 않았습니다.');
            try {
                const password = await sessionKeyManager.getPassword();
                await withBlocker(async () => {
                    const res = await api.startAdventure(currentAdventure.character.id, siteName, password);
                    currentAdventure.id = res.data.adventureId;
                    await renderView('play', res.data.node);
                });
            } catch (err) {
                if (!err.message.includes('사용자가')) alert(`모험 시작 실패: ${err.message}`);
            }
            return;
        }

        const choiceBtn = target.closest('.choice-btn');
        if (choiceBtn) {
            if (currentAdventure.node?.type === 'combat') {
                alert('전투 시뮬레이션은 다음 업데이트에서 구현될 예정입니다.');
                return;
            }

            const choiceText = choiceBtn.dataset.choiceText;
            try {
                const password = await sessionKeyManager.getPassword();
                 await withBlocker(async () => {
                    const res = await api.proceedAdventure({
                        adventureId: currentAdventure.id,
                        choiceText,
                        password
                    });
                    await renderView('play', res.data.node);
                });
            } catch (err) {
                 if (!err.message.includes('사용자가')) alert(`진행 실패: ${err.message}`);
            }
        }
    });

    root.dataset.eventListenerAttached = 'true';
}
