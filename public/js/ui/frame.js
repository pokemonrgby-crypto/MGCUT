// public/js/ui/frame.js
import { auth } from '../api.js';
import * as Home from '../tabs/home.js';
import * as Create from '../tabs/create.js';
import * as Info from '../tabs/info.js';
import * as Adventure from '../tabs/adventure.js';
import * as CreateWorld from '../tabs/create-world.js';
import * as CreateCharacter from '../tabs/create-character.js';
import * as CreatePrompt from '../tabs/create-prompt.js';
import * as WorldDetail from '../tabs/world-detail.js';
import * as EpisodeDetail from '../tabs/episode-detail.js'; // [추가]

export const ui = {
  blocker: null,
  busy(v = true) {
    this.blocker ??= document.getElementById('ui-blocker');
    if (!this.blocker) return;
    this.blocker.classList.toggle('show', !!v);
  },
  // navTo는 이제 화면을 보여주는 역할만 담당
  showView(name) {
    document.querySelectorAll('[data-view]').forEach(v => v.style.display = 'none');
    const el = document.querySelector(`[data-view="${name}"]`);
    if (el) el.style.display = '';
  },
};
window.ui = ui;

// [수정] 해시 기반 라우터 (핵심 로직)
function handleRouteChange() {
  const hash = window.location.hash || '#home';
  // [수정] 파라미터를 2개까지 받을 수 있도록 변경
  const [path, param1, param2] = hash.slice(1).split('/');

  const routes = {
    'home': { view: 'home', mount: Home.mount },
    'create': { view: 'create', mount: Create.mount },
    'adventure': { view: 'adventure', mount: Adventure.mount },
    'info': { view: 'info', mount: Info.mount },
    'create-world': { parentView: 'create', view: 'create-world' },
    'create-character': { parentView: 'create', view: 'create-character' },
    'create-prompt': { parentView: 'create', view: 'create-prompt' },
    'world': { parentView: 'home', view: 'world-detail', mount: () => WorldDetail.mount(param1) },
    // [추가] 에피소드 상세 보기 라우트
    'episode': { parentView: 'home', view: 'episode-detail', mount: () => EpisodeDetail.mount(param1, decodeURIComponent(param2)) }
  };

  const route = routes[path];
  if (route) {
    ui.showView(route.view);
    // mount 함수가 있으면 실행 (데이터 로딩 등)
    if (route.mount) route.mount();

    // 하단 탭 활성화 상태 업데이트
    const activeTab = route.parentView || path; // [수정] 자식 뷰일 때 parentView를 기준으로 탭 활성화
    document.querySelectorAll('#bottom-bar button').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === activeTab);
    });
  }
}

// 최초 로드 및 이벤트 리스너 설정
window.addEventListener('hashchange', handleRouteChange);
window.addEventListener('DOMContentLoaded', () => {
  // 각 뷰의 초기화는 여기서 한 번만 실행
  CreateWorld.mount();
  CreateCharacter.mount();
  CreatePrompt.mount();

  auth.onAuthStateChanged?.((user) => {
    updateAuthUI(user);
    // [수정] 로그인/아웃 시 항상 handleRouteChange 호출하여 현재 해시에 맞는 화면 표시
    handleRouteChange(); 
  });

  bindBottomBar();
});

function updateAuthUI(user) {
  const authScreen = document.getElementById('auth-screen');
  const appFrame = document.getElementById('app-frame');
  const bottomBar = document.getElementById('bottom-bar');

  const showApp = !!user;
  authScreen.style.display = showApp ? 'none' : '';
  appFrame.style.display = showApp ? '' : 'none';
  bottomBar.style.display = showApp ? '' : 'none';
}

function bindBottomBar() {
  // 하단 바 버튼 클릭 시 해시 변경
  document.querySelectorAll('#bottom-bar button').forEach(btn => {
    btn.onclick = () => { window.location.hash = btn.dataset.tab; };
  });
}

export async function withBlocker(task) {
  ui.busy(true);
  try {
    return await task();
  } catch (e) {
    console.error(e);
    // 오류 메시지를 사용자에게 더 친절하게 보여줄 수 있음
    // alert(e.message); 
    throw e;
  } finally {
    ui.busy(false);
  }
}
