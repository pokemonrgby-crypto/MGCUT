import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js';
import { api } from './api.js';

const $ = (s)=> document.querySelector(s);

function bindAuthUI(){
  const auth = getAuth();
  $('#btn-signup')?.addEventListener('click', async ()=> {
    const email = $('#email').value.trim();
    const pw = $('#pw').value;
    await createUserWithEmailAndPassword(auth, email, pw);
    await render();
  });
  $('#btn-login')?.addEventListener('click', async ()=> {
    const email = $('#email').value.trim();
    const pw = $('#pw').value;
    await signInWithEmailAndPassword(auth, email, pw);
    await render();
  });
  $('#btn-logout')?.addEventListener('click', async ()=> {
    await signOut(auth);
    await render();
  });
}

async function renderWorlds(){
  const root = $('#world-list');
  root.innerHTML = '로딩 중…';
  try{
    const { data } = await api.listWorlds();
    root.innerHTML = data.map(w => `
      <div class="world-card">
        <h3>${w.name}</h3>
        <p>${w.intro ?? ''}</p>
        <div class="meta">
          <button data-like="${w.id}">❤ ${w.likesCount ?? 0}</button>
          <span>${String(w.id).slice(0,6)}…</span>
        </div>
      </div>
    `).join('');
    root.onclick = async (e)=>{
      const id = e.target?.dataset?.like;
      if(!id) return;
      try{
        await api.likeWorld(id);
        await renderWorlds();
      }catch(err){ alert(err.message); }
    };
  }catch(err){
    root.innerHTML = '목록 로딩 실패: ' + err.message;
  }
}

async function render(){
  const auth = getAuth();
  const u = auth.currentUser;
  $('#whoami').textContent = u ? (u.email || u.uid) : '';
  await renderWorlds();
}

function bindCreate(){
  $('#btn-create-world')?.addEventListener('click', async ()=> {
    const name = prompt('세계 이름?') || '새 세계';
    const intro = prompt('소개글?') || '소개글';
    try{
      await api.createWorld({ name, intro });
      await render();
    }catch(err){ alert('생성 실패: ' + err.message); }
  });
}

bindAuthUI();
bindCreate();
render();
