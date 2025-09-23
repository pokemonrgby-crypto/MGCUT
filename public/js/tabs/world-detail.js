// public/js/tabs/world-detail.js
import { api, auth } from '../api.js';

const rootSel = '[data-view="world-detail"]';

export async function mount(worldId) {
  const root = document.querySelector(rootSel);
  if (!root || !worldId) return;

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
    render(worldId, res.data); // worldId를 render 함수에 전달
  } catch (e) {
    const contentArea = root.querySelector('.detail-content');
    if (contentArea) {
      contentArea.innerHTML = `<div class="card pad">오류: ${e.message}</div>`;
    }
  }
}

function render(worldId, world) { // worldId 파라미터 추가
  const root = document.querySelector(rootSel);
  const contentArea = root.querySelector('.detail-content');
  if (!contentArea) return;

  const cover = world.coverUrl || '';
  
  const headerEl = root.querySelector('.detail-header');
  if (headerEl) headerEl.style.backgroundImage = `url('${cover}')`;

  root.querySelector('#world-detail-name').textContent = world.name;

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

  if (auth.currentUser && auth.currentUser.uid === world.ownerUid) {
    const adminPanel = root.querySelector('#world-admin-panel');
    if (adminPanel) adminPanel.style.display = 'block';
  }

  root.querySelector('#tab-intro').innerHTML = `<div class="card pad"><p>${world.introLong || world.introShort}</p></div>`;
  root.querySelector('#tab-factions').innerHTML = (world.factions || []).map(f => infoCard(f.name, f.description)).join('') || '<div class="card pad small">정보가 없습니다.</div>';
  root.querySelector('#tab-npcs').innerHTML = (world.npcs || []).map(n => infoCard(n.name, n.description)).join('') || '<div class="card pad small">정보가 없습니다.</div>';
  // [수정] episodeCard 호출 시 worldId 전달
  root.querySelector('#tab-episodes').innerHTML = (world.episodes || []).map(e => episodeCard(e, worldId)).join('') || '<div class="card pad small">정보가 없습니다.</div>';

  bindEvents(root);
}

// [수정] 템플릿 함수들
function infoCard(name, description) {
  return `
    <div class="info-card">
      <div class="name">${name || ''}</div>
      <div class="desc">${(description || '').substring(0, 100)}...</div>
    </div>
  `;
}

// [수정] episodeCard: 클릭 가능하도록 클래스 및 데이터 속성 추가
function episodeCard(episode, worldId) {
    return `
    <div class="info-card episode-card" data-world-id="${worldId}" data-episode-title="${episode.title}">
      <div class="name">${episode.title || ''}</div>
      <div class="desc episode-content">${parseRichText(episode.content).replace(/<[^>]+>/g, '').substring(0, 120)}...</div>
    </div>
  `;
}

function parseRichText(text) {
  if (!text) return '';
  return text
    .replace(/<대사>/g, '<div class="dialogue">')
    .replace(/<\/대사>/g, '</div>')
    .replace(/<서술>/g, '<div class="narrative">')
    .replace(/<\/서술>/g, '</div>');
}

// [수정] bindEvents: 탭과 카드 클릭 이벤트를 한 번에 처리
function bindEvents(container) {
  // 탭 전환 로직
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

  // 초기 탭 상태 설정
  buttons.forEach(b => b.classList.remove('active'));
  contents.forEach(c => c.style.display = 'none');
  if (buttons[0]) buttons[0].classList.add('active');
  if (contents[0]) contents[0].style.display = '';

  // 에피소드 카드 클릭 이벤트 (이벤트 위임)
  container.addEventListener('click', (e) => {
    const card = e.target.closest('.episode-card');
    if (card) {
      const worldId = card.dataset.worldId;
      const title = card.dataset.episodeTitle;
      window.location.hash = `episode/${worldId}/${encodeURIComponent(title)}`;
    }
  });
}
