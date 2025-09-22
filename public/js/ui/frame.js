import { auth } from '../api.js';
import * as Home from '../tabs/home.js';
import * as Create from '../tabs/create.js';
import * as Info from '../tabs/info.js';
import * as Adventure from '../tabs/adventure.js';

/** 전역 UI 컨트롤러: 로딩 차단 및 내비게이션 */
export const ui = {
  blocker: null,
  busy(v=true){ 
    this.blocker ??= document.getElementById('ui-blocker');
    if (!this.blocker) return;
    this.blocker.classList.toggle('show', !!v);
  },
  navTo(name){
    document.querySelectorAll('[data-view]').forEach(v=>v.style.display='none');
    const el = document.querySelector(`[data-view="${name}"]`);
    if (el) el.style.display='';
    document.querySelectorAll('#bottom-bar .nav5 button').forEach(b=>{
      b.classList.toggle('active', b.dataset.tab===name);
    });
  }
};
window.ui = ui; // 다른 탭 스크립트에서 ui.busy() 호출 가능

/** 로그인 게이트 */
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

  // 최초 진입은 홈
  ui.navTo('home');
  Home.mount(); // 홈 데이터 미리 불러오기
}

auth.onAuthStateChanged?.((user)=>{
  updateAuthUI(user||null);
});

/** 하단바 이벤트 바인딩 */
function bindBottomBar(){
  document.querySelectorAll('#bottom-bar .nav5 button').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const t = btn.dataset.tab;
      ui.navTo(t);
      // 탭 별 초기 렌더 함수(mount) 호출
      if (t==='home')      Home.mount();
      if (t==='create')    Create.mount();
      if (t==='info')      Info.mount();
      if (t==='adventure') Adventure.mount();
    });
  });
}
bindBottomBar();

/** 전역 로딩 차단 헬퍼 함수 */
export async function withBlocker(task){
  ui.busy(true);
  try { 
    return await task();
  } catch(e) {
    console.error(e);
    // 여기서 에러를 다시 던져서 호출한 쪽에서 잡도록 함
    throw e;
  } finally {
    ui.busy(false);
  }
}
