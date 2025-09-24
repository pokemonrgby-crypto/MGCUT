// public/js/tabs/battle.js
import { api } from '../api.js';
import { sessionKeyManager } from '../session-key-manager.js';
import { withBlocker, ui } from '../ui/frame.js';

const ROOT = '[data-view="battle"]';

const esc = s => String(s??'').replace(/[&<>"]/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));

function md(s){
  let t = esc(s);
  t = t.replace(/^### (.+)$/gm,'<h3>$1</h3>');
  t = t.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');
  t = t.replace(/\*(.+?)\*/g,'<i>$1</i>');
  t = t.replace(/`(.+?)`/g,'<code>$1</code>');
  t = t.replace(/^> (.+)$/gm,'<blockquote>$1</blockquote>');
  t = t.replace(/^- (.+)$/gm,'<li>$1</li>');
  t = t.replace(/\n{2,}/g,'</p><p>');
  t = `<p>${t}</p>`;
  t = t.replace(/<p><li>/g,'<ul><li>').replace(/<\/li><\/p>/g,'</li></ul>');
  return t;
}

async function render(battleId, meName, opName){
  const root = document.querySelector(ROOT);
  if (!root) return;
  
  // 1. 먼저 "시뮬레이션 중"이라는 내용의 기본 UI를 렌더링합니다.
  root.innerHTML = `
    <div class="section-h">배틀</div>
    <div class="card pad" style="margin:0 16px 12px">
      <div class="small">ID: ${battleId}</div>
    </div>
    <div class="card pad sim-loading" style="margin:0 16px 12px">
      <div class="dots">AI 시뮬레이션 중<span>.</span><span>.</span><span>.</span></div>
      <div class="small" style="opacity:.8">서버에서 Gemini API로 AI를 호출합니다.</div>
    </div>
    <div class="card pad md-body" style="margin:0 16px 16px; display:none"></div>
    <div style="display:flex; gap:8px; margin:0 16px 16px">
      <button id="btn-rematch" class="btn secondary">다른 상대 찾기</button>
      <button id="btn-resim" class="btn">다시 시뮬레이션</button>
    </div>
  `;

  // 버튼 이벤트를 미리 바인딩합니다.
  root.querySelector('#btn-rematch').onclick = () => {
    history.back();
  };
  root.querySelector('#btn-resim').onclick = () => {
    // 재시도 시에는 withBlocker를 사용하지 않고 render를 직접 호출합니다.
    render(battleId, meName, opName);
  };

  try {
    // 2. 비밀번호를 먼저 요청합니다. (이때 비밀번호 입력 모달이 나타납니다)
    const password = await sessionKeyManager.getPassword();

    // 3. 비밀번호를 성공적으로 받아온 후에, withBlocker로 로딩 화면을 띄우고 API를 호출합니다.
    await withBlocker(async () => {
        const res = await api.battleSimulate(battleId, password);
        const { markdown, winner } = res.data;

        if (!markdown) {
            throw new Error("AI가 유효한 전투 로그를 생성하지 못했습니다.");
        }

        const out = root.querySelector('.md-body');
        if (out) {
          out.innerHTML = md(markdown);
          out.style.display = '';
        }

        root.querySelector('.sim-loading')?.remove();

        const winnerName = winner === 'A' ? meName : opName;

        if (winner) {
          const b = document.createElement('div');
          b.className = 'winner-badge';
          b.textContent = `결과: ${winnerName} 승리`;
          out.prepend(b);
        } else {
          const b = document.createElement('div');
          b.className = 'winner-badge err';
          b.textContent = '결과: 승자 판독 불가';
          out.prepend(b);
        }
    });

  } catch(e) {
    // 사용자가 비밀번호 입력을 취소했거나 API 호출에 실패한 경우
    if (!e.message.includes('사용자가')) {
        const loadingEl = root.querySelector('.sim-loading');
        if (loadingEl) {
            loadingEl.classList.add('err');
            const errorDetail = loadingEl.querySelector('.small');
            if (errorDetail) {
                let displayError = e.message;
                if(e.message.includes('DECRYPTION_FAILED')) displayError = '비밀번호가 올바르지 않습니다. 다시 시도해주세요.';
                if(e.message.includes('ENCRYPTED_KEY_NOT_FOUND')) displayError = '저장된 API 키가 없습니다. [내 정보] 탭에서 먼저 키를 저장해주세요.';
                errorDetail.textContent = `시뮬레이션 실패: ${displayError}`;
            }
        }
    } else {
        // 사용자가 비밀번호 입력을 취소한 경우
        const loading = root.querySelector('.sim-loading');
        if(loading) loading.innerHTML = `<div class="card pad small">비밀번호 입력이 취소되었습니다.</div>`;
    }
  }
}

export function mount() {
  const m = location.hash.match(/#\/?battle\??(.*)$/);
  if (!m) return;
  const q = new URLSearchParams(m[1] || '');
  const id = q.get('id');
  const meName = decodeURIComponent(q.get('me') || 'A');
  const opName = decodeURIComponent(q.get('op') || 'B');

  // mount에서는 withBlocker 없이 render 함수를 바로 호출합니다.
  if (id) render(id, meName, opName);
}
