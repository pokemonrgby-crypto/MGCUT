// public/js/tabs/inventory.js
import { api } from '../api.js';
import { withBlocker } from '../ui/frame.js';
import { itemCard } from '../ui/components/item-card.js';

const ROOT_SELECTOR = '[data-view="inventory"]';
let myCharacters = [];

function characterSelectTemplate(characters) {
    if (characters.length === 0) {
        return `<div class="card pad" style="margin: 16px;">
            <div class="small">가방을 확인할 캐릭터가 없습니다.</div>
            <p>먼저 [생성] 탭에서 캐릭터를 만들어주세요.</p>
        </div>`;
    }
    return `
    <div class="section-h" style="padding-bottom: 12px;">가방을 확인할 캐릭터 선택</div>
    <div class="list" style="padding:0 16px 16px">
        ${characters.map(c => `
        <div class="card character-select-card" data-char-id="${c.id}" style="cursor: pointer;">
            <div class="bg" style="background-image:url('${c.imageUrl || ''}')"></div>
            <div class="info">
                <div class="name">${c.name}</div>
                <div class="world small">소속: ${c.worldName}</div>
            </div>
        </div>
        `).join('')}
    </div>`;
}

function inventoryDetailTemplate(character) {
    const items = character.items || [];
    const equipableItems = items.filter(item => (item.type || 'equipable') === 'equipable');
    const consumableItems = items.filter(item => item.type === 'consumable');

    return `
    <button class="btn secondary" data-action="back-to-char-select" style="margin:16px;">‹ 캐릭터 다시 선택</button>
    <div class="section-h" style="padding-top:0;">${character.name}의 가방</div>
    
    <div style="padding: 0 16px;">
      <div class="small" style="margin-bottom: 8px; font-weight: 700;">장비 아이템</div>
      <div class="grid3" style="padding: 0 0 16px;">
        ${equipableItems.length > 0 ? equipableItems.map(item => itemCard(item)).join('') : '<div class="card pad small">장비 아이템이 없습니다.</div>'}
      </div>

      <div class="small" style="margin-bottom: 8px; font-weight: 700;">소비 아이템</div>
      <div class="grid3" style="padding: 0 0 16px;">
        ${consumableItems.length > 0 ? consumableItems.map(item => itemCard(item)).join('') : '<div class="card pad small">소비 아이템이 없습니다.</div>'}
      </div>
    </div>
    `;
}


async function render(view, ...args) {
    const root = document.querySelector(ROOT_SELECTOR);
    root.innerHTML = '<div class="spinner"></div>';
    let content = '';

    try {
        if (view === 'character-select') {
            const res = await api.getMyCharacters();
            myCharacters = res.data || [];
            content = characterSelectTemplate(myCharacters);
        } else if (view === 'inventory-detail') {
            const charId = args[0];
            // 캐시된 데이터가 있으면 사용, 없으면 API 호출
            let character = myCharacters.find(c => c.id === charId);
            if (!character) {
                 const res = await api.getCharacter(charId);
                 character = res.data;
            }
            content = inventoryDetailTemplate(character);
        }
        root.innerHTML = content;
    } catch (e) {
        root.innerHTML = `<div class="card pad err" style="margin:16px;">오류: ${e.message}</div>`;
    }
}

export function mount() {
    const root = document.querySelector(ROOT_SELECTOR);
    // 탭이 활성화될 때마다 캐릭터 선택 화면을 다시 렌더링
    render('character-select');

    if (root.dataset.listener) return;
    root.dataset.listener = 'true';

    root.addEventListener('click', async (e) => {
        const charCard = e.target.closest('.character-select-card');
        if (charCard) {
            const charId = charCard.dataset.charId;
            await withBlocker(() => render('inventory-detail', charId));
        }
        
        const backBtn = e.target.closest('[data-action="back-to-char-select"]');
        if (backBtn) {
            await withBlocker(() => render('character-select'));
        }

        const itemCardEl = e.target.closest('.item-card');
        if(itemCardEl && itemCardEl.dataset.type === 'consumable') {
            // TODO: 소비 아이템 사용 로직 (향후 구현)
            alert('소비 아이템 사용 기능은 아직 준비 중입니다.');
        }
    });
}
