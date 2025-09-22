// public/js/tabs/world-detail.js (신규 파일)
import { api, auth } from '../api.js';
import { withBlocker } from '../ui/frame.js';

const rootSel = '[data-view="world-detail"]';

export async function mount(worldId) {
  const root = document.querySelector(rootSel);
  if (!root || !worldId) return;

  root.innerHTML = `<div class="spinner-wrap"><div class="spinner"></div></div>`; // 로딩 표시

  try {
    const res = await api.getWorld(worldId);
    render(res.data);
  } catch (e) {
    root.innerHTML = `<div class="card pad">오류: ${e.message}</div>`;
  }
}

function render(world) {
  const root = document.querySelector(rootSel);
  const cover = world.coverUrl || '';
  root.innerHTML = `
    <div class="detail-header" style="background-image:url('${cover}')">
      <div class="grad"></div>
      <h2 class="shadow-title">${world.name}</h2>
    </div>
    <div class="detail-content">
      <div id="world-admin-panel" style="display:none; margin-bottom:16px;">
        <div class="small">소유자 전용 관리 메뉴</div>
        <button class="btn secondary full">이미지 변경 / 내용 수정</button>
      </div>
      <div class="card pad">
        <div class="small" style="font-weight:700; margin-bottom:8px;">소개</div>
        <p>${world.introLong || world.introShort}</p>
      </div>
      </div>
  `;

  // 소유자 확인 후 관리 패널 표시
  if (auth.currentUser && auth.currentUser.uid === world.ownerUid) {
    const adminPanel = root.querySelector('#world-admin-panel');
    if(adminPanel) adminPanel.style.display = 'block';
  }
}
