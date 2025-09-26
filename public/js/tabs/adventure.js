// public/js/tabs/adventure.js
import { api, auth } from '../api.js';
import { withBlocker, ui } from '../ui/frame.js';
import { itemCard } from '../ui/components/item-card.js';

const ROOT_SELECTOR = '[data-view="adventure"]';
let myCharacters = [];
let allWorlds = [];
let selectedCharacter = null;
let selectedWorldId = null;

// --- 템플릿 함수 ---

function adventureHubTemplate() {
    return `
    <div class="section-h">모험</div>
    <div class="grid3" style="padding:0 16px 16px">
        <div class="card create-card" data-hub-action="explore">
            <div class="icon"><svg class="ico"><use href="#i-map"/></svg></div>
            <div><div class="t">탐험</div><div class="s">이야기 지도를 따라 모험하기</div></div>
        </div>
        <div class="card create-card" data-hub-action="inventory">
            <div class="icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-4V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2zM10 4h4v2h-4V4z"/></svg></div>
            <div><div class="t">가방</div><div class="s">캐릭터의 아이템 확인</div></div>
        </div>
        <div class="card create-card disabled" data-hub-action="plaza">
            <div class="icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4c-4.41 0-8 3.59-8 8s3.59 8 8 8 8-3.59 8-8-3.59-8-8-8zm0 14c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm-1-8h2v2h-2v-2zm0 4h2v2h-2v-2z"/></svg></div>
            <div><div class="t">광장</div><div class="s">준비 중...</div></div>
        </div>
        <div class="card create-card disabled" data-hub-action="raid">
            <div class="icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8-8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg></div>
            <div><div class="t">레이드</div><div class="s">준비 중...</div></div>
        </div>
    </div>`;
}

function characterSelectTemplate(characters, purpose = 'explore') {
    const title = purpose === 'inventory' ? '가방을 확인할 캐릭터 선택' : '모험을 시작할 캐릭터 선택';
    if (characters.length === 0) {
        return `<div class="card pad" style="margin: 0 16px;">
            <div class="small">선택할 캐릭터가 없습니다.</div>
            <p>먼저 [생성] 탭에서 캐릭터를 만들어주세요.</p>
            <button class="btn secondary back-btn" data-target="hub" style="margin-top:12px;">‹ 뒤로가기</button>
        </div>`;
    }
    return `
    <div class="section-h" style="padding-bottom: 12px;">${title}</div>
    <div class="list" style="padding:0 16px 16px">
        ${characters.map(c => `
        <div class="card character-select-card" data-char-id="${c.id}" data-purpose="${purpose}">
            <div class="bg" style="background-image:url('${c.imageUrl || ''}')"></div>
            <div class="info">
                <div class="name">${c.name}</div>
                <div class="world small">소속: ${c.worldName}</div>
            </div>
            ${purpose === 'explore' && c.ongoingAdventure ? `
            <div class="ongoing-adventure-badge">
                <button class="btn small resume-btn" data-adventure-id="${c.ongoingAdventure.id}">모험 계속하기</button>
            </div>
            ` : ''}
        </div>
        `).join('')}
    </div>
    <button class="btn secondary back-btn" data-target="hub" style="margin:16px;">‹ 뒤로가기</button>
    `;
}

// ... (기존 탐험 관련 템플릿 함수들은 동일)
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
    <button class="btn secondary back-btn" data-target="explore-char-select" style="margin:16px;">‹ 캐릭터 다시 선택</button>
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
function siteSelectTemplate(sites, worldName) {
     if (!sites || sites.length === 0) {
        return `<div class="card pad" style="margin: 0 16px;">
            <p>이 세계관에는 아직 탐험할 수 있는 명소가 없습니다.</p>
            <button class="btn secondary back-btn" data-target="world-type-select" style="margin-top:12px;">‹ 뒤로가기</button>
        </div>`;
    }
    return `
    <div class="section-h" style="padding-bottom: 12px;">${worldName}: 탐험할 명소 선택</div>
    <div class="rail" style="padding-left: 16px; padding-right: 16px;">
        ${sites.map(s => `
        <div class="card site-card" data-site-json='${JSON.stringify(s).replace(/'/g, '&#39;')}' style="cursor:pointer;">
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

// --- 렌더링 및 이벤트 핸들러 ---

