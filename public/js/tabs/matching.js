// 전투 준비 화면
import { api } from '../api.js';

const ROOT = '[data-view="matching"]';

function tpl(c, side){
  const items = (c.items||[]).slice(0,3).map(it=>it?.name).filter(Boolean).join(' · ') || '-';
  const chosen = Array.isArray(c.chosen) ? c.chosen : [];
  const skills = Array.isArray(c.abilities) ? c.abilities : [];
  const picked = chosen.map(x => skills[x]?.name || skills.find(s=>s?.id===x||s?.name===x)?.name).filter(Boolean).join(' · ') || '-';
  return `
    <div class="card pad compare ${side}">
      <div class="cap">${side==='left'?'나':'상대'}</div>
      <div class="hero" style="background:#121826; background-image:linear-gradient(to top, rgba(0,0,0,.45), rgba(0,0,0,0)), url('${c.imageUrl||''}'); background-size:cover; background-position:center;"></div>

      <div class="name">${c.name||''}</div>
      <div class="small">Elo: <b>${c.elo??1000}</b></div>
      <div class="small">스킬: ${picked}</div>
      <div class="small">아이템: ${items}</div>
    </div>`;
}

async function render(meId, opId){
  const root = document.querySelector(ROOT);
  if (!root) return;
  root.innerHTML = `<div class="section-h">전투 준비</div>
    <div class="card pad" style="margin:12px 16px">
  <button id="btn-start-battle" class="btn full">전투 시작</button>
  <div class="small" style="opacity:.8;margin-top:6px">개인 API 키는 [내정보]에서 저장된 값을 사용해.</div>
</div>


  const wrap = root.querySelector('.compare-wrap');
  let me=null, op=null;

  const meRes = await api.getCharacter(meId); me = meRes.data;
  if (!opId){
    const r = await api.findMatch(meId);
    opId = r?.data?.opponentId;
  }
  if (!opId){ wrap.innerHTML = '<div class="card pad" style="margin:12px 16px">비슷한 점수대의 상대가 없어. 잠시 후 다시 시도해줘.</div>'; return; }
  const opRes = await api.getCharacter(opId); op = opRes.data;

  wrap.innerHTML = `<div class="compare-row">${tpl(me,'left')}${tpl(op,'right')}</div>`;

  // 키 복원
  root.querySelector('#btn-start-battle').onclick = async ()=>{
  // 키는 내정보의 GEMINI_KEY를 사용
  const key = localStorage.getItem('GEMINI_KEY') || '';
  if (!key) { alert('내정보에서 API 키를 먼저 저장해줘!'); return; }

  const r = await api.createBattle(meId, opId);
  const bId = r?.data?.id;
  if (!bId) return alert('배틀 생성 실패');
  location.hash = `#/battle?id=${encodeURIComponent(bId)}`;
};

}

// 간단한 라우팅 훅(해시 변화에 반응)
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
document.addEventListener('DOMContentLoaded', onRoute);
