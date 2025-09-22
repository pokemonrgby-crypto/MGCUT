// /public/js/tabs/info.js
import { auth } from '../api.js';

export function mount(){
  const uid = auth.currentUser?.uid || '(로그인 필요)';
  document.querySelector('[data-view="info"] .kv-uid .v').textContent = uid;

  const key = localStorage.getItem('GEMINI_KEY') || '';
  const inp = document.getElementById('gemini-key');
  inp.value = key;

  document.getElementById('btn-save-key').onclick = ()=>{
    localStorage.setItem('GEMINI_KEY', inp.value.trim());
    alert('저장됨');
  };
  document.getElementById('btn-logout').onclick = ()=>auth.signOut?.();
}
