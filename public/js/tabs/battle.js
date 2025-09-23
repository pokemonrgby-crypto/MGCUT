// /public/js/tabs/battle.js — 1회 시뮬 버전
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
      <div class="dots">시뮬레이션 중<span>.</span><span>.</span><span>.</span></div>
      <div class="small" style="opacity:.8">AI는 내정보에 저장된 키로 호출돼.</div>
    </div>
    <div class="card pad md-body" style="margin:0 16px 16px; display:none"></div>
    <div style="display:flex; gap:8px; margin:0 16px 16px">
      <button id="btn-rematch" class="btn">다시 매칭</button>
      <button id="btn-resim" class="btn">다시 시뮬</button>
    </div>
  `;

  const key = localStorage.getItem('GEMINI_KEY') || '';
  if (!key) {
    const l = root.querySelector('.sim-loading .small');
    l.innerHTML = '내정보에서 API 키를 먼저 저장해줘!';
    return;
  }

  try{
    const r = await api.battleSimulate(battleId, key);
    const markdown = r?.data?.markdown || '**오류**: 결과 없음';
    const out = root.querySelector('.md-body');
    out.innerHTML = md(markdown);
    out.style.display = '';

    // 로딩 박스 숨김
    root.querySelector('.sim-loading')?.remove();

    // 승자 뱃지 강조
    const m = /승자:\s*(A|B|무승부)/.exec(markdown);
    if (m) {
      const b = document.createElement('div');
      b.className = 'winner-badge';
      b.textContent = `결과: ${m[1]}`;
      out.prepend(b);
    }

  }catch(e){
    const l = root.querySelector('.sim-loading .small');
    l.innerHTML = '시뮬 실패: ' + (e.message||e);
  }

  // 버튼
  root.querySelector('#btn-rematch').onclick = ()=>{
    // 이전 matching 화면으로 복귀
    history.back(); // 또는: location.hash = '#/matching'
  };
  root.querySelector('#btn-resim').onclick = ()=>{
    // 현재 id로 다시 시뮬
    render(battleId);
  };
}

function onRoute(){
  const m = location.hash.match(/#\/battle\??(.*)$/);
  const root = document.querySelector(ROOT);
  if (!root) return;
  root.style.display = m ? '' : 'none';
  if (!m) return;
  const q = new URLSearchParams(m[1]||'');
  const id = q.get('id');
  if (id) render(id);
}
window.addEventListener('hashchange', onRoute);
document.addEventListener('DOMContentLoaded', onRoute);