async function renderView(viewName, ...args) {
    const root = document.querySelector(ROOT_SELECTOR);
    root.innerHTML = `<div class="spinner"></div>`;
    try {
        let content = '';
        if (myCharacters.length === 0 && viewName !== 'hub') {
            const resChars = await api.getMyCharacters();
            myCharacters = resChars.data || [];
        }

        switch(viewName) {
            case 'hub':
                selectedCharacter = null;
                selectedWorldId = null;
                content = adventureHubTemplate();
                break;
            case 'explore-char-select':
                selectedCharacter = null; // [수정] 캐릭터 선택 화면으로 돌아올 때 선택 초기화
                // [수정] getOngoingAdventure API를 사용하도록 변경
                const ongoingAdventures = await Promise.all(
                    myCharacters.map(c => api.getOngoingAdventure(c.id))
                );
                myCharacters.forEach((c, i) => {
                    c.ongoingAdventure = ongoingAdventures[i].data;
                });
                content = characterSelectTemplate(myCharacters, 'explore');
                break;
            case 'world-type-select':
                const charId = args[0];
                selectedCharacter = myCharacters.find(c => c.id === charId);
                if (!selectedCharacter) throw new Error('캐릭터 정보를 찾을 수 없습니다.');
                content = worldSelectTemplate(selectedCharacter);
                break;
            case 'other-worlds':
                 if (allWorlds.length === 0) {
                    const res = await api.listWorlds();
                    allWorlds = (res.data || []).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
                }
                content = otherWorldsListTemplate(allWorlds);
                break;
            case 'site-select':
                selectedWorldId = args[0];
                const res = await api.getWorld(selectedWorldId);
                const world = res.data;
                content = siteSelectTemplate(world.sites || [], world.name);
                break;
        }
        root.innerHTML = content;
    } catch(e) {
        console.error("RenderView Error:", e);
        root.innerHTML = `<div class="card pad err" style="margin: 0 16px;">오류: ${e.message}</div>`;
    }
}

function showSiteConfirmModal(site) {
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

    return new Promise((resolve) => {
        const closeModal = () => {
            modal.remove();
            resolve(false);
        };
        modal.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-layer') || e.target.classList.contains('modal-close')) {
                closeModal();
            }
        });
        modal.querySelector('#btn-start-adventure-confirm').onclick = () => {
            modal.remove();
            resolve(true);
        };
    });
}

export function mount() {
    const root = document.querySelector(ROOT_SELECTOR);
    renderView('hub');

    if (root.dataset.eventListenerAttached === 'true') return;
    root.dataset.eventListenerAttached = 'true';

    root.addEventListener('click', async (e) => {
        const target = e.target;
        
        const backBtn = target.closest('.back-btn');
        if (backBtn) {
            const targetView = backBtn.dataset.target;
            await withBlocker(() => renderView(targetView));
            return;
        }
        
        const hubCard = target.closest('[data-hub-action]');
        if (hubCard && !hubCard.classList.contains('disabled')) {
            const action = hubCard.dataset.hubAction;
            if (action === 'explore') {
                await withBlocker(() => renderView('explore-char-select'));
            } else if (action === 'inventory') {
                // [수정] 인벤토리 탭으로 이동
                ui.navTo('inventory');
            }
            return;
        }
        
        // [수정] '모험 이어하기' 버튼 클릭 시 이벤트 전파 중단
        const resumeBtn = target.closest('.resume-btn');
        if (resumeBtn) {
            e.stopPropagation(); // 이벤트 버블링 중단
            const adventureId = resumeBtn.dataset.adventureId;
            if (adventureId) ui.navTo(`adventure-detail/${adventureId}`);
            else alert('진행 중인 모험 정보를 찾을 수 없습니다.');
            return;
        }

        const charCard = target.closest('.character-select-card');
        if (charCard) {
            const purpose = charCard.dataset.purpose;
            const charId = charCard.dataset.charId;
            if (purpose === 'explore') {
                 await withBlocker(() => renderView('world-type-select', charId));
            }
            // [삭제] inventory purpose 관련 로직 제거
            return;
        }

        const worldSelectCard = target.closest('.world-select-card');
        if (worldSelectCard) {
            const type = worldSelectCard.dataset.worldSelectType;
            if (type === 'my') await withBlocker(() => renderView('site-select', selectedCharacter.worldId));
            else if (type === 'other') await withBlocker(() => renderView('other-worlds'));
            else if (worldSelectCard.dataset.worldId) await withBlocker(() => renderView('site-select', worldSelectCard.dataset.worldId));
            return;
        }

        const siteCard = target.closest('.site-card');
        if (siteCard) {
            const site = JSON.parse(siteCard.dataset.siteJson);
            const confirmed = await showSiteConfirmModal(site);
            if (confirmed) {
                if (!selectedCharacter) return alert('오류: 캐릭터가 선택되지 않았습니다.');
                
                const char = myCharacters.find(c => c.id === selectedCharacter.id);
                if (char.ongoingAdventure) {
                    if (!confirm("이 캐릭터는 이미 진행 중인 모험이 있습니다. 새로운 모험을 시작하면 이전 기록은 사라집니다. 계속하시겠습니까?")) return;
                }

                try {
                    await withBlocker(async () => {
                        const res = await api.startAdventure({ characterId: selectedCharacter.id, worldId: selectedWorldId, siteName: site.name });
                        ui.navTo(`adventure-detail/${res.data.adventureId}`);
                    });
                } catch (err) { alert(`모험 시작 실패: ${err.message}`); }
            }
            return;
        }
    });
}
