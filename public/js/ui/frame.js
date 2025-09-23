// public/js/ui/frame.js
import { auth } from '../api.js';
import * as Home from '../tabs/home.js';
import * as Create from '../tabs/create.js';
import * as Info from '../tabs/info.js';
import * as Adventure from '../tabs/adventure.js';
import * as CreateWorld from '../tabs/create-world.js';
import * as CreateCharacter from '../tabs/create-character.js';
import * as CreatePrompt from '../tabs/create-prompt.js';
import * as CreateSite from '../tabs/create-site.js'; // [추가]
import * as WorldDetail from '../tabs/world-detail.js';
import * as EpisodeDetail from '../tabs/episode-detail.js';

export const ui = {
  // ... (기존 ui 객체 내용과 동일)
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
    'create-site': { parentView: 'create', view: 'create-site' }, // [추가]
    'world': { parentView: 'home', view: 'world-detail', mount: () => WorldDetail.mount(param1) },
    'episode': { parentView: 'home', view: 'episode-detail', mount: () => EpisodeDetail.mount(param1, decodeURIComponent(param2)) }
  };

  const route = routes[path];
  if (route) {
    // ... (기존 라우팅 로직과 동일)
  }
}

window.addEventListener('hashchange', handleRouteChange);
window.addEventListener('DOMContentLoaded', () => {
  CreateWorld.mount();
  CreateCharacter.mount();
  CreatePrompt.mount();
  CreateSite.mount(); // [추가]

  auth.onAuthStateChanged?.((user) => {
    // ... (기존 인증 로직과 동일)
  });

  bindBottomBar();
});

// ... (나머지 함수들은 기존과 동일)
