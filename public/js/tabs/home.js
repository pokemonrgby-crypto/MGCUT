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
    <div class="grid3" id="home-chars-list" style="padding:0 16px 16px"></div>
  `;

  root.addEventListener('click', handleHomeClick);

  const [worldsRes, charsRes] = await Promise.all([
    api.listWorlds().catch(e => ({ ok: false, error: e })),
    api.getMyCharacters().catch(e => ({ ok: false, error: e }))
  ]);

  renderWorlds(worldsRes);
  renderCharacters(charsRes);

  // 캐러셀 관련 이벤트는 데이터 로딩 후에 바인딩
  const scrollContainer = root.querySelector('#home-worlds-list');
  if (scrollContainer) {
    scrollContainer.addEventListener('scroll', handleCarouselScroll);
  }
}

function renderWorlds(res) {
  const host = document.querySelector('#home-worlds-list');
  const dotsHost = document.querySelector('#home-worlds-dots');
  
  if (!res.ok || !res.data || res.data.length === 0) {
    host.innerHTML = `<div class="card pad small" style="width: 100%;">생성된 세계관이 없어요.</div>`;
    if(dotsHost) dotsHost.innerHTML = '';
    return;
  }
  
  const worlds = res.data;
  host.innerHTML = worlds.map(w => worldCard(w, 'h-card')).join(''); // 캐러셀용 클래스 추가
  if(dotsHost) dotsHost.innerHTML = worlds.map((_, i) => `<div class="dot ${i === 0 ? 'active' : ''}"></div>`).join('');
}

function renderCharacters(res) {
  const host = document.querySelector('#home-chars-list');
  if (!res.ok) { host.innerHTML = `<div class="card pad err">실패: ${res.error.message}</div>`; return; }
  const chars = res.data || [];
  if (chars.length === 0) { host.innerHTML = `<div class="card pad small">아직 생성한 캐릭터가 없어요.</div>`; return; }
  host.innerHTML = chars.map(c => characterCard(c)).join(''); // characterCard 함수 사용
}

// [공용] 카드 템플릿들
function worldCard(w, extraClass = '') {
  const bg = w.coverUrl || '';
  return `
    <div class="card world-card ${extraClass}" data-nav-to="#world/${w.id}">
      <div class="bg" style="background-image:url('${bg}')"></div>
      <div class="grad"></div>
      <div class="title shadow-title">${w.name}</div>
      <button class="like-btn" data-action="like" data-id="${w.id}">❤️ ${w.likesCount || 0}</button>
    </div>
  `;
}

function characterCard(c, extraClass = '') {
  const bg = c.imageUrl || '';
  return `
    <div class="card character-card ${extraClass}" data-nav-to="#character/${c.id}">
      <div class="bg" style="background-image:url('${bg}')"></div>
      <div class="grad"></div>
      <div class="title shadow-title">${c.name}</div>
      <div class="char-info">ELO: ${c.elo || 1200}</div>
    </div>
  `;
}


async function handleHomeClick(e) {
  const navTo = e.target.closest('[data-nav-to]');
  if (navTo) {
    window.location.hash = navTo.dataset.navTo;
    return;
  }
  
  const likeBtn = e.target.closest('[data-action="like"]');
  if (likeBtn) {
    likeBtn.disabled = true;
    try {
      await withBlocker(() => api.likeWorld(likeBtn.dataset.id));
      // 좋아요 수치만 업데이트 (전체 리렌더링 방지)
      const count = likeBtn.textContent.match(/\d+/) || [0];
      const currentLikes = parseInt(count[0], 10);
      likeBtn.textContent = `❤️ ${currentLikes + 1}`; // 낙관적 업데이트
    } catch(e) {
      alert(`오류: ${e.message}`);
    } finally {
      likeBtn.disabled = false;
    }
  }
  
  const scrollBtn = e.target.closest('[data-action^="scroll-"]');
  if (scrollBtn) {
    const action = scrollBtn.dataset.action;
    const scrollContainer = document.querySelector('#home-worlds-list');
    if (!scrollContainer) return;
    const cardWidth = scrollContainer.querySelector('.h-card')?.offsetWidth || 0;
    const scrollAmount = action === 'scroll-next' ? cardWidth + 12 : -(cardWidth + 12); // gap 포함
    scrollContainer.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  }
}

function handleCarouselScroll(e) {
  const scrollContainer = e.target;
  const dots = document.querySelectorAll('#home-worlds-dots .dot');
  if (dots.length === 0) return;

  const cardWidth = scrollContainer.querySelector('.h-card')?.offsetWidth + 12 || 0;
  const scrollLeft = scrollContainer.scrollLeft + (cardWidth / 2);
  const currentIndex = Math.floor(scrollLeft / cardWidth);

  dots.forEach((dot, index) => {
    dot.classList.toggle('active', index === currentIndex);
  });
}
