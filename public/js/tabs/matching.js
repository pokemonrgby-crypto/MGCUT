// public/js/tabs/matching.js
import { api } from '../api.js';
import { ui, withBlocker } from '../ui/frame.js';

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

async function render(meId) {
  const root = document.querySelector(ROOT);
  if (!root) return;

  root.innerHTML = `
    <div class="section-h">전투 준비</div>
    <div class="compare-wrap">
      <div class="compare-row" id="cmp-row"><div class="spinner"></div><div class="small" style="text-align:center;width:100%;">상대를 찾고 있습니다...</div></div>
    </div>
    <div id="battle-btn-area" style="margin:12px 16px"></div>
  `;

  try {
    const meRes = await api.getCharacter(meId);
    if (!meRes.ok) throw new Error('내 캐릭터를 찾을 수 없습니다.');
    const me = meRes.data;

    const matchResult = await api.findMatch(meId);
    const opId = matchResult?.data?.opponentId;
    if (!opId) throw new Error('비슷한 점수대의 상대를 찾을 수 없습니다. 잠시 후 다시 시도해주세요.');

    const opRes = await api.getCharacter(opId);
    if (!opRes.ok) throw new Error('상대 캐릭터 정보를 가져올 수 없습니다.');
    const op = opRes.data;

    const row = document.getElementById('cmp-row');
    row.innerHTML = cardHTML('나', me) + cardHTML('상대', op);

    document.getElementById('battle-btn-area').innerHTML = `
      <div class="card pad">
        <button id="btn-start-battle" class="btn full">전투 시작</button>
        <div class="small" style="opacity:.8;margin-top:8px; text-align:center;">전투 시뮬레이션을 위해 API 키가 사용됩니다.</div>
      </div>`;
    
    document.getElementById('btn-start-battle').onclick = async () => {
      try {
        await withBlocker(async () => {
          const battleRes = await api.createBattle(meId, opId);
          if (battleRes.ok) {
            ui.navTo(`battle?id=${battleRes.data.id}`);
          } else {
            throw new Error(battleRes.error || '배틀 생성 실패');
          }
        });
      } catch (e) {
        alert(`배틀 생성 실패: ${e.message}`);
      }
    };
  } catch (e) {
    document.getElementById('cmp-row').innerHTML = `<div class="card pad err">${e.message}</div>`;
  }
}

export function mount() {
  const m = location.hash.match(/#\/?matching\??(.*)$/);
  if (!m) return;
  const q = new URLSearchParams(m[1] || '');
  const meId = q.get('me');
  if (meId) {
    render(meId);
  }
}
