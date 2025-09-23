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
      <div class="hero" style="background-image:url('${c.imageUrl||''}')"></div>
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
    <div class="compare-wrap"></div>
    <div class="card pad" style="margin:12px 16px">
      <div class="small" style="margin-bottom:6px">OpenAI API Key</div>
      <input id="user-openai-key" type="password" placeholder="sk-..." style="width:100%">
      <label class="small" style="display:flex;gap:6px;align-items:center;margin-top:8px">
        <input type="checkbox" id="save-key"> 브라우저에 저장
      </label>
      <button id="btn-start-battle" class="btn full" style="margin-top:12px">전투 시작</button>
    </div>`;

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
  const keyInput = root.querySelector('#user-openai-key');
  const cbSave = root.querySelector('#save-key');
  const saved = localStorage.getItem('OPENAI_KEY') || '';
  if (saved) { keyInput.value = saved; cbSave.checked = true; }

  root.querySelector('#btn-start-battle').onclick = async ()=>{
    const key = keyInput.value.trim();
    if (!key) return alert('API 키를 입력해줘!');
    if (cbSave.checked) localStorage.setItem('OPENAI_KEY', key); else localStorage.removeItem('OPENAI_KEY');

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
