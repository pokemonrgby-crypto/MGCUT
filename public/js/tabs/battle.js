// public/js/tabs/battle.js
import { api } from '../api.js';

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
    const res = await api.battleSimulate(battleId);
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
      b.textContent = `결과: ${winner} 승리`;
      out.prepend(b);
      // 서버에서 이미 Elo 업데이트 및 로그 저장이 완료되었으므로 battleFinish 호출은 불필요.
    } else {
      const b = document.createElement('div');
      b.className = 'winner-badge err';
      b.textContent = '결과: 승자 판독 불가';
      out.prepend(b);
    }

  } catch(e) {
    const l = root.querySelector('.sim-loading .small');
    if (l) l.textContent = `시뮬레이션 실패: ${e.message || e}`;
    l.closest('.sim-loading').classList.add('err');
  }

  root.querySelector('#btn-rematch').onclick = () => {
    history.back();
  };
  root.querySelector('#btn-resim').onclick = () => {
    render(battleId);
  };
}

export function mount() {
  const m = location.hash.match(/#\/?battle\??(.*)$/);
  if (!m) return;
  const q = new URLSearchParams(m[1] || '');
  const id = q.get('id');
  if (id) render(id);
}
