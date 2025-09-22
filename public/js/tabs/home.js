import { api } from '../api.js';
import { withBlocker } from '../ui/frame.js';

const rootSel = '[data-view="home"]';

export async function mount(){
  const root = document.querySelector(rootSel);
  // 이미 로드된 데이터가 있다면 다시 로드하지 않음 (원한다면 새로고침 로직 추가 가능)
  if (!root || root.dataset.loaded === '1') return;
  root.dataset.loaded = '1';
  await render();
}

async function render(){
  const hostTop = document.querySelector(`${rootSel} .hscroll`);
  const hostList = document.querySelector(`${rootSel} .list`);

  hostTop.innerHTML = `<div class="chip">🔥 인기</div><div class="chip">🌌 신작</div><div class="chip">🧭 탐험</div><div class="chip">🎲 랜덤</div>`;
  hostList.innerHTML = `<div class="card pad small">세계관 목록을 불러오는 중...</div>`;

  try {
    const res = await withBlocker(()=>api.listWorlds());
    const worlds = (res.data||[]).slice();

    if (worlds.length === 0){
      hostList.innerHTML = `<div class="card pad">아직 공개된 세계관이 없어요. 생성 탭에서 첫 세계를 만들어보세요!</div>`;
      return;
    }

    const popular = [...worlds].sort((a,b)=>(b.likesCount||0)-(a.likesCount||0)).slice(0,3);
    const rest = worlds.filter(w => !popular.find(p=>p.id===w.id));
    const random = shuffle(rest).slice(0,2);
    const picks = popular.concat(random).slice(0,5);

    hostList.innerHTML = '';
    for (const w of picks){
      hostList.appendChild(worldCard(w));
    }
  } catch (e) {
    hostList.innerHTML = `<div class="card pad err">목록을 불러오지 못했습니다: ${e.message}</div>`;
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
    <div class="title shadow-title">${title}</div>
  `;
  div.addEventListener('click', ()=>{
    alert(`'${title}' 세계관 상세 보기 (구현 예정)`);
  });
  return div;
}

function shuffle(a){return a.sort(()=>Math.random()-.5)}
function esc(s){return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
