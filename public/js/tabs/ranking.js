// /public/js/tabs/ranking.js
import { api } from '../api.js';

const ROOT = '[data-view="ranking"]';

function badgeRank(i) {
  return i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}`;
}

function charRow(c, i) {
  return `
    <div class="kv">
      <div class="k">${badgeRank(i)} ${c.name || '(이름없음)'}</div>
      <div class="v">Elo: <b>${c.elo ?? 1000}</b> · 소속: ${c.worldName || c.worldId || '-'}</div>
    </div>
  `;
}

function worldRow(w, i) {
  return `
    <div class="kv">
      <div class="k">${badgeRank(i)} ${w.name || '(이름없음)'}</div>
      <div class="v">인기도: <b>${w.likesCount || 0}</b></div>
    </div>
  `;
}

export async function mount() {
  const root = document.querySelector(ROOT);
  if (!root) return;

  root.innerHTML = `
    <div class="card pad">
      <div class="tabs small">
        <button class="tab on" data-t="char">캐릭터 랭킹</button>
        <button class="tab" data-t="world">세계관 랭킹</button>
      </div>
      <div id="rk-char"></div>
      <div id="rk-world" style="display:none"></div>
    </div>
  `;

  const $tabChar = root.querySelector('[data-t="char"]');
  const $tabWorld = root.querySelector('[data-t="world"]');
  const $char = root.querySelector('#rk-char');
  const $world = root.querySelector('#rk-world');

  $tabChar.onclick = () => {
    $tabChar.classList.add('on'); $tabWorld.classList.remove('on');
    $char.style.display = ''; $world.style.display = 'none';
  };
  $tabWorld.onclick = () => {
    $tabWorld.classList.add('on'); $tabChar.classList.remove('on');
    $world.style.display = ''; $char.style.display = 'none';
  };

  // 캐릭터 Elo 랭킹
  try {
    const r = await api.getCharacterRanking({ limit: 50 });
    const list = (r.ok && Array.isArray(r.data)) ? r.data : [];
    $char.innerHTML = list.length
      ? `<div class="list">${list.map((c,i)=>charRow(c,i)).join('')}</div>`
      : `<div class="small">랭킹 데이터가 없어요.</div>`;
  } catch (e) {
    console.error(e);
    $char.innerHTML = `<div class="small">캐릭터 랭킹을 불러오지 못했어.</div>`;
  }

  // 세계관 랭킹(인기도 순)
  try {
    const r = await api.getWorldRanking({ limit: 50 });
    const list = (r.ok && Array.isArray(r.data)) ? r.data : [];
    $world.innerHTML = list.length
      ? `<div class="list">${list.map((w,i)=>worldRow(w,i)).join('')}</div>`
      : `<div class="small">세계관 랭킹이 없어요.</div>`;
  } catch (e) {
    console.error(e);
    $world.innerHTML = `<div class="small">세계관 랭킹을 불러오지 못했어.</div>`;
  }
}
