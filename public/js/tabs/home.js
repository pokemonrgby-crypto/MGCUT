// /public/js/tabs/home.js
import { api } from '../api.js';
import { withBlocker } from '../ui/frame.js';

const rootSel = '[data-view="home"]';

export async function mount(){
  const root = document.querySelector(rootSel);
  if (!root || root.dataset.loaded === '1') return render(); // 이미 렌더된 경우 데이터만 갱신해도 됨
  root.dataset.loaded = '1';
  await render();
}

async function render(){
  const hostTop = document.querySelector(`${rootSel} .hscroll`);
  const hostList = document.querySelector(`${rootSel} .list`);

  // 스켈레톤
  hostTop.innerHTML = `<div class="chip">🔥 인기</div><div class="chip">🌌 신작</div><div class="chip">🧭 탐험</div><div class="chip">🎲 랜덤</div>`;
  hostList.innerHTML = `<div class="card pad small">불러오는 중...</div>`;

  const res = await withBlocker(()=>api.listWorlds());
  if (!res.ok){ hostList.innerHTML = `<div class="card pad">불러오기 실패: ${res.error}</div>`; return; }

  const worlds = (res.data||[]).slice(); // 최신 30 가정
  // 인기 상위 3 (likesCount desc)
  const popular = [...worlds].sort((a,b)=>(b.likesCount||0)-(a.likesCount||0)).slice(0,3);
  // 랜덤 2
  const rest = worlds.filter(w => !popular.find(p=>p.id===w.id));
  const random = shuffle(rest).slice(0,2);
  const picks = (popular.concat(random)).slice(0,5);

  hostList.innerHTML = '';
  if (picks.length===0){
    hostList.innerHTML = `<div class="card pad">아직 공개 세계관이 없어요.</div>`;
    return;
  }

  for (const w of picks){
    hostList.appendChild(worldCard(w));
  }
}

function worldCard(w){
  const div = document.createElement('div');
  div.className = 'card world-card';
  const bg = esc(w.coverUrl || '');
  const title = esc(w.name || '이름 없는 세계');
  div.innerHTML = `
    <div class="bg" style="background-image:url('${bg}')"></div>
    <div class="grad"></div>
    <div class="title">${title}</div>
  `;
  div.addEventListener('click', ()=>{
    // TODO: 상세 화면으로 이동(추후)
  });
  return div;
}

function shuffle(a){return a.sort(()=>Math.random()-.5)}
function esc(s){return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
