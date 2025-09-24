// public/js/tabs/battle.js
import { api } from '../api.js';
import { sessionKeyManager } from '../session-key-manager.js';
import { withBlocker } from '../ui/frame.js';

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

async function render(battleId){
  const root = document.querySelector(ROOT);
  if (!root) return;
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

  try {
    const password = await sessionKeyManager.getPassword();
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

    if (winner) {
      const b = document.createElement('div');
      b.className = 'winner-badge';
      b.textContent = `결과: ${winner === 'A' ? b.meName : b.opName} 승리`;
      out.prepend(b);
    } else {
      const b = document.createElement('div');
      b.className = 'winner-badge err';
      b.textContent = '결과: 승자 판독 불가';
      out.prepend(b);
    }

  } catch(e) {
    if (!e.message.includes('사용자가')) {
        const l = root.querySelector('.sim-loading .small');
        if (l) l.textContent = `시뮬레이션 실패: ${e.message || e}`;
        l.closest('.sim-loading').classList.add('err');
    } else {
        // 사용자가 비밀번호 입력을 취소한 경우, 로딩 화면을 숨기고 이전 페이지로 돌아갈 수 있도록 유도
        const loading = root.querySelector('.sim-loading');
        if(loading) loading.innerHTML = `<div class="small">비밀번호 입력이 취소되었습니다.</div>`;
    }
  }

  root.querySelector('#btn-rematch').onclick = () => {
    history.back();
  };
  root.querySelector('#btn-resim').onclick = () => {
    withBlocker(() => render(battleId));
  };
}

export function mount() {
  const m = location.hash.match(/#\/?battle\??(.*)$/);
  if (!m) return;
  const q = new URLSearchParams(m[1] || '');
  const id = q.get('id');
  if (id) withBlocker(() => render(id));
}
