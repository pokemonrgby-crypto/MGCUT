// public/js/tabs/battle.js
import { api } from '../api.js';
import { ui } from '../ui/frame.js';

const ROOT = '[data-view="battle"]';

const esc = s => String(s??'').replace(/[&<>"]/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));

// [수정] 상세 서식(Rich Text) 파싱 함수 추가
function parseRichText(text) {
  if (!text) return '';
  let t = esc(text);
  // 커스텀 태그 변환
  t = t.replace(/&lt;서술&gt;([\s\S]*?)&lt;\/서술&gt;/g, '<div class="narrative">$1</div>');
  t = t.replace(/&lt;대사&gt;([\s\S]*?)&lt;\/대사&gt;/g, '<div class="dialogue">$1</div>');
  t = t.replace(/&lt;생각&gt;([\s\S]*?)&lt;\/생각&gt;/g, '<div class="thought">$1</div>');
  t = t.replace(/&lt;강조&gt;([\s\S]*?)&lt;\/강조&gt;/g, '<strong class="emphasis">$1</strong>');
  t = t.replace(/&lt;시스템&gt;([\s\S]*?)&lt;\/시스템&gt;/g, '<div class="system">$1</div>');
  
  // 기본 마크다운 변환
  t = t.replace(/^### (.+)$/gm,'<h3>$1</h3>');
  t = t.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');
  t = t.replace(/\*(.+?)\*/g,'<i>$1</i>');
  t = t.replace(/`(.+?)`/g,'<code>$1</code>');
  t = t.replace(/^> (.+)$/gm,'<blockquote>$1</blockquote>');
  
  // 줄바꿈 처리
  t = t.replace(/\n{2,}/g,'</p><p>');
  t = t.replace(/\n/g,'<br>');
  
  // 단락(p) 태그로 감싸기
  return `<p>${t}</p>`;
}

async function render(battleId, meName, opName){
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

  const rematchBtn = root.querySelector('#btn-rematch');
  const resimBtn = root.querySelector('#btn-resim');

  rematchBtn.onclick = () => {
    history.back();
  };
  resimBtn.onclick = () => {
    render(battleId, meName, opName);
  };

  try {
    rematchBtn.disabled = true;
    resimBtn.disabled = true;

    const res = await api.battleSimulate(battleId);
    root.querySelector('.sim-loading')?.remove();

    const { markdown, winner, droppedItem } = res.data;

    if (!markdown) {
        throw new Error("AI가 유효한 전투 로그를 생성하지 못했습니다.");
    }
    
    if (droppedItem) {
        alert(`승리 보상으로 아이템 [${droppedItem.name} (${droppedItem.grade})] 을(를) 획득했습니다!`);
    }

    const out = root.querySelector('.md-body');
    if (out) {
      // [수정] md() -> parseRichText()
      out.innerHTML = parseRichText(markdown);
      out.style.display = '';
    }

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

  } catch(e) {
    const loadingEl = root.querySelector('.sim-loading');
    if (loadingEl) {
        loadingEl.classList.add('err');
        const errorDetail = loadingEl.querySelector('.small');
        if (errorDetail) {
            let displayError = e.message;
            if(e.message.includes('API_KEY_NOT_FOUND')) displayError = '저장된 API 키가 없습니다. [내 정보] 탭에서 먼저 키를 저장해주세요.';
            errorDetail.textContent = `시뮬레이션 실패: ${displayError}`;
        }
    }
  } finally {
    rematchBtn.disabled = false;
    resimBtn.disabled = false;
  }
}

export function mount() {
  const m = location.hash.match(/#\/?battle\??(.*)$/);
  if (!m) return;
  const q = new URLSearchParams(m[1] || '');
  const id = q.get('id');
  const meName = decodeURIComponent(q.get('me') || 'A');
  const opName = decodeURIComponent(q.get('op') || 'B');

  if (id) render(id, meName, opName);
}
