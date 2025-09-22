import { auth } from '../api.js';

export function mount(){
  const uid = auth.currentUser?.uid || '(로그인 필요)';
  const view = document.querySelector('[data-view="info"]');
  if (!view) return;

  view.querySelector('.kv-uid .v').textContent = uid;

  const key = localStorage.getItem('GEMINI_KEY') || '';
  const inp = view.querySelector('#gemini-key');
  inp.value = key;

  view.querySelector('#btn-save-key').onclick = ()=>{
    localStorage.setItem('GEMINI_KEY', inp.value.trim());
    alert('저장되었습니다.');
  };
  view.querySelector('#btn-logout').onclick = ()=>auth.signOut?.();
}
