// public/js/tabs/home.js
import { api } from '../api.js';
import { withBlocker } from '../ui/frame.js';

const rootSel = '[data-view="home"]';

export async function mount(){
  const root = document.querySelector(rootSel);
  if (root.dataset.loaded === '1') return; // 이미 로드되었으면 중복 실행 방지
  
  await render();
  root.dataset.loaded = '1';
}

async function render(){
  const root = document.querySelector(rootSel);
  root.innerHTML = `
    <div class="section-h">추천 세계관</div>
    <div class="hscroll" id="home-worlds-list"></div>
    <div class="section-h">내 캐릭터</div>
    <div class="list" id="home-chars-list" style="padding:0 16px 16px"></div>
  `;

  const worldHost = root.querySelector('#home-worlds-list');
  const charHost = root.querySelector('#home-chars-list');
  
  // 클릭 이벤트 위임
  root.addEventListener('click', handleHomeClick);

  // 데이터 병렬 로딩
  worldHost.innerHTML = `<div class="chip">불러오는 중...</div>`;
  charHost.innerHTML = `<div class="card pad small">불러오는 중...</div>`;

  const [worldsRes, charsRes] = await Promise.all([
    api.listWorlds().catch(e => ({ ok: false, error: e })),
    api.getMyCharacters().catch(e => ({ ok: false, error: e }))
  ]);

  renderWorlds(worldsRes);
  renderCharacters(charsRes);
}

function renderWorlds(res) {
  const host = document.querySelector('#home-worlds-list');
  if (!res.ok) { host.innerHTML = `<div class="chip err">실패</div>`; return; }

  const worlds = res.data || [];
  if (worlds.length === 0) { host.innerHTML = `<div class="chip">만들어진 세계관이 없어요</div>`; return; }
  
  host.innerHTML = worlds.map(worldCard).join('');
}

function renderCharacters(res) {
  const host = document.querySelector('#home-chars-list');
  if (!res.ok) { host.innerHTML = `<div class="card pad err">실패</div>`; return; }
  
  const chars = res.data || [];
  if (chars.length === 0) { host.innerHTML = `<div class="card pad small">아직 생성한 캐릭터가 없어요.</div>`; return; }

  host.innerHTML = chars.map(charCard).join('');
}

// --- 카드 템플릿 ---
function worldCard(w) {
  const bg = w.coverUrl || '';
  return `
    <div class="card world-card h-card" data-nav-to="#world/${w.id}">
      <div class="bg" style="background-image:url('${bg}')"></div>
      <div class="grad"></div>
      <div class="title shadow-title">${w.name}</div>
      <button class="like-btn" data-action="like" data-id="${w.id}">❤️ ${w.likesCount || 0}</button>
    </div>
  `;
}
function charCard(c) {
  return `<div class="card pad small">${c.name} (${c.worldName})</div>`;
}

// --- 이벤트 핸들러 ---
async function handleHomeClick(e) {
  const navTo = e.target.closest('[data-nav-to]');
  if (navTo) {
    window.location.hash = navTo.dataset.navTo;
    return;
  }
  
  const likeBtn = e.target.closest('[data-action="like"]');
  if (likeBtn) {
    const worldId = likeBtn.dataset.id;
    likeBtn.disabled = true;
    try {
      await api.likeWorld(worldId);
      // 성공 시 홈 탭 다시 렌더링
      const root = document.querySelector(rootSel);
      root.removeAttribute('data-loaded');
      mount();
    } catch (err) {
      alert(`오류: ${err.message}`);
      likeBtn.disabled = false;
    }
  }
}
