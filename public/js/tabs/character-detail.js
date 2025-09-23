// (수정된 결과)
// /public/js/tabs/character-detail.js
import { api, auth } from '../api.js';

const ROOT = '[data-view="character-detail"]';

const esc = s => String(s ?? '').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function storyCard(s){
  return `<div class="story-card">
    <div class="small" style="opacity:.8;margin-bottom:6px">${esc(s?.title||'서사')}</div>
    <div>${esc(s?.long||'').replace(/\n/g,'<br>')}</div>
  </div>`;
}

// [신규] 리치 텍스트 파서 (md와 유사하지만, 여기서는 로그용으로 간단하게 만듦)
function parseRichText(text) {
  if (!text) return '';
  return text
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
  const id = sk?.id || sk?.name || '';
  const name = sk?.name || '(이름없음)';
  const desc = sk?.desc || sk?.description || '';
  return `<button class="skill" data-skill-id="${esc(id)}" title="${esc(desc)}">
    <div style="font-weight:700">${esc(name)}</div>
    ${desc ? `<span class="small">${esc(desc)}</span>` : ''}
  </button>`;
}

function itemChip(it){
  const raw = String(it?.rarity || it?.grade || 'N').toUpperCase();
  const map = { COMMON:'N', NORMAL:'N', RARE:'R', EPIC:'SR', LEGENDARY:'UR', SSR:'SSR', UR:'UR' };
  const r = map[raw] || raw;
  return `<div class="item" data-item-name="${esc(it?.name||'')}">
    <div style="font-weight:700">${esc(it?.name||'(아이템)')}</div>
    <div class="small" style="opacity:.85;margin-top:3px">등급: ${r}</div>
  </div>`;
}
function slotBox(content='', idx=0){
  return `<div class="slot" data-slot="${idx}">${content || '<span class="small" style="opacity:.7">빈 슬롯</span>'}</div>`;
}

// [신규] 배틀 로그 카드 템플릿
function battleLogCard(log, currentCharId) {
    const isMeA = log.meId === currentCharId;
    const result = log.winner === (isMeA ? 'A' : 'B') ? '승리' : '패배';
    const resultClass = result === '승리' ? 'ok' : 'err';
    
    const myEloBefore = isMeA ? log.eloMe : log.eloOp;
    const myEloAfter = isMeA ? log.eloMeAfter : log.eloOpAfter;
    const eloChange = myEloAfter - myEloBefore;
    const eloChangeStr = eloChange > 0 ? `+${eloChange}` : eloChange;

    const opponentName = isMeA ? log.opName : log.meName;
    const date = new Date((log.createdAt?.seconds || 0) * 1000).toLocaleString();

    return `
    <div class="card info-card battle-log-card">
        <div class="kv">
            <div class="k">vs ${esc(opponentName)}</div>
            <div class="v" style="font-weight:700;">
                <span class="${resultClass}">${result}</span>
                (Elo ${myEloAfter} <span class="small ${resultClass}">(${eloChangeStr})</span>)
            </div>
        </div>
        <div class="small" style="padding: 0 16px 12px; opacity: .7">${date}</div>
        <div class="battle-log-content" style="display:none; padding: 0 16px 16px; white-space: pre-wrap; font-size: 13px; line-height: 1.6;">${parseRichText(esc(log.log))}</div>
    </div>
    `;
}


