// public/js/tabs/world-detail.js
import { api, auth } from '../api.js';

const rootSel = '[data-view="world-detail"]';

export async function mount(worldId) {
  const root = document.querySelector(rootSel);
  if (!root || !worldId) return;

  // [수정] mount 함수가 호출될 때마다 내용을 초기화하여 이전 데이터가 남지 않도록 함
  // 헤더와 콘텐츠 영역의 기본 구조를 다시 그려줌
  root.innerHTML = `
    <div class="detail-header">
      <div class="grad"></div>
      <h2 class="shadow-title" id="world-detail-name"></h2>
    </div>
    <div class="detail-content">
      <div class="spinner"></div>
    </div>
  `;
  
  try {
    const res = await api.getWorld(worldId);
    render(res.data);
  } catch (e) {
    // 오류 발생 시에도 content 영역만 안전하게 수정
    const contentArea = root.querySelector('.detail-content');
    if (contentArea) {
      contentArea.innerHTML = `<div class="card pad">오류: ${e.message}</div>`;
    }
  }
}

function render(world) {
  const root = document.querySelector(rootSel);
  const contentArea = root.querySelector('.detail-content');
  if (!contentArea) return; // 콘텐츠 영역이 없으면 중단

  const cover = world.coverUrl || '';
  
  // 헤더 업데이트
  const headerEl = root.querySelector('.detail-header');
  if (headerEl) headerEl.style.backgroundImage = `url('${cover}')`;

  root.querySelector('#world-detail-name').textContent = world.name;

  // 콘텐츠 영역 채우기
  contentArea.innerHTML = `
    <div id="world-admin-panel" style="display:none; margin-bottom: 16px;">
      <button class="btn secondary full">콘텐츠 추가/수정</button>
    </div>
    <div class="detail-tabs-nav">
      <button class="tab-btn active" data-tab="intro">소개</button>
      <button class="tab-btn" data-tab="factions">세력</button>
      <button class="tab-btn" data-tab="npcs">주요 인물</button>
      <button class="tab-btn" data-tab="episodes">에피소드</button>
    </div>
    <div class="tab-content" id="tab-intro"></div>
    <div class="tab-content" id="tab-factions" style="display: none;"></div>
    <div class="tab-content" id="tab-npcs" style="display: none;"></div>
    <div class="tab-content" id="tab-episodes" style="display: none;"></div>
  `;

  // 소유자 관리 패널 표시
  if (auth.currentUser && auth.currentUser.uid === world.ownerUid) {
    const adminPanel = root.querySelector('#world-admin-panel');
    if (adminPanel) adminPanel.style.display = 'block';

  }

  // 각 탭 콘텐츠 렌더링
  root.querySelector('#tab-intro').innerHTML = `<div class="card pad"><p>${world.introLong || world.introShort}</p></div>`;
  root.querySelector('#tab-factions').innerHTML = (world.factions || []).map(f => infoCard(f.name, f.description)).join('');
  root.querySelector('#tab-npcs').innerHTML = (world.npcs || []).map(n => infoCard(n.name, n.description)).join('');
  root.querySelector('#tab-episodes').innerHTML = (world.episodes || []).map(e => episodeCard(e.title, e.content)).join('');

  bindTabEvents(root);
}

function infoCard(name, description) { /* ... 이전과 동일 ... */ }
function episodeCard(title, content) { /* ... 이전과 동일 ... */ }
function parseRichText(text) { /* ... 이전과 동일 ... */ }

function bindTabEvents(container) {
  const nav = container.querySelector('.detail-tabs-nav');
  const contents = container.querySelectorAll('.tab-content');
  const buttons = nav.querySelectorAll('.tab-btn');

  nav.onclick = (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    const tabId = `tab-${btn.dataset.tab}`;
    buttons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    contents.forEach(c => c.style.display = c.id === tabId ? '' : 'none');
  };

  buttons.forEach(b => b.classList.remove('active'));
  contents.forEach(c => c.style.display = 'none');
  if (buttons[0]) buttons[0].classList.add('active');
  if (contents[0]) contents[0].style.display = '';
}
