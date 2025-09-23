// public/js/tabs/battle.js
import { api } from '../api.js';
import { ui } from '../ui/frame.js';
import { callClientSideGemini } from '../lib/gemini-client.js';

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
      <div class="small" style="opacity:.8">Gemini API 키로 AI를 호출합니다.</div>
    </div>
    <div class="card pad md-body" style="margin:0 16px 16px; display:none"></div>
    <div style="display:flex; gap:8px; margin:0 16px 16px">
      <button id="btn-rematch" class="btn secondary">다른 상대 찾기</button>
      <button id="btn-resim" class="btn">다시 시뮬레이션</button>
    </div>
  `;

  const key = localStorage.getItem('GEMINI_KEY');
  if (!key) {
    const l = root.querySelector('.sim-loading .small');
    if (l) l.innerHTML = '내정보 탭에서 Gemini API 키를 먼저 저장해주세요.';
    return;
  }

  try {
    // [수정] 1. 서버에서 AI 호출을 위한 프롬프트만 받아옵니다. (API Key 전달 불필요)
    const promptRes = await api.battleSimulate(battleId);
    const promptForClient = promptRes.data.promptForClient;

    if (!promptForClient) {
        throw new Error("서버로부터 유효한 AI 프롬프트를 받지 못했습니다.");
    }
    
    // 2. 클라이언트에서 Gemini API를 직접 호출합니다.
    const markdown = await callClientSideGemini({
        system: "당신은 판타지 전투 해설가입니다. 전투 과정을 생생하고 흥미롭게 묘사해주세요. 마지막 줄에는 반드시 '승자: A' 또는 '승자: B'를 포함해야 합니다. 출력은 반드시 한국어 마크다운 형식이어야 합니다.",
        user: promptForClient
    }, "text/plain"); // [수정] Gemini가 마크다운을 더 잘 생성하도록 text/plain으로 요청

    if (!markdown) {
        throw new Error("AI가 유효한 전투 로그를 생성하지 못했습니다.");
    }

    const out = root.querySelector('.md-body');
    if (out) {
      out.innerHTML = md(markdown);
      out.style.display = '';
    }

    root.querySelector('.sim-loading')?.remove();

    // 3. 승자 정보를 파싱하고, 서버에 결과를 전송하여 Elo를 업데이트합니다.
    const m = /승자:\s*(A|B)/.exec(markdown);
    if (m) {
      const winner = m[1];
      const b = document.createElement('div');
      b.className = 'winner-badge';
      b.textContent = `결과: ${winner} 승리`;
      out.prepend(b);
      
      // Elo 업데이트 요청
      await api.battleFinish(battleId, winner);

    } else {
      // AI가 승자를 명시하지 않은 경우 UI에 알림
      const b = document.createElement('div');
      b.className = 'winner-badge err';
      b.textContent = '결과: 승자 판독 불가';
      out.prepend(b);
      // alert('AI가 승자를 명확하게 지정하지 않아 Elo 점수가 업데이트되지 않았습니다.');
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
  // [수정] onRoute를 mount로 변경하고 export
  const m = location.hash.match(/#\/?battle\??(.*)$/);

  if (!m) return;
  const q = new URLSearchParams(m[1] || '');
  const id = q.get('id');
  if (id) render(id);
}
