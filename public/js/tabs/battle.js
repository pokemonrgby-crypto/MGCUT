// 배틀 화면 (리치텍스트 로그)
import { api } from '../api.js';

const ROOT = '[data-view="battle"]';

// 아주 간단한 마크다운 렌더(굵게/기울임/인용/코드)
const esc = s => String(s??'').replace(/[&<>"]/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
function md(s){
  let t = esc(s);
  t = t.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');
  t = t.replace(/\*(.+?)\*/g,'<i>$1</i>');
  t = t.replace(/`(.+?)`/g,'<code>$1</code>');
  t = t.replace(/^> (.+)$/gm,'<blockquote>$1</blockquote>');
  t = t.replace(/\n/g,'<br>');
  return t;
}

async function render(battleId){
  const root = document.querySelector(ROOT);
  if (!root) return;
  root.innerHTML = `
    <div class="section-h">배틀</div>
    <div class="battle-head card" style="margin:0 16px 12px; padding:10px 12px; display:flex; justify-content:space-between; align-items:center">
      <div class="small">ID: ${battleId}</div>
      <div>
        <button class="btn small" id="btn-auto">자동 OFF</button>
      </div>
    </div>
    <div class="battle-log card" style="margin:0 16px 12px; padding:12px; max-height:50vh; overflow:auto"></div>
    <div class="card pad" style="margin:0 16px 16px">
      <div class="small" style="margin-bottom:6px">행동 입력(리치텍스트는 AI가 생성)</div>
      <input id="action" type="text" placeholder="예: 은신 후 일격" style="width:100%">
      <button id="btn-turn" class="btn" style="margin-top:10px">다음 턴</button>
    </div>
  `;

  const log = root.querySelector('.battle-log');
  const actionInput = root.querySelector('#action');
  const btnTurn = root.querySelector('#btn-turn');
  const btnAuto = root.querySelector('#btn-auto');
  let auto = false, timer = null;

  function push(text){ const d = document.createElement('div'); d.className='log-line'; d.innerHTML = md(text); log.appendChild(d); log.scrollTop = log.scrollHeight; }

  async function doTurn(){
    const key = localStorage.getItem('OPENAI_KEY') || '';
    if (!key) { alert('Matching 화면에서 OpenAI 키를 저장해줘!'); auto=false; btnAuto.textContent='자동 OFF'; return; }
    const act = actionInput.value.trim() || '기본 공격';
    actionInput.value = '';
    try{
      await api.battleTurn(battleId, act, key);
      push(`**행동**: ${act}\n\n> (서버 응답) 모델 응답 샘플이 추가되었습니다.`);
    }catch(e){ push(`오류: ${e.message||e}`); auto=false; btnAuto.textContent='자동 OFF'; }
  }

  btnTurn.onclick = doTurn;
  btnAuto.onclick = ()=>{
    auto = !auto;
    btnAuto.textContent = auto ? '자동 ON' : '자동 OFF';
    if (auto){
      timer = setInterval(doTurn, 2000);
    }else{
      if (timer) clearInterval(timer);
    }
  };
}

// 라우팅 훅
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
