// public/js/tabs/world-detail.js
import { api, auth } from '../api.js';
import { withBlocker } from '../ui/frame.js';

const rootSel = '[data-view="world-detail"]';

// [추가] 명소 카드 렌더링 헬퍼
// [통일] 명소 카드: 세계관 카드와 동일한 구조(.bg, .grad, .title)
function siteCard(s) {
  const img = s?.imageUrl || s?.img || '';
  const name = s?.name || '';
  return `
    <div class="card site-card h-card" data-site-name="${name}">
      <div class="bg" style="${img ? `background-image:url('${img}')` : ''}"></div>
      <div class="grad"></div>
      <div class="title shadow-title">${name}</div>
    </div>
  `;
}



function parseRichText(text) {
  if (!text) return '';
  return text
    .replace(/<대사>/g, '<div class="dialogue">')
    .replace(/<\/대사>/g, '</div>')
    .replace(/<서술>/g, '<div class="narrative">')
    .replace(/<\/서술>/g, '</div>')
    .replace(/<강조>/g, '<strong class="emphasis">')
    .replace(/<\/강조>/g, '</strong>');
}

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
    render(res.data);
  } catch (e) {
    const contentArea = root.querySelector('.detail-content');
    if (contentArea) {
      contentArea.innerHTML = `<div class="card pad" style="margin: 16px;">오류: ${e.message}</div>`;
    }
  }
}

function render(world) {
  const root = document.querySelector(rootSel);
  const contentArea = root.querySelector('.detail-content');
  if (!contentArea) return;

  const cover = world.coverUrl || '';
  const isOwner = auth.currentUser && auth.currentUser.uid === world.ownerUid;
  
  const headerEl = root.querySelector('.detail-header');
  if (headerEl) headerEl.style.backgroundImage = `url('${cover}')`;

  root.querySelector('#world-detail-name').textContent = world.name;

  contentArea.innerHTML = `
    <div id="world-admin-panel" style="display: ${isOwner ? 'block' : 'none'}; padding: 0 16px 16px;">
      <div class="card pad">
        <div class="small" style="margin-bottom:6px">커버 이미지 변경</div>
        <input type="file" id="cover-image-upload" accept="image/*" style="width:100%">
        <button id="btn-cover-save" class="btn full" style="margin-top:10px;">저장</button>
      </div>
    </div>
    <div class="detail-tabs-nav">
      <button class="tab-btn active" data-tab="intro">소개</button>
      <button class="tab-btn" data-tab="sites">명소</button>
      <button class="tab-btn" data-tab="factions">세력</button>
      <button class="tab-btn" data-tab="npcs">주요 인물</button>
      <button class="tab-btn" data-tab="episodes">에피소드</button>
    </div>
    <div class="tab-content-wrapper">
      <div class="tab-content" id="tab-intro"></div>
      <div class="tab-content" id="tab-sites" style="display: none;"></div>
      <div class="tab-content" id="tab-factions" style="display: none;"></div>
      <div class="tab-content" id="tab-npcs" style="display: none;"></div>
      <div class="tab-content" id="tab-episodes" style="display: none;"></div>
    </div>
  `;
  
  root.querySelector('#tab-intro').innerHTML = `<div class="card pad"><p style="white-space: pre-wrap;">${world.introLong || world.introShort}</p></div>`;
  root.querySelector('#tab-sites').innerHTML =
  '<div class="grid3">' +
  ((world.sites || []).map(siteCard).join('') || '<div class="card pad small">정보가 없습니다.</div>') +
  '</div>';

  root.querySelector('#tab-factions').innerHTML = (world.factions || []).map(f => infoCard(f.name, f.description)).join('') || '<div class="card pad small">정보가 없습니다.</div>';
  root.querySelector('#tab-npcs').innerHTML = (world.npcs || []).map(n => infoCard(n.name, n.description)).join('') || '<div class="card pad small">정보가 없습니다.</div>';
  root.querySelector('#tab-episodes').innerHTML = (world.episodes || []).map(e => episodeCard(e, world.id)).join('') || '<div class="card pad small">정보가 없습니다.</div>';

  bindEvents(root, world.id);
}

function infoCard(name, description) {
  return `
    <div class="info-card">
      <div class="name">${name || ''}</div>
      <div class="desc">${(description || '')}</div>
    </div>
  `;
}
function episodeCard(episode, worldId) {
    const summary = (episode.content || '').replace(/<[^>]+>/g, ' ').substring(0, 120);
    return `
    <div class="info-card episode-card" data-world-id="${worldId}" data-episode-title="${episode.title}">
      <div class="name">${episode.title || ''}</div>
      <div class="desc">${summary}${summary.length >= 120 ? '...' : ''}</div>
    </div>
  `;
}

function bindEvents(container, worldId) {
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

  container.addEventListener('click', (e) => {
    const card = e.target.closest('.episode-card');
    if (card) {
      const worldId = card.dataset.worldId;
      const title = card.dataset.episodeTitle;
      window.location.hash = `episode/${worldId}/${encodeURIComponent(title)}`;
    }
  });
  
  const btnSave = container.querySelector('#btn-cover-save');
  if (btnSave) {
    btnSave.onclick = async () => {
      const fileInput = container.querySelector('#cover-image-upload');
      const file = fileInput.files[0];
      if (!file) return alert('이미지를 선택해주세요.');

      alert('커버 이미지 업로드 기능은 현재 개발 중입니다. Storage 연동이 필요합니다.');
      console.log("선택된 파일:", file.name, "월드 ID:", worldId);
    };
  }

  container.addEventListener('change', async (e) => {
    if (e.target.matches('.site-image-upload')) {
      const file = e.target.files[0];
      const siteName = e.target.dataset.siteName;
      if (!file || !siteName) return;
      
      alert(`명소(${siteName}) 이미지 업로드 기능은 개발중입니다.`);
      console.log('선택파일:', file.name, '월드ID:', worldId, '명소이름:', siteName);
      // TODO: Storage 업로드 후 imageUrl 받아와서 api.updateSiteImage 호출
    }
  }); 
}
