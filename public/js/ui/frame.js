// public/js/ui/frame.js
import { auth } from '../api.js';
import * as Home from '../tabs/home.js';
import * as Create from '../tabs/create.js';
import * as Info from '../tabs/info.js';
import * as Adventure from '../tabs/adventure.js';
import * as AdventureDetail from '../tabs/adventure-detail.js';
import * as Inventory from '../tabs/inventory.js';
import * as Ranking from '../tabs/ranking.js';
import * as CreateWorld from '../tabs/create-world.js';
import * as CreateCharacter from '../tabs/create-character.js';
import * as CreatePrompt from '../tabs/create-prompt.js';
import * as CreateSite from '../tabs/create-site.js';
import * as WorldDetail from '../tabs/world-detail.js';
import * as EpisodeDetail from '../tabs/episode-detail.js';
import * as CharacterDetail from '../tabs/character-detail.js';
import * as Matching from '../tabs/matching.js';
import * as Battle from '../tabs/battle.js';


export const ui = {
  blocker: null,
  busy(v = true) {
    this.blocker ??= document.getElementById('ui-blocker');
    if (!this.blocker) return;
    this.blocker.classList.toggle('show', !!v);
  },
  showView(name) {
    document.querySelectorAll('[data-view]').forEach(v => v.style.display = 'none');
    const el = document.querySelector(`[data-view="${name}"]`);
    if (el) el.style.display = '';
  },
  navTo(path) {
    window.location.hash = `#${path}`;
  }
};
window.ui = ui;

function handleRouteChange() {
  const hash = window.location.hash || '#home';
  const [path, param1, param2] = hash.slice(1).split('?')[0].split('/');

  const routes = {
    'home': { view: 'home', mount: Home.mount },
    'create': { view: 'create', mount: Create.mount },
    'adventure': { view: 'adventure', mount: Adventure.mount },
    'adventure-detail': { parentView: 'adventure', view: 'adventure-detail', mount: () => AdventureDetail.mount(param1) },
    'inventory': { parentView: 'adventure', view: 'inventory', mount: Inventory.mount }, // [수정]
    'ranking': { view: 'ranking', mount: Ranking.mount },
    'info': { view: 'info', mount: Info.mount },
    'create-world': { parentView: 'create', view: 'create-world' },
    'create-character': { parentView: 'create', view: 'create-character' },
    'create-prompt': { parentView: 'create', view: 'create-prompt' },
    'create-site': { parentView: 'create', view: 'create-site' },
    'world': { parentView: 'home', view: 'world-detail', mount: () => WorldDetail.mount(param1) },
    'character': { parentView: 'home', view: 'character-detail', mount: () => CharacterDetail.mount(param1) },
    'episode': { parentView: 'home', view: 'episode-detail', mount: () => EpisodeDetail.mount(param1, decodeURIComponent(param2 || '')) },
    'matching': { parentView: 'home', view: 'matching', mount: Matching.mount },
    'battle': { parentView: 'home', view: 'battle', mount: Battle.mount },
  };

  const route = routes[path];
  if (route) {
    ui.showView(route.view);
    if (route.mount) route.mount();

    const activeTab = route.parentView || path;
    document.querySelectorAll('#bottom-bar button').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === activeTab);
    });
  } else {
    ui.showView('home');
    Home.mount?.();
    document.querySelectorAll('#bottom-bar button').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === 'home');
    });
  }
}

// (기존 나머지 코드와 동일)
window.addEventListener('hashchange', handleRouteChange);
window.addEventListener('DOMContentLoaded', () => {
  CreateWorld.mount();
  CreateCharacter.mount();
  CreatePrompt.mount();
  CreateSite.mount();
  Inventory.mount(); // [추가]

  const fbAuth = auth || window.__FBAPP__?.auth;
  fbAuth?.onAuthStateChanged?.((user) => {
    updateAuthUI(user);
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
  document.querySelectorAll('#bottom-bar button').forEach(btn => {
    btn.onclick = () => { window.location.hash = btn.dataset.tab; };
  });
}

function formatRemainingTime(seconds) {
    if (seconds < 60) return `${seconds}초`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s === 0 ? `${m}분` : `${m}분 ${s}초`;
}

export function handleCooldown(error, button) {
    if (String(error.message || error).startsWith('COOLDOWN_ACTIVE')) {
        const remainingMatch = String(error.message || error).match(/(\d+)/);
        const remaining = remainingMatch ? parseInt(remainingMatch[1], 10) : 0;

        if (button && remaining > 0) {
            button.disabled = true;
            const originalText = button.textContent;
            let secondsLeft = remaining;

            const intervalId = setInterval(() => {
                if (secondsLeft <= 0) {
                    clearInterval(intervalId);
                    button.textContent = originalText;
                    button.disabled = false;
                } else {
                    button.textContent = `${formatRemainingTime(secondsLeft)} 남음`;
                    secondsLeft--;
                }
            }, 1000);
        }
    }
}


// (기존 내용과 동일)
export async function withBlocker(task, button = null) {
  ui.busy(true);
  try {
    return await task();
  } catch (e) {
    console.error(e);
    // [수정 제안] 사용자에게 에러 알림 추가
    alert(`오류가 발생했습니다: ${e.message}`); 
    if (button) {
        handleCooldown(e, button);
    }
    throw e;
  } finally {
    ui.busy(false);
  }
}