export async function mount(characterId){
  const root = document.querySelector(ROOT);
  if (!root) return;
  if (!characterId){ root.innerHTML = `<div class="card pad">캐릭터 ID가 없어요.</div>`; return; }

  root.innerHTML = `<div class="spinner"></div>`; // 초기 로딩 스피너

  try{
    const { ok, data:c } = await api.getCharacter(characterId);
    if (!ok) throw new Error('로드 실패');

    root.innerHTML = `
      <div class="char-hero">
        <div class="bg" style="${c.imageUrl?`background-image:url('${esc(c.imageUrl)}')`:''}"></div>
        <div class="grad"></div>
        <div class="title shadow-title">${esc(c.name || '(이름없음)')}</div>
      </div>

      <div class="tabs tabs-char">
        <button data-tab="about" class="active">소개·서사</button>
        <button data-tab="skills">스킬(3)</button>
        <button data-tab="items">아이템</button>
        <button data-tab="timeline">타임라인</button>
      </div>

      <div class="tab-panels">
        <div class="panel about active">
          <div class="info-card">
            <div class="name">${esc(c.name||'')}</div>
            <div class="desc">${parseRichText(esc(c.introLong||c.introShort||''))}</div>
          </div>
          <div class="info-card">
            <div class="kv"><div class="k">소속 세계관</div><div class="v small">${esc(c.worldName || c.worldId || '-')}</div></div>
            <div class="kv"><div class="k">Elo</div><div class="v"><b>${c.elo ?? 1000}</b></div></div>
          </div>
          <div class="story-cards rail">
            ${
              Array.isArray(c.narratives) && c.narratives.length
              ? c.narratives.map(n => storyCard(n)).join('')
              : `<div class="small" style="opacity:.8">아직 서사가 없어요.</div>`
            }
          </div>
        </div>

        <div class="panel skills">
          <div class="skills-head"><span class="count">0/3</span><div style="flex:1"></div><button class="btn small" id="btn-save-skills">저장</button></div>
          <div class="skills-list vlist">
            ${
              Array.isArray(c.abilities) && c.abilities.length
              ? c.abilities.map(skillChip).join('')
              : `<div class="small" style="opacity:.8">등록된 스킬이 없어요.</div>`
            }
          </div>
        </div>

        <div class="panel items">
          <div class="small" style="opacity:.9;margin:6px 0 8px">장착 슬롯 (3칸)</div>
          <div class="slots">${[0,1,2].map(i=>slotBox('', i)).join('')}</div>
          <div style="display:flex;gap:8px;margin:10px 0 12px">
            <button class="btn small" id="btn-clear-slots">슬롯 비우기</button>
            <button class="btn small" id="btn-save-items">저장</button>
          </div>
          <div class="small" style="opacity:.9;margin:10px 0 6px">인벤토리</div>
          <div class="inventory grid3">
            ${
              Array.isArray(c.items) && c.items.length
              ? c.items.map(itemChip).join('')
              : `<div class="small" style="opacity:.8">아이템이 없어요.</div>`
            }
          </div>
        </div>

        <div class="panel timeline"><div class="spinner"></div></div>
      </div>
      <button class="fab-battle" hidden aria-label="배틀 시작">⚔</button>
    `;

    // 탭 전환
    const tabs = Array.from(root.querySelectorAll('.tabs-char [data-tab]'));
    const panels = {
      about: root.querySelector('.panel.about'),
      skills: root.querySelector('.panel.skills'),
      items: root.querySelector('.panel.items'),
      timeline: root.querySelector('.panel.timeline'),
    };
    tabs.forEach(btn=>{
      btn.onclick = ()=>{
        tabs.forEach(b=>b.classList.toggle('active', b===btn));
        Object.values(panels).forEach(p=>p.classList.remove('active'));
        const t = btn.getAttribute('data-tab');
        panels[t]?.classList.add('active');
      };
    });

    // [수정] 타임라인 데이터 로드 및 렌더링
    const timelinePanel = root.querySelector('.panel.timeline');
    try {
        const logRes = await api.getCharacterBattleLogs(characterId);
        if (logRes.ok && logRes.data.length > 0) {
            timelinePanel.innerHTML = logRes.data.map(log => battleLogCard(log, characterId)).join('');
            // 로그 카드 클릭 시 내용 토글
            timelinePanel.addEventListener('click', e => {
                const card = e.target.closest('.battle-log-card');
                if (card) {
                    const content = card.querySelector('.battle-log-content');
                    content.style.display = content.style.display === 'none' ? 'block' : 'none';
                }
            });
        } else {
            timelinePanel.innerHTML = '<div class="card pad small">아직 전투 기록이 없습니다.</div>';
        }
    } catch(e) {
        timelinePanel.innerHTML = `<div class="card pad err">로그를 불러오는 데 실패했습니다: ${e.message}</div>`;
    }

    // (기존 나머지 이벤트 바인딩 코드...)
    // FAB, 스킬, 아이템, 서사 모달 등은 여기에 그대로 유지됩니다.
    // --- 서사 카드 클릭 시 전체보기 모달 ---
    const storyWrap = root.querySelector('.story-cards');
    if (storyWrap){
      storyWrap.addEventListener('click', (e)=>{
        const card = e.target.closest('.story-card');
        if (!card) return;
        const html = card.innerHTML;
        const modal = document.createElement('div');
        modal.className = 'modal-layer';
        modal.innerHTML = `
          <div class="modal-card">
            <button class="modal-close" aria-label="닫기">×</button>
            <div class="modal-body">${parseRichText(html)}</div>
          </div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', (ev)=>{
          if (ev.target === modal || ev.target.classList.contains('modal-close')) {
            modal.remove();
          }
        });
      });
    }


    // --- 스킬: 3개 고정 선택 ---
    const skillEls = Array.from(root.querySelectorAll('.skills-list .skill'));
    const countEl = root.querySelector('.skills-head .count');
    const selected = new Set();
    function syncSkillCount(){
      countEl.textContent = `${selected.size}/3`;
    }
    function toggleSkill(el){
      const id = el.getAttribute('data-skill-id');
      if (el.classList.contains('selected')) {
        el.classList.remove('selected');
        selected.delete(id);
      } else {
        if (selected.size >= 3) {
          const first = selected.values().next().value;
          if (first){
            const old = skillEls.find(k=>k.getAttribute('data-skill-id')===first);
            old?.classList.remove('selected');
            selected.delete(first);
          }
        }
        el.classList.add('selected');
        selected.add(id);
      }
      syncSkillCount();
    }
    skillEls.forEach(el=> el.onclick = ()=> toggleSkill(el));
    syncSkillCount();

    // 저장(스킬)
    root.querySelector('#btn-save-skills')?.addEventListener('click', async ()=>{
      const arr = Array.from(selected);
      try{
        await api.updateAbilitiesEquipped(c.id, arr);
        alert('스킬이 저장되었어!');
      }catch(e){ alert('저장 실패: ' + (e.message||e)); }
    });

    // --- 아이템: 슬롯 3칸 간단 장착 UI ---
    const slots = Array.from(root.querySelectorAll('.slots .slot'));
    const invItems = Array.from(root.querySelectorAll('.inventory .item'));
    function putIntoFirstEmpty(itemHtml, itemName){
      const empty = slots.find(s=>!s.dataset.itemName);
      if (empty) {
        empty.innerHTML = itemHtml;
        empty.dataset.itemName = itemName;
      }
    }
    invItems.forEach(el=>{
      el.onclick = ()=>{
        const itemName = el.dataset.itemName || el.getAttribute('data-item-name') || '';
        putIntoFirstEmpty(`<div class="item in-slot" data-item-name="${esc(itemName)}">${el.innerHTML}</div>`, itemName);
      };
    });
    slots.forEach(s=>{
      s.onclick = ()=>{
        s.innerHTML = '<span class="small" style="opacity:.7">빈 슬롯</span>';
        delete s.dataset.itemName;
      };
    });
    root.querySelector('#btn-clear-slots')?.addEventListener('click', ()=>{
      slots.forEach(s=>{
        s.innerHTML = '<span class="small" style="opacity:.7">빈 슬롯</span>';
        delete s.dataset.itemName;
      });
    });
    root.querySelector('#btn-save-items')?.addEventListener('click', async ()=>{
      const names = slots.map(s=>s.dataset.itemName||null);
      try{
        await api.updateItemsEquipped(c.id, names);
        alert('아이템 장착이 저장되었어!');
      }catch(e){ alert('저장 실패: ' + (e.message||e)); }
    });

    // --- FAB: 본인 소유일 때만 표시 ---
    const fab = root.querySelector('.fab-battle');
    const currentUid = auth.currentUser?.uid;
    if (currentUid && c.ownerUid && currentUid === c.ownerUid) {
      fab.hidden = false;
      fab.addEventListener('click', ()=>{
        location.hash = `#matching?me=${encodeURIComponent(c.id)}`;
      });
    } else {
      fab.hidden = true;
    }

  }catch(e){
    console.error(e);
    root.innerHTML = `<div class="card pad err">캐릭터를 불러오지 못했어: ${e.message}</div>`;
  }
}
