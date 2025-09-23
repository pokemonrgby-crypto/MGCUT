// public/js/tabs/matching.js
import { api } from '../api.js';
import { ui } from '../ui/frame.js';

const ROOT = '[data-view="matching"]';
const esc = s => String(s??'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));

function cardHTML(side, c){
  const items = (c.items||[]).slice(0,3).map(it=>it?.name).filter(Boolean).join(' · ') || '-';
  const chosen = Array.isArray(c.chosen) ? c.chosen : [];
  const skills = Array.isArray(c.abilities) ? c.abilities : [];
  const picked = chosen
    .map(x => skills[x]?.name || skills.find(s=>s?.id===x||s?.name===x)?.name)
    .filter(Boolean).join(' · ') || '-';

  return `
    <div class="card pad compare">
      <div class="cap">${side}</div>
      <div class="hero js-hero" style="background-image: url('${esc(c.imageUrl || '')}')"></div>
      <div class="name">${esc(c.name||'')}</div>
      <div class="small">Elo: <b>${c.elo ?? 1000}</b></div>
      <div class="small">스킬: ${esc(picked)}</div>
      <div class="small">아이템: ${esc(items)}</div>
    </div>`;
}

async function render(meId, opId){
  const root = document.querySelector(ROOT);
  if (!root) return;

  root.innerHTML = `
    <div class="section-h">전투 준비</div>
    <div class="compare-wrap">
      <div class="compare-row" id="cmp-row"><div class="spinner"></div></div>
    </div>
    <div class="card pad" style="margin:12px 16px">
      <button id="btn-start-battle" class="btn full">전투 시작</button>
      <div class="small" style="opacity:.8;margin-top:6px">개인 API 키는 [내정보]에 저장된 값을 사용합니다.</div>
    </div>
  `;

  try {
    const me = (await api.getCharacter(meId))?.data;
    if (!me) throw new Error('내 캐릭터를 찾을 수 없습니다.');

    if (!opId) {
      const matchResult = await api.findMatch(meId);
      opId = matchResult?.data?.opponentId;
      if (!opId) throw new Error('비슷한 점수대의 상대를 찾을 수 없습니다.');
    }

    const op = (await api.getCharacter(opId))?.data;
    if (!op) throw new Error('상대 캐릭터 정보를 가져올 수 없습니다.');


    const row = document.getElementById('cmp-row');
    row.innerHTML = cardHTML('나', me) + cardHTML('상대', op);

    document.getElementById('btn-start-battle').onclick = async () => {
      const key = localStorage.getItem('GEMINI_KEY');
      if (!key) return alert('내정보에서 Gemini API 키를 먼저 저장해주세요.');
      
      try {
        const battleRes = await api.createBattle(meId, opId);
        if (battleRes.ok) {
          ui.navTo(`battle?id=${battleRes.data.id}`);
        } else {
          throw new Error(battleRes.error || '배틀 생성 실패');
        }
      } catch (e) {
        alert(`배틀 생성 실패: ${e.message}`);
      }
    };
  } catch (e) {
    document.getElementById('cmp-row').innerHTML = `<div class="card pad err">${e.message}</div>`;
  }
}

function onRoute(){
  const m = location.hash.match(/#\/matching\??(.*)$/);
  const root = document.querySelector(ROOT);
  if (!root) return;
  root.style.display = m ? '' : 'none';
  if (!m) return;
  const q = new URLSearchParams(m[1]||'');
  render(q.get('me'), q.get('op'));
}

window.addEventListener('hashchange', onRoute);
window.addEventListener('DOMContentLoaded', onRoute);
