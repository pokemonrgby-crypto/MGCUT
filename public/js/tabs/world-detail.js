// public/js/tabs/world-detail.js
import { api, auth, storage } from '../api.js';
import { withBlocker } from '../ui/frame.js';

const rootSel = '[data-view="world-detail"]';

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

function characterListCard(c) {
  const bg = c.imageUrl || '';
  return `
    <div class="card character-card" data-nav-to="#character/${c.id}" style="cursor:pointer">
      <div class="bg" style="background-image:url('${bg}')"></div>
      <div class="grad"></div>
      <div class="title shadow-title">${c.name}</div>
      <div class="char-info">Elo: ${c.elo ?? 1000}</div>
    </div>
  `;
}

export async function mount(worldId) {
  const root = document.querySelector(rootSel);
  if (!root || !worldId) return;

  root.innerHTML = `<div class="detail-header"><div class="grad"></div><h2 class="shadow-title" id="world-detail-name"></h2></div><div class="detail-content"><div class="spinner"></div></div>`;
  
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

async function render(world) {
  const root = document.querySelector(rootSel);
  const contentArea = root.querySelector('.detail-content');
  if (!contentArea) return;

  const cover = world.coverUrl || '';
  const isOwner = (auth.currentUser && auth.currentUser.uid === world.ownerUid);
  
  const headerEl = root.querySelector('.detail-header');
  if (headerEl) headerEl.style.backgroundImage = `url('${cover}')`;

  root.querySelector('#world-detail-name').textContent = world.name;

  contentArea.innerHTML = `
    <div class="detail-tabs-nav">
      <button class="tab-btn active" data-tab="intro">소개</button>
      <button class="tab-btn" data-tab="characters">캐릭터</button>
      <button class="tab-btn" data-tab="sites">명소</button>
      <button class="tab-btn" data-tab="factions">세력</button>
      <button class="tab-btn" data-tab="npcs">주요 인물</button>
      <button class="tab-btn" data-tab="episodes">에피소드</button>
      ${isOwner ? '<button class="tab-btn" data-tab="admin">관리</button>' : ''}
    </div>
    <div class="tab-content-wrapper">
      <div class="tab-content" id="tab-intro"></div>
      <div class="tab-content" id="tab-characters" style="display: none;"></div>
      <div class="tab-content" id="tab-sites" style="display: none;"></div>
      <div class="tab-content" id="tab-factions" style="display: none;"></div>
      <div class="tab-content" id="tab-npcs" style="display: none;"></div>
      <div class="tab-content" id="tab-episodes" style="display: none;"></div>
      ${isOwner ? '<div class="tab-content" id="tab-admin" style="display: none;"></div>' : ''}
    </div>
  `;
  
  root.querySelector('#tab-intro').innerHTML = `<div class="card pad" style="white-space: pre-wrap; margin: 0 16px;">${world.introLong || world.introShort}</div>`;
  root.querySelector('#tab-sites').innerHTML = '<div class="grid3" style="padding: 0 16px;">' + ((world.sites || []).map(siteCard).join('') || '<div class="card pad small">정보가 없습니다.</div>') + '</div>';
  root.querySelector('#tab-factions').innerHTML = (world.factions || []).map(f => infoCard(f.name, f.description)).join('') || '<div class="card pad small">정보가 없습니다.</div>';
  root.querySelector('#tab-npcs').innerHTML = (world.npcs || []).map(n => infoCard(n.name, n.description)).join('') || '<div class="card pad small">정보가 없습니다.</div>';
  root.querySelector('#tab-episodes').innerHTML = (world.episodes || []).map(e => episodeCard(e, world.id)).join('') || '<div class="card pad small">정보가 없습니다.</div>';
  
  if (isOwner) {
    renderAdminTab(root.querySelector('#tab-admin'), world);
  }
  
  const charactersTab = root.querySelector('#tab-characters');
  charactersTab.innerHTML = '<div class="spinner"></div>';
  try {
    const charRes = await api.getWorldCharacters(world.id);
    if (charRes.data && charRes.data.length > 0) {
      charactersTab.innerHTML = '<div class="grid3">' + charRes.data.map(characterListCard).join('') + '</div>';
    } else {
      charactersTab.innerHTML = '<div class="card pad small" style="margin:0 16px;">이 세계관에 속한 캐릭터가 없습니다.</div>';
    }
  } catch (e) {
      charactersTab.innerHTML = `<div class="card pad err" style="margin:0 16px;">캐릭터 로딩 실패: ${e.message}</div>`;
  }

  bindEvents(root, world);
}

function infoCard(name, description) {
  return `<div class="info-card" style="margin: 0 16px 12px;"><div class="name">${name || ''}</div><div class="desc">${(description || '')}</div></div>`;
}

function episodeCard(episode, worldId) {
    const summary = (episode.content || '').replace(/<[^>]+>/g, ' ').substring(0, 120);
    return `<div class="info-card episode-card" data-world-id="${worldId}" data-episode-title="${episode.title}" style="margin: 0 16px 12px; cursor:pointer;"><div class="name">${episode.title || ''}</div><div class="desc">${summary}${summary.length >= 120 ? '...' : ''}</div></div>`;
}

function bindEvents(container, world) {
  const worldId = world.id;
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
    const navTo = e.target.closest('[data-nav-to]');
    if (navTo) {
      window.location.hash = navTo.dataset.navTo;
      return;
    }
    const card = e.target.closest('.episode-card');
    if (card) {
      window.location.hash = `episode/${card.dataset.worldId}/${encodeURIComponent(card.dataset.episodeTitle)}`;
    }
  });
  
  const adminTab = container.querySelector('#tab-admin');
  if (adminTab) {
    adminTab.addEventListener('click', async (e) => {
      const target = e.target;
      if (target.matches('#btn-cover-save')) {
        const fileInput = adminTab.querySelector('#cover-image-upload');
        const file = fileInput.files[0];
        if (!file) return alert('이미지를 선택해주세요.');
        await withBlocker(async () => {
          const imageUrl = await storage.uploadImage(`worlds/${worldId}/covers`, file);
          await api.updateWorldCover(worldId, imageUrl);
          alert('커버 이미지가 변경되었습니다.');
          mount(worldId);
        });
      }
      if (target.matches('.btn-delete-element')) {
        const type = target.dataset.type;
        const name = target.dataset.name;
        if (confirm(`정말로 '${name}' ${type}을(를) 삭제하시겠습니까?`)) {
          await withBlocker(async () => {
            await api.deleteWorldElement(worldId, type, name);
            alert(`${type} '${name}'이(가) 삭제되었습니다.`);
            mount(worldId);
          });
        }
      }
      if (target.matches('.btn-add-ai')) {
        const type = target.dataset.type;
        const input = adminTab.querySelector(`#add-${type}-input`);
        const userInput = input.value.trim();
        if (!userInput) return alert('요청사항을 입력해주세요.');

        try {
            await withBlocker(async () => {
              const newElementJson = await api.addWorldElement(worldId, type, { userInput, worldContext: world });
              alert(`AI가 새로운 ${type} '${newElementJson.data.name}'을(를) 추가했습니다.`);
              input.value = '';
              mount(worldId);
            });
        } catch (err) {
            alert(`추가 실패: ${err.message}`);
        }
      }
    });

    adminTab.addEventListener('change', async (e) => {
        if (e.target.matches('.site-image-upload')) {
            const file = e.target.files[0];
            const siteName = e.target.dataset.siteName;
            if (!file || !siteName) return;

            await withBlocker(async () => {
                const imageUrl = await storage.uploadImage(`worlds/${worldId}/sites`, file);
                await api.updateSiteImage(worldId, siteName, imageUrl);
                alert(`명소(${siteName}) 이미지가 업로드되었습니다.`);
                mount(worldId);
            });
        }
    });
  }
}

