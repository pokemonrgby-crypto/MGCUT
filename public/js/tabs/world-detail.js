// public/js/tabs/world-detail.js
import { api, auth } from '../api.js';

const rootSel = '[data-view="world-detail"]';

export async function mount(worldId) {
  const root = document.querySelector(rootSel);
  if (!root || !worldId) return;

  // [수정] 로딩 UI를 detail-content 내부에만 표시하도록 변경
  const contentArea = root.querySelector('.detail-content');
  contentArea.innerHTML = `<div class="spinner"></div>`;

  try {
    const res = await api.getWorld(worldId);
    render(res.data);
  } catch (e) {
    // [수정] 오류 발생 시에도 contentArea를 직접 수정하여 오류 방지
    contentArea.innerHTML = `<div class="card pad">오류: ${e.message}</div>`;
  }
}

function render(world) {
  const root = document.querySelector(rootSel);
  const cover = world.coverUrl || '';
  
  // 헤더 업데이트
  root.querySelector('.detail-header').style.backgroundImage = `url('${cover}')`;
  root.querySelector('#world-detail-name').textContent = world.name;

  // 소유자 관리 패널 표시
  const adminPanel = root.querySelector('#world-admin-panel');
  if (auth.currentUser && auth.currentUser.uid === world.ownerUid) {
    adminPanel.style.display = 'block';
  } else {
    adminPanel.style.display = 'none';
  }

  // 각 탭 콘텐츠 렌더링
  root.querySelector('#tab-intro').innerHTML = `<div class="card pad"><p>${world.introLong || world.introShort}</p></div>`;
  root.querySelector('#tab-factions').innerHTML = (world.factions || []).map(f => infoCard(f.name, f.description)).join('');
  root.querySelector('#tab-npcs').innerHTML = (world.npcs || []).map(n => infoCard(n.name, n.description)).join('');
  root.querySelector('#tab-episodes').innerHTML = (world.episodes || []).map(e => episodeCard(e.title, e.content)).join('');

  // 탭 전환 이벤트 바인딩
  bindTabEvents();
}

// 세력, NPC 등 정보 카드 템플릿
function infoCard(name, description) {
  return `
    <div class="info-card">
      <div class="name">${name}</div>
      <div class="desc">${description}</div>
    </div>
  `;
}

// 에피소드 카드 템플릿 (리치 텍스트 파싱 포함)
function episodeCard(title, content) {
  return `
    <div class="info-card">
      <div class="name">${title}</div>
      <div class="desc episode-content">${parseRichText(content)}</div>
    </div>
  `;
}

// <대사>, <서술> 태그를 HTML로 변환하는 함수
function parseRichText(text) {
  if (!text) return '';
  return text
    .replace(/<대사>/g, '<div class="dialogue">')
    .replace(/<\/대사>/g, '</div>')
    .replace(/<서술>/g, '<div class="narrative">')
    .replace(/<\/서술>/g, '</div>');
}

// 탭 버튼 클릭 이벤트 처리
function bindTabEvents() {
  const nav = document.querySelector('.detail-tabs-nav');
  const contents = document.querySelectorAll('.tab-content');
  const buttons = nav.querySelectorAll('.tab-btn');

  nav.onclick = (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;

    const tabId = `tab-${btn.dataset.tab}`;
    
    buttons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    contents.forEach(c => {
      c.style.display = c.id === tabId ? '' : 'none';
    });
  };

  // 초기 상태: 첫 번째 탭 활성화
  buttons.forEach(b => b.classList.remove('active'));
  contents.forEach(c => c.style.display = 'none');
  
  if (buttons[0]) buttons[0].classList.add('active');
  if (contents[0]) contents[0].style.display = '';
}
