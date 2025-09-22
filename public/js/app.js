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


// 탭 전환
const tabs = document.querySelectorAll('#tabs button');
const sections = {
  worlds: document.getElementById('tab-worlds'),
  characters: document.getElementById('tab-characters'),
  prompts: document.getElementById('tab-prompts'),
};
tabs.forEach(b => b.addEventListener('click', () => {
  Object.values(sections).forEach(s => s.style.display = 'none');
  const t = b.dataset.tab;
  sections[t].style.display = '';
}));

// 기본 탭
if (sections.worlds) sections.worlds.style.display = '';

// 세계 생성
document.getElementById('btn-create-world')?.addEventListener('click', async () => {
  try {
    const r = await api.createWorld();
    alert(r.ok ? `세계 생성됨: ${r.data.id}` : `실패: ${r.error}`);
  } catch (e) {
    alert(`실패: ${e.message || e}`);
  }
});

// 캐릭터 생성
document.getElementById('btn-create-character')?.addEventListener('click', async () => {
  const worldId = document.getElementById('char-worldId').value.trim();
  const promptId = document.getElementById('char-promptId').value.trim() || null;
  const customPrompt = document.getElementById('char-customPrompt').value.trim() || null;
  const userInput = document.getElementById('char-userInput').value.trim();
  try {
    const r = await api.createCharacter({ worldId, promptId, customPrompt, userInput });
    alert(r.ok ? `캐릭터 생성됨: ${r.data.id}` : `실패: ${r.error}`);
  } catch (e) {
    alert(`실패: ${e.message || e}`);
  }
});

// 프롬프트 업로드
document.getElementById('btn-upload-prompt')?.addEventListener('click', async () => {
  const title = document.getElementById('pr-title').value.trim();
  const content = document.getElementById('pr-content').value.trim();
  if (!title || !content) return alert('제목/내용을 입력해줘');
  try {
    const r = await api.uploadPrompt({ title, content });
    alert(r.ok ? `업로드됨: ${r.data.id}` : `실패: ${r.error}`);
  } catch (e) {
    alert(`실패: ${e.message || e}`);
  }
});

// 프롬프트 목록/신고/검증 표시
document.getElementById('btn-load-prompts')?.addEventListener('click', async () => {
  const host = document.getElementById('prompts-list');
  host.innerHTML = '불러오는 중...';
  try {
    const r = await api.listPrompts();
    if (!r.ok) return host.innerHTML = `실패: ${r.error}`;
    host.innerHTML = '';
    r.data.forEach(p => {
      const div = document.createElement('div');
      div.className = 'prompt-card';
      div.style.cssText = 'border:1px solid #555;padding:8px;margin:8px 0;';
      div.innerHTML = `
        <div><b>${(p.title||'무제')}</b> <small>by ${p.ownerUid||'?'}</small></div>
        <pre style="white-space:pre-wrap">${(p.content||'')}</pre>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button data-act="validate">검증</button>
          <button data-act="report">신고</button>
        </div>
      `;
      div.querySelector('[data-act="validate"]').onclick = async () => {
        try {
          const rr = await api.validatePrompt(p.id);
          alert(rr.ok ? '검증 성공(스키마 통과)' : `실패: ${rr.error}`);
        } catch (e) { alert(`실패: ${e.message||e}`); }
      };
      div.querySelector('[data-act="report"]').onclick = async () => {
        const reason = prompt('신고 사유 입력 (3자 이상)');
        if (!reason) return;
        try {
          const rr = await api.reportPrompt(p.id, reason);
          alert(rr.ok ? '신고 접수' : `실패: ${rr.error}`);
        } catch (e) { alert(`실패: ${e.message||e}`); }
      };
      host.appendChild(div);
    });
  } catch (e) {
    host.innerHTML = `실패: ${e.message || e}`;
  }
});


bindAuthUI();
bindCreate();
