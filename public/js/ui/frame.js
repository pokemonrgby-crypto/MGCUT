// public/js/ui/frame.js
import { auth } from '../api.js';
import * as Home from '../tabs/home.js';
import * as Create from '../tabs/create.js';
import * as Info from '../tabs/info.js';
import * as Adventure from '../tabs/adventure.js';
// 신규 뷰 모듈 임포트
import * as CreateWorld from '../tabs/create-world.js';
import * as CreateCharacter from '../tabs/create-character.js';
import * as CreatePrompt from '../tabs/create-prompt.js';

export const ui = {
  // ... (blocker, busy 코드는 동일) ...
  blocker: null,
  busy(v=true){ 
    this.blocker ??= document.getElementById('ui-blocker');
    if (!this.blocker) return;
    this.blocker.classList.toggle('show', !!v);
  },
  navTo(name, isSubView = false){
    document.querySelectorAll('[data-view]').forEach(v=>v.style.display='none');
    const el = document.querySelector(`[data-view="${name}"]`);
    if (el) el.style.display='';
    
    // 하위 뷰로 이동할 때는 하단 탭 활성화를 변경하지 않음
    if (isSubView) return;

    document.querySelectorAll('#bottom-bar .nav5 button').forEach(b=>{
      b.classList.toggle('active', b.dataset.tab===name);
    });
  }
};
window.ui = ui;

// ... (updateAuthUI 코드는 동일) ...
function updateAuthUI(user){
  const authScreen = document.getElementById('auth-screen');
  const appFrame   = document.getElementById('app-frame');
  const bottomBar  = document.getElementById('bottom-bar');

  if (!user){
    authScreen.style.display = '';
    appFrame.style.display   = 'none';
    bottomBar.style.display  = 'none';
    return;
  }
  authScreen.style.display = 'none';
  appFrame.style.display   = '';
  bottomBar.style.display  = '';
  ui.navTo('home');
  Home.mount();
}

auth.onAuthStateChanged?.((user)=>{
  updateAuthUI(user||null);
});


function bindBottomBar(){
  document.querySelectorAll('#bottom-bar .nav5 button').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const t = btn.dataset.tab;
      ui.navTo(t);
      if (t==='home')      Home.mount();
      if (t==='create')    Create.mount();
      if (t==='info')      Info.mount();
      if (t==='adventure') Adventure.mount();
    });
  });
}
bindBottomBar();

// 신규 뷰 초기화 로직
CreateWorld.mount();
CreateCharacter.mount();
CreatePrompt.mount();

export async function withBlocker(task){
  // ... (withBlocker 코드는 동일) ...
  ui.busy(true);
  try { 
    return await task();
  } catch(e) {
    console.error(e);
    throw e;
  } finally {
    ui.busy(false);
  }
}