function renderAdminTab(container, world) {
  if (!container) return;
  container.innerHTML = `
    <div style="padding: 0 16px;">
      <div class="card pad" style="margin-bottom:12px;">
        <div class="small" style="margin-bottom:6px"><b>표지 이미지 변경</b></div>
        <input type="file" id="cover-image-upload" accept="image/*" style="width:100%">
        <button id="btn-cover-save" class="btn full" style="margin-top:10px;">저장</button>
      </div>

      <div class="card pad" style="margin-bottom:12px;">
        <div class="small" style="margin-bottom:10px"><b>명소 관리</b></div>
        ${(world.sites || []).map(s => `<div class="kv"><div class="k">${s.name}</div><div class="v" style="display:flex; gap:8px; align-items:center;"><input type="file" class="site-image-upload" data-site-name="${s.name}" accept="image/*" style="font-size:12px; max-width:120px;"><button class="btn secondary btn-delete-element" data-type="sites" data-name="${s.name}" style="padding:4px 8px; font-size:12px;">삭제</button></div></div>`).join('') || '<div class="small">명소가 없습니다.</div>'}
        <div class="kv">
            <input type="text" id="add-sites-input" placeholder="AI에게 명소 추가 요청..." style="flex-grow:1; margin-right:8px;">
            <button class="btn btn-add-ai" data-type="sites">AI로 추가</button>
        </div>
      </div>

      <div class="card pad" style="margin-bottom:12px;">
        <div class="small" style="margin-bottom:10px"><b>NPC 관리</b></div>
        ${(world.npcs || []).map(n => `<div class="kv"><div class="k">${n.name}</div><div class="v"><button class="btn secondary btn-delete-element" data-type="npcs" data-name="${n.name}" style="padding:4px 8px; font-size:12px;">삭제</button></div></div>`).join('') || '<div class="small">NPC가 없습니다.</div>'}
        <div class="kv">
            <input type="text" id="add-npcs-input" placeholder="AI에게 NPC 추가 요청..." style="flex-grow:1; margin-right:8px;">
            <button class="btn btn-add-ai" data-type="npcs">AI로 추가</button>
        </div>
      </div>

      <div class="card pad" style="margin-bottom:12px;">
        <div class="small" style="margin-bottom:10px"><b>세력 관리</b></div>
        ${(world.factions || []).map(f => `<div class="kv"><div class="k">${f.name}</div><div class="v"><button class="btn secondary btn-delete-element" data-type="factions" data-name="${f.name}" style="padding:4px 8px; font-size:12px;">삭제</button></div></div>`).join('') || '<div class="small">세력이 없습니다.</div>'}
        <div class="kv">
            <input type="text" id="add-factions-input" placeholder="AI에게 세력 추가 요청..." style="flex-grow:1; margin-right:8px;">
            <button class="btn btn-add-ai" data-type="factions">AI로 추가</button>
        </div>
      </div>
    </div>
  `;
}
