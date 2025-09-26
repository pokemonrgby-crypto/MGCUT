// /public/js/tabs/character-detail.js
import { api, auth, storage } from '../api.js';
import { withBlocker, ui } from '../ui/frame.js';
import * as NarrativeTab from './character-narrative.js';
import * as TimelineTab from './character-timeline.js';
import { itemCard, simpleItemCard } from '../ui/components/item-card.js';

const ROOT = '[data-view="character-detail"]';

const esc = s => String(s ?? '').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function parseRichText(text) {
  if (!text) return '';
  return text.replace(/\n/g, '<br>')
    .replace(/<대사>/g, '<div class="dialogue">')
    .replace(/<\/대사>/g, '</div>')
    .replace(/<서술>/g, '<div class="narrative">')
    .replace(/<\/서술>/g, '</div>')
    .replace(/<강조>/g, '<strong class="emphasis">')
    .replace(/<\/강조>/g, '</strong>')
    .replace(/<생각>/g, '<div class="thought">')
    .replace(/<\/생각>/g, '</div>')
    .replace(/<시스템>/g, '<div class="system">')
    .replace(/<\/시스템>/g, '</div>');
}

function skillChip(sk){
  const id = sk?.id || '';
  const name = sk?.name || '(이름없음)';
  const desc = sk?.desc || sk?.description || '';
  return `<button class="skill" data-skill-id="${esc(id)}" title="${esc(desc)}">
    <div style="font-weight:700">${esc(name)}</div>
    ${desc ? `<span class="small">${esc(desc)}</span>` : ''}
  </button>`;
}

function renderAdminPanel(container) {
  container.innerHTML = `
    <div class="card pad admin-panel-section">
      <div class="small">대표 이미지 변경</div>
      <input type="file" id="char-image-upload" accept="image/*" style="width:100%">
    </div>
    <div class="card pad admin-panel-section">
      <div class="small">캐릭터 삭제</div>
      <button id="btn-delete-character" class="btn full btn-danger">이 캐릭터 삭제</button>
      <div class="small" style="margin-top:8px; opacity: .8;">* 이 작업은 되돌릴 수 없습니다.</div>
    </div>
  `;
}

