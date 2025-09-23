// public/js/ui/frame.js
import { auth } from '../api.js';
import * as Home from '../tabs/home.js';
import * as Create from '../tabs/create.js';
import * as Info from '../tabs/info.js';
import * as Adventure from '../tabs/adventure.js';
import * as CreateWorld from '../tabs/create-world.js';
import * as CreateCharacter from '../tabs/create-character.js';
import * as CreatePrompt from '../tabs/create-prompt.js';
import * as CreateSite from '../tabs/create-site.js';
import * as WorldDetail from '../tabs/world-detail.js';
import * as EpisodeDetail from '../tabs/episode-detail.js';
import * as CharacterDetail from '../tabs/character-detail.js';

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
  // [추가] 네비게이션 함수
  navTo(path) {
    window.location.hash = `#${path}`;
  }
};
window.ui = ui;

function handleRouteChange() {
  const hash = window.location.hash || '#home';
  const [path, param1, param2] = hash.slice(1).split('/');

  const routes = {
    'home': { view: 'home', mount: Home.mount },
    'create': { view: 'create', mount: Create.mount },
    'adventure': { view: 'adventure', mount: Adventure.mount },
    'info': { view: 'info', mount: Info.mount },
    'create-world': { parentView: 'create', view: 'create-world' },
    'create-character': { parentView: 'create', view: 'create-character' },
    'create-prompt': { parentView: 'create', view: 'create-prompt' },
    'create-site': { parentView: 'create', view: 'create-site' },
    'world': { parentView: 'home', view: 'world-detail', mount: () => WorldDetail.mount(param1) },
    'episode': { parentView: 'home', view: 'episode-detail', mount: () => EpisodeDetail.mount(param1, decodeURIComponent(param2)) }
  };

  const route = routes[path];
  if (route) {
    ui.showView(route.view);
    if (route.mount) route.mount();

    const activeTab = route.parentView || path;
    document.querySelectorAll('#bottom-bar button').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === activeTab);
    });
  }
}

window.addEventListener('hashchange', handleRouteChange);
window.addEventListener('DOMContentLoaded', () => {
  CreateWorld.mount();
  CreateCharacter.mount();
  CreatePrompt.mount();
  CreateSite.mount();

  auth.onAuthStateChanged?.((user) => {
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

export async function withBlocker(task) {
  ui.busy(true);
  try {
    return await task();
  } catch (e) {
    console.error(e);
    throw e;
  } finally {
    ui.busy(false);
  }
}
