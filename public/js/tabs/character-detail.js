// /public/js/tabs/character-detail.js
import { api, auth } from '../api.js';

const ROOT = '[data-view="character-detail"]';

const esc = s => String(s ?? '').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

// [수정] 서사 카드 템플릿 (세로 목록용)
function storyCard(s, full = false) {
  const content = esc(s?.long || '').replace(/\n/g, '<br>');
  return `<div class="story-card">
    <div class="story-title small">${esc(s?.title || '서사')}</div>
    <div class="story-content ${full ? '' : 'multiline-ellipsis'}">${parseRichText(content)}</div>
  </div>`;
}


// [신규] 리치 텍스트 파서
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
        <button data-tab="about" class="active">소개</button>
        <button data-tab="narrative">서사</button>
        <button data-tab="skills">스킬</button>
        <button data-tab="items">아이템</button>
        <button data-tab="battle-log">배틀 로그</button>
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
        </div>

        <div class="panel narrative">
          <div class="story-cards v-list">
            ${
              Array.isArray(c.narratives) && c.narratives.length
              ? c.narratives.map(n => storyCard(n, true)).join('')
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

        <div class="panel battle-log"><div class="spinner"></div></div>
      </div>
      <button class="fab-battle" hidden aria-label="배틀 시작">⚔</button>
    `;

    // 탭 전환
    const tabs = Array.from(root.querySelectorAll('.tabs-char button[data-tab]'));
    const panels = {
      about: root.querySelector('.panel.about'),
      narrative: root.querySelector('.panel.narrative'),
      skills: root.querySelector('.panel.skills'),
      items: root.querySelector('.panel.items'),
      'battle-log': root.querySelector('.panel.battle-log'),
    };
    tabs.forEach(btn=>{
      btn.onclick = ()=>{
        tabs.forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        Object.values(panels).forEach(p=>p.classList.remove('active'));
        const t = btn.dataset.tab;
        panels[t]?.classList.add('active');
      };
    });

    // 배틀 로그 탭 렌더링
    const battleLogPanel = root.querySelector('.panel.battle-log');
    try {
        const logRes = await api.getCharacterBattleLogs(characterId);
        if (logRes.ok && logRes.data.length > 0) {
            battleLogPanel.innerHTML = logRes.data.map(log => battleLogCard(log, characterId)).join('');
            battleLogPanel.addEventListener('click', e => {
                const card = e.target.closest('.battle-log-card');
                if (card) {
                    const content = card.querySelector('.battle-log-content');
                    content.style.display = content.style.display === 'none' ? 'block' : 'none';
                }
            });
        } else {
            battleLogPanel.innerHTML = '<div class="card pad small">아직 전투 기록이 없습니다.</div>';
        }
    } catch(e) {
        battleLogPanel.innerHTML = `<div class="card pad err">로그를 불러오는 데 실패했습니다: ${e.message}</div>`;
    }

    // --- 스킬: 3개 고정 선택 ---
    const skillEls = Array.from(root.querySelectorAll('.skills-list .skill'));
    const countEl = root.querySelector('.skills-head .count');
    const savedSkills = new Set(c.chosen || []);
    let selected = new Set(savedSkills);

    function syncSkillCount(){
      countEl.textContent = `${selected.size}/3`;
    }

    function syncSkillSelection(){
        skillEls.forEach(el => {
            el.classList.toggle('selected', selected.has(el.dataset.skillId));
        });
        syncSkillCount();
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
    syncSkillSelection(); // 초기 선택 상태 렌더링


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