export async function mount(characterId){
  const root = document.querySelector(ROOT);
  if (!root) return;
  if (!characterId){ root.innerHTML = `<div class="card pad">캐릭터 ID가 없어요.</div>`; return; }

  root.innerHTML = `<div class="spinner"></div>`;

  try{
    const { ok, data:c } = await api.getCharacter(characterId);
    if (!ok) throw new Error('로드 실패');

    const isOwner = auth.currentUser && auth.currentUser.uid === c.ownerUid;

    root.innerHTML = `
      <div class="char-hero">
        <div class="bg" style="${c.imageUrl?`background-image:url('${esc(c.imageUrl)}')`:''}"></div>
        <div class="grad"></div>
        <div class="title shadow-title">${esc(c.name || '(이름없음)')}</div>
      </div>

      <div class="tabs tabs-char" style="grid-template-columns: repeat(${isOwner ? 6:5}, 1fr);">
        <button data-tab="about" class="active">소개</button>
        <button data-tab="narrative">서사</button>
        <button data-tab="skills">스킬</button>
        <button data-tab="items">아이템</button>
        <button data-tab="timeline">타임라인</button>
        ${isOwner ? '<button data-tab="admin">관리</button>' : ''}
      </div>

      <div class="tab-panels">
        <div class="panel about active"><div class="info-card"><div class="name">${esc(c.name||'')}</div><div class="desc">${parseRichText(esc(c.introLong||c.introShort||''))}</div></div><div class="info-card"><div class="kv"><div class="k">소속 세계관</div><div class="v small">${esc(c.worldName || c.worldId || '-')}</div></div><div class="kv"><div class="k">Elo</div><div class="v"><b>${c.elo ?? 1000}</b></div></div></div></div>
        <div class="panel narrative"></div>
        <div class="panel skills"><div class="skills-head"><span class="count">0/3</span><div style="flex:1"></div><button class="btn small" id="btn-save-skills">저장</button></div><div class="skills-list vlist">${ Array.isArray(c.abilities) && c.abilities.length ? c.abilities.map(skillChip).join('') : `<div class="small" style="opacity:.8">등록된 스킬이 없어요.</div>` }</div></div>
        <div class="panel items">
            <div class="small" style="opacity:.9;margin:6px 0 8px"><b>장착</b></div>
            <div class="equipment-slots"></div>
            <div style="display:flex;gap:8px;margin:10px 0 12px">
                <button class="btn small" id="btn-save-items">장착 정보 저장</button>
            </div>
            <div class="small" style="opacity:.9;margin:10px 0 6px"><b>인벤토리</b></div>
            <div class="inventory grid3">${ Array.isArray(c.items) && c.items.length ? c.items.map(item => simpleItemCard(item, 'inv-item')).join('') : `<div class="card pad small">아이템이 없어요.</div>` }</div>
        </div>
        <div class="panel timeline"></div> 
        ${isOwner ? '<div class="panel admin"></div>' : ''}
      </div>
      <button class="fab-battle" hidden aria-label="배틀 시작">⚔</button>
    `;

    // 각 탭 컨텐츠 렌더링
    NarrativeTab.render(root.querySelector('.panel.narrative'), c);
    TimelineTab.render(root.querySelector('.panel.timeline'), c);
    
    const tabs = Array.from(root.querySelectorAll('.tabs-char button[data-tab]'));
    const panelContainer = root.querySelector('.tab-panels');
    tabs.forEach(btn=>{
      btn.onclick = ()=>{
        tabs.forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        panelContainer.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
        const targetPanel = panelContainer.querySelector(`.panel.${btn.dataset.tab}`);
        targetPanel?.classList.add('active');

        // === 교체 시작 ===
        // 타임라인 탭을 클릭하면 항상 내용을 새로 렌더링
        if(btn.dataset.tab === 'timeline') {
            TimelineTab.render(targetPanel, c);
        }
        // === 교체 끝 ===
      };
    });

    if (isOwner) {
      const adminPanel = root.querySelector('.panel.admin');
      renderAdminPanel(adminPanel);

      adminPanel.querySelector('#char-image-upload').onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          await withBlocker(async () => {
            const path = `characters/${c.ownerUid}/${c.id}`;
            const imageUrl = await storage.uploadImage(path, file);
            await api.updateCharacterImage(c.id, imageUrl);
            root.querySelector('.char-hero .bg').style.backgroundImage = `url('${imageUrl}')`;
          });
          alert('이미지가 변경되었습니다.');
        } catch (err) { alert(`오류: ${err.message}`); }
      };

      adminPanel.querySelector('#btn-delete-character').onclick = () => {
        const modal = document.createElement('div');
        modal.className = 'modal-layer';
        modal.innerHTML = `<div class="modal-card"><div class="modal-body" style="text-align:center;"><h3>정말로 삭제하시겠습니까?</h3><p class="small">"${esc(c.name)}" 캐릭터와 관련된 모든 정보가 영구적으로 삭제되며, 이 작업은 되돌릴 수 없습니다.</p><div style="display:flex; gap:8px; margin-top:16px;"><button class="btn secondary full" id="btn-modal-cancel">취소</button><button class="btn full btn-danger" id="btn-modal-confirm">삭제 확인</button></div></div></div>`;
        document.body.appendChild(modal);
        modal.querySelector('#btn-modal-cancel').onclick = () => modal.remove();
        modal.querySelector('#btn-modal-confirm').onclick = async () => {
          try {
            await withBlocker(() => api.deleteCharacter(c.id));
            alert('캐릭터가 삭제되었습니다.');
            ui.navTo('home');
          } catch(err) {
            alert(`삭제 실패: ${err.message}`);
          } finally {
            modal.remove();
          }
        };
      };
    }

    // --- 스킬 로직 (ID 기반) ---
    const skillEls = Array.from(root.querySelectorAll('.skills-list .skill'));
    const countEl = root.querySelector('.skills-head .count');
    const savedSkills = new Set(c.chosen || []);
    let selected = new Set(savedSkills);

    function syncSkillCount(){ countEl.textContent = `${selected.size}/3`; }

    function syncSkillSelection(){
        skillEls.forEach(el => {
            const skillId = el.dataset.skillId;
            el.classList.toggle('selected', selected.has(skillId));
        });
        syncSkillCount();
    }

    function toggleSkill(el){
      const id = el.dataset.skillId;
      if (selected.has(id)) {
        selected.delete(id);
      } else {
        if (selected.size < 3) {
          selected.add(id);
        }
      }
      syncSkillSelection();
    }
    skillEls.forEach(el=> el.onclick = ()=> toggleSkill(el));
    syncSkillSelection();

    root.querySelector('#btn-save-skills')?.addEventListener('click', async ()=>{
      const arr = Array.from(selected);
      try{
        await withBlocker(() => api.updateAbilitiesEquipped(c.id, arr));
        alert('스킬이 저장되었어!');
      }catch(e){ alert('저장 실패: ' + (e.message||e)); }
    });

    // --- 아이템 로직 (모달 기반, 심플 카드) ---
    const slotsContainer = root.querySelector('.equipment-slots');
    const allItemsMap = new Map((c.items || []).map(item => [item.id, item]));
    let equippedItemIds = [...(c.equipped || [null, null, null])];

    function renderSlots() {
        slotsContainer.innerHTML = equippedItemIds.map((itemId, index) => {
            const item = itemId ? allItemsMap.get(itemId) : null;
            if (item) {
                return `<div class="equipment-slot equipped" data-slot-index="${index}" data-item-id="${item.id}">${simpleItemCard(item)}</div>`;
            }
            return `<div class="equipment-slot empty" data-slot-index="${index}"><span class="small" style="opacity:.7">장착 가능</span></div>`;
        }).join('');

        // 슬롯에 이벤트 리스너 다시 바인딩
        slotsContainer.querySelectorAll('.equipment-slot.equipped').forEach(slot => {
            slot.onclick = () => {
                const itemId = slot.dataset.itemId;
                const item = allItemsMap.get(itemId);
                showItemDetailModal(item, true); // 장착 해제 모달
            };
        });
    }
    
    function showItemDetailModal(item, isEquipped = false) {
        const modal = document.createElement('div');
        modal.className = 'modal-layer';
        
        const isAlreadyEquippedInAnotherSlot = equippedItemIds.includes(item.id);
        const canEquip = !isAlreadyEquippedInAnotherSlot && equippedItemIds.some(id => id === null);

        let actionButton = '';
        if (isEquipped) {
            actionButton = `<button class="btn full btn-danger" id="btn-unequip">장착 해제</button>`;
        } else {
            if(isAlreadyEquippedInAnotherSlot) {
                 actionButton = `<button class="btn full" disabled>이미 장착된 아이템입니다</button>`;
            } else if (canEquip) {
                 actionButton = `<button class="btn full" id="btn-equip">장착</button>`;
            } else {
                 actionButton = `<button class="btn full" disabled>장착 칸이 가득 찼습니다</button>`;
            }
        }

        modal.innerHTML = `
          <div class="modal-card">
            <button class="modal-close" aria-label="닫기">×</button>
            <div class="modal-body">
              ${itemCard(item)}
              <div style="display:flex; gap:8px; margin-top:16px;">
                <button class="btn secondary full" id="btn-modal-cancel">닫기</button>
                ${actionButton}
              </div>
            </div>
          </div>`;
        document.body.appendChild(modal);

        const closeModal = () => modal.remove();
        modal.querySelector('#btn-modal-cancel').onclick = closeModal;
        modal.onclick = (e) => { if(e.target === modal) closeModal(); };

        const equipBtn = modal.querySelector('#btn-equip');
        if (equipBtn) {
            equipBtn.onclick = () => {
                const emptySlotIndex = equippedItemIds.indexOf(null);
                if (emptySlotIndex !== -1) {
                    equippedItemIds[emptySlotIndex] = item.id;
                    renderSlots();
                }
                closeModal();
            };
        }
        
        const unequipBtn = modal.querySelector('#btn-unequip');
        if (unequipBtn) {
            unequipBtn.onclick = () => {
                const itemIndex = equippedItemIds.indexOf(item.id);
                if (itemIndex !== -1) {
                    equippedItemIds[itemIndex] = null;
                    renderSlots();
                }
                closeModal();
            };
        }
    }
    
    root.querySelectorAll('.inventory .simple-item-card.inv-item').forEach(cardEl => {
        const itemId = cardEl.dataset.itemId;
        if (!itemId) return;
        const item = allItemsMap.get(itemId);
        if (item) {
            cardEl.onclick = () => showItemDetailModal(item, equippedItemIds.includes(itemId));
        }
    });

    root.querySelector('#btn-save-items')?.addEventListener('click', async ()=>{
      try{
        await withBlocker(() => api.updateItemsEquipped(c.id, equippedItemIds));
        alert('아이템 장착 정보가 저장되었습니다.');
      }catch(e){ alert('저장 실패: ' + (e.message||e)); }
    });

    renderSlots();


    const fab = root.querySelector('.fab-battle');
    if (isOwner) {
      fab.hidden = false;
      fab.addEventListener('click', ()=>{
        location.hash = `#matching?me=${encodeURIComponent(c.id)}`;
      });
    } else {
      fab.hidden = true;
    }


  } catch(e) {
    console.error(e);
    root.innerHTML = `<div class="card pad err">캐릭터를 불러오지 못했어: ${e.message}</div>`;
  }
}
