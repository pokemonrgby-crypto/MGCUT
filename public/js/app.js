import { api } from './api.js';

const $ = (s) => document.querySelector(s);

function bindAuthUI() {
  const { auth, GoogleAuthProvider, signInWithPopup, signOut } = window.__FBAPP__;

  $('#btn-login-google')?.addEventListener('click', async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      console.error("로그인 실패:", error);
      alert("로그인에 실패했습니다. 다시 시도해주세요.");
    }
  });

  $('#btn-logout')?.addEventListener('click', async () => {
    await signOut(auth);
  });
}

async function renderWorlds() {
  const root = $('#world-list');
  root.innerHTML = '<div class="spinner"></div>';
  try {
    const { data } = await api.listWorlds();
    if (!data || data.length === 0) {
      root.innerHTML = '<p class="empty-message">아직 생성된 세계가 없습니다. 첫 세계를 창조해보세요!</p>';
      return;
    }
    root.innerHTML = data.map(w => `
      <div class="world-card" style="--delay:${Math.random().toFixed(2)}s">
        <h3>${w.name}</h3>
        <p>${w.intro ?? '소개가 없습니다.'}</p>
        <div class="meta">
          <button data-like="${w.id}">❤ ${w.likesCount ?? 0}</button>
          <span class="world-id">#${String(w.id).slice(0, 6)}</span>
        </div>
      </div>
    `).join('');
    
    root.onclick = async (e) => {
      const likeBtn = e.target.closest('[data-like]');
      if (!likeBtn) return;
      
      likeBtn.disabled = true;
      const id = likeBtn.dataset.like;
      try {
        await api.likeWorld(id);
        await renderWorlds(); 
      } catch (err) {
        alert(err.message);
      } finally {
        likeBtn.disabled = false;
      }
    };
  } catch (err) {
    root.innerHTML = `<p class="error-message">목록 로딩 실패: ${err.message}</p>`;
  }
}

function updateUserUI(user) {
  if (user) {
    $('#whoami').textContent = user.displayName || user.email;
    $('#user-photo').src = user.photoURL || 'https://www.gravatar.com/avatar/?d=mp';
  }
}

function bindCreate() {
  $('#btn-create-world')?.addEventListener('click', async (e) => {
    const btn = e.target;
    const nameInput = $('#world-name');
    const introInput = $('#world-intro');
    
    const name = nameInput.value.trim();
    const intro = introInput.value.trim();

    if (!name) {
      alert('세계 이름을 입력해주세요.');
      return;
    }

    btn.disabled = true;
    btn.textContent = '생성 중...';
    try {
      await api.createWorld({ name, intro });
      nameInput.value = '';
      introInput.value = '';
      await renderWorlds();
    } catch (err) {
      alert(`생성 실패: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = '오늘의 세계 생성';
    }
  });
}


window.addEventListener('auth-changed', async ({ detail }) => {
  updateUserUI(detail.user);
  await renderWorlds();
});

bindAuthUI();
bindCreate();
