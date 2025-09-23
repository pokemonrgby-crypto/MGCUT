// /public/js/tabs/ranking.js
import { api } from '../api.js';

const ROOT = '[data-view="ranking"]';

function badge(i){ return i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}`; }

function charRow(c,i){
  return `
    <div class="kv">
      <div class="k">${badge(i)} ${c.name || '(이름없음)'}</div>
      <div class="v">Elo: <b>${c.elo ?? 1000}</b> · 소속: ${c.worldName || c.worldId || '-'}</div>
    </div>`;
}
function worldRow(w,i){
  return `
    <div class="kv">
      <div class="k">${badge(i)} ${w.name || '(이름없음)'}</div>
      <div class="v">인기도: <b>${w.likesCount || 0}</b></div>
    </div>`;
}

export async function mount(){
  const root = document.querySelector(ROOT);
  if(!root) return;

  root.innerHTML = `
    <div class="card pad">
      <div class="tabs small">
        <button class="tab on" data-t="char">캐릭터 랭킹</button>
        <button class="tab" data-t="world">세계관 랭킹</button>
      </div>
      <div id="rk-char"><div class="small">불러오는 중…</div></div>
      <div id="rk-world" style="display:none"><div class="small">불러오는 중…</div></div>
    </div>`;

  const tabC = root.querySelector('[data-t="char"]');
  const tabW = root.querySelector('[data-t="world"]');
  const boxC = root.querySelector('#rk-char');
  const boxW = root.querySelector('#rk-world');

  tabC.onclick = ()=>{ tabC.classList.add('on'); tabW.classList.remove('on'); boxC.style.display=''; boxW.style.display='none'; };
  tabW.onclick = ()=>{ tabW.classList.add('on'); tabC.classList.remove('on'); boxW.style.display=''; boxC.style.display='none'; };

  try{
    const r = await api.getCharacterRanking({limit:50});
    const list = (r.ok && Array.isArray(r.data)) ? r.data : [];
    boxC.innerHTML = list.length ? list.map(charRow).map((h,i)=>h.replace('badge(i)',i)).join('') :
      `<div class="small">랭킹 데이터가 없어요.</div>`;
    // index 바인딩
    if(list.length) boxC.innerHTML = list.map((c,i)=>charRow(c,i)).join('');
  }catch(e){
    console.error(e); boxC.innerHTML = `<div class="small">캐릭터 랭킹을 불러오지 못했어.</div>`;
  }

  try{
    const r = await api.getWorldRanking({limit:50});
    const list = (r.ok && Array.isArray(r.data)) ? r.data : [];
    boxW.innerHTML = list.length ? list.map((w,i)=>worldRow(w,i)).join('') :
      `<div class="small">세계관 랭킹이 없어요.</div>`;
  }catch(e){
    console.error(e); boxW.innerHTML = `<div class="small">세계관 랭킹을 불러오지 못했어.</div>`;
  }
}
