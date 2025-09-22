// public/js/tabs/home.js
import { api } from '../api.js';
import { withBlocker } from '../ui/frame.js';

const rootSel = '[data-view="home"]';

export async function mount() {
  const root = document.querySelector(rootSel);
  if (root.dataset.loaded === '1') return;
  
  await render();
  root.dataset.loaded = '1';
}

async function render() {
  const root = document.querySelector(rootSel);
  root.innerHTML = `
    <div class="section-h">추천 세계관</div>
    <div class="carousel-container">
      <div class="hscroll" id="home-worlds-list"></div>
      <div class="carousel-dots" id="home-worlds-dots"></div>
      <button class="carousel-arrow prev" data-action="scroll-prev">‹</button>
      <button class="carousel-arrow next" data-action="scroll-next">›</button>
    </div>
    <div class="section-h">내 캐릭터</div>
    <div class="list" id="home-chars-list" style="padding:0 16px 16px"></div>
  `;

  // 이벤트 리스너 등록
  root.querySelector('#home-worlds-list').addEventListener('scroll', handleCarouselScroll);
  root.addEventListener('click', handleHomeClick);

  // 데이터 병렬 로딩
  const [worldsRes, charsRes] = await Promise.all([
    api.listWorlds().catch(e => ({ ok: false, error: e })),
    api.getMyCharacters().catch(e => ({ ok: false, error: e }))
  ]);

  renderWorlds(worldsRes);
  renderCharacters(charsRes);
}

function renderWorlds(res) {
  const host = document.querySelector('#home-worlds-list');
  const dotsHost = document.querySelector('#home-worlds-dots');
  
  if (!res.ok || !res.data || res.data.length === 0) {
    host.innerHTML = `<div class="card pad small" style="width: 100%;">생성된 세계관이 없어요.</div>`;
    dotsHost.innerHTML = '';
    return;
  }
  
  const worlds = res.data;
  host.innerHTML = worlds.map(worldCard).join('');
  dotsHost.innerHTML = worlds.map((_, i) => `<div class="dot ${i === 0 ? 'active' : ''}"></div>`).join('');
}

// ... renderCharacters, worldCard, charCard, handleHomeClick 함수는 이전과 동일 ...
function renderCharacters(res) {
  const host = document.querySelector('#home-chars-list');
  if (!res.ok) { host.innerHTML = `<div class="card pad err">실패: ${res.error.message}</div>`; return; }
  const chars = res.data || [];
  if (chars.length === 0) { host.innerHTML = `<div class="card pad small">아직 생성한 캐릭터가 없어요.</div>`; return; }
  host.innerHTML = chars.map(charCard).join('');
}
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
  return `<div class="card pad small">${c.name} (${c.worldName || '?'})</div>`;
}

async function handleHomeClick(e) {
  // 카드 클릭 시 상세 페이지로 이동
  const navTo = e.target.closest('[data-nav-to]');
  if (navTo) {
    window.location.hash = navTo.dataset.navTo;
    return;
  }
  
  // 좋아요 버튼 클릭
  const likeBtn = e.target.closest('[data-action="like"]');
  if (likeBtn) {
    // ... (기존 좋아요 로직 동일) ...
  }
  
  // [신규] 캐러셀 화살표 버튼 클릭
  const scrollBtn = e.target.closest('[data-action^="scroll-"]');
  if (scrollBtn) {
    const action = scrollBtn.dataset.action;
    const scrollContainer = document.querySelector('#home-worlds-list');
    const cardWidth = scrollContainer.querySelector('.h-card')?.offsetWidth || 0;
    const scrollAmount = action === 'scroll-next' ? cardWidth : -cardWidth;
    scrollContainer.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  }
}


// [신규] 캐러셀 스크롤 이벤트 핸들러
function handleCarouselScroll(e) {
  const scrollContainer = e.target;
  const dots = document.querySelectorAll('#home-worlds-dots .dot');
  if (dots.length === 0) return;

  const cardWidth = scrollContainer.querySelector('.h-card')?.offsetWidth || 0;
  const scrollLeft = scrollContainer.scrollLeft;
  // 현재 중앙에 가장 가까운 카드의 인덱스 계산
  const currentIndex = Math.round(scrollLeft / cardWidth);

  dots.forEach((dot, index) => {
    dot.classList.toggle('active', index === currentIndex);
  });
}
