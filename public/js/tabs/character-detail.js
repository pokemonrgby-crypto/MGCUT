// /public/js/tabs/character-detail.js
import { api } from '../api.js';

const ROOT = '[data-view="character-detail"]';
function itemBadge(it){
  const r = (it?.rarity || 'N').toUpperCase(); // N/R/SR/SSR/UR
  return `<span class="chip ${r}">${it.name || '-'} · ${r}</span>`;
}

export async function mount(characterId){
  const root = document.querySelector(ROOT);
  if(!root) return;
  if(!characterId){ root.innerHTML = `<div class="card pad">캐릭터 ID가 없어요.</div>`; return; }

  try{
    const { ok, data:c } = await api.getCharacter(characterId);
    if(!ok) throw new Error('로드 실패');

    root.innerHTML = `
      <div class="detail-header">
        <div class="grad"></div>
        <h2 class="shadow-title">${c.name || '(이름없음)'}</h2>
      </div>
      <div class="detail-content">
        <div class="card pad">
          <div class="kv"><div class="k">소속 세계관</div><div class="v">${c.worldName || c.worldId || '-'}</div></div>
          <div class="kv"><div class="k">Elo</div><div class="v"><b>${c.elo ?? 1000}</b></div></div>
          <div class="kv"><div class="k">설명</div><div class="v">${(c.description||'').replace(/\n/g,'<br>')}</div></div>
        </div>
        <div class="card pad">
          <div class="small" style="margin-bottom:8px"><b>아이템</b> (기본 0개, 등급: N/R/SR/SSR/UR)</div>
          <div class="grid">
            ${(Array.isArray(c.items)&&c.items.length)? c.items.map(itemBadge).join('') : '<div class="small">아이템이 없어요.</div>'}
          </div>
        </div>
      </div>`;
  }catch(e){
    console.error(e);
    root.innerHTML = `<div class="card pad">캐릭터를 불러오지 못했어: ${e.message}</div>`;
  }
}
