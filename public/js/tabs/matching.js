// /public/js/tabs/matching.js — 안전 템플릿 버전
import { api } from '../api.js';

const ROOT = '[data-view="matching"]';
const esc = s => String(s??'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));

function cardHTML(side, c){
  const items = (c.items||[]).slice(0,3).map(it=>it?.name).filter(Boolean).join(' · ') || '-';
  const chosen = Array.isArray(c.chosen) ? c.chosen : [];
  const skills = Array.isArray(c.abilities) ? c.abilities : [];
  const picked = chosen
    .map(x => skills[x]?.name || skills.find(s=>s?.id===x||s?.name===x)?.name)
    .filter(Boolean).join(' · ') || '-';

  // hero는 나중에 style로 이미지만 주입(따옴표 충돌 방지)
  return `
    <div class="card pad compare">
      <div class="cap">${side}</div>
      <div class="hero js-hero"></div>
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
      <div class="compare-row" id="cmp-row"></div>
    </div>
    <div class="card pad" style="margin:12px 16px">
      <button id="btn-start-battle" class="btn full">전투 시작</button>
      <div class="small" style="opacity:.8;margin-top:6px">개인 API 키는 [내정보]에 저장된 값을 사용해.</div>
    </div>
  `;

  // 데이터 로드
  const me = (await api.getCharacter(meId))?.data;
  if (!me){ document.getElementById('cmp-row').innerHTML = `<div class="card pad">내 캐릭터를 찾을 수 없어요.</div>`; return; }

  if (!opId){
    const r = await api.findMatch?.(meId); // 있으면 사용
    opId = r?.data?.opponentId || null;
  }
  if (!opId){ document.getElementById('cmp-row').innerHTML = `<div class="card pad">비슷한 점수대의 상대가 없어. 잠시 후 다시 시도해줘.</div>`; return; }

  const op = (await api.getCharacter(opId))?.data;

  // 카드 렌더
  const row = document.getElementById('cmp-row');
  row.innerHTML = cardHTML('나', me) + cardHTML('상대', op);

  // 이미지 주입(문자열 밖에서 style 세팅)
  const [heroMe, heroOp] = row.querySelectorAll('.js-hero');
  if (heroMe) heroMe.style.cssText = `height:180px;border-radius:12px;background:#121826 center/cover no-repeat;margin-bottom:8px;background-image:${me.imageUrl?`url('${me.imageUrl}')`:'none'};`;
  if (heroOp) heroOp.style.cssText = `height:180px;border-radius:12px;background:#121826 center/cover no-repeat;margin-bottom:8px;background-image:${op.imageUrl?`url('${op.imageUrl}')`:'none'};`;

  // 시작 버튼
  const btn = root.querySelector('#btn-start-battle');
  btn.onclick = async ()=>{
    const key = localStorage.getItem('GEMINI_KEY') || '';
    if (!key){ alert('내정보에서 API 키를 먼저 저장해줘!'); return; }
    const r = await api.createBattle?.(meId, opId);
    const bId = r?.data?.id;
    if (!bId){ alert('배틀 생성 실패'); return; }
    location.hash = `#/battle?id=${encodeURIComponent(bId)}`;
  };
}

// 해시 라우팅
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
