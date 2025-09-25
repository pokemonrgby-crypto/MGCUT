// (수정된 결과)
// public/js/tabs/character-timeline.js
import { api } from '../api.js';
import { ui } from '../ui/frame.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function parseRichText(text) {
  if (!text) return '';
  // HTML 태그가 변환되기 전에 리치 텍스트를 먼저 처리하도록 순서 변경
  return text.replace(/<대사>/g, '<div class="dialogue">')
    .replace(/<\/대사>/g, '</div>')
    .replace(/<서술>/g, '<div class="narrative">')
    .replace(/<\/서술>/g, '</div>')
    .replace(/<강조>/g, '<strong class="emphasis">')
    .replace(/<\/강조>/g, '</strong>')
    .replace(/<생각>/g, '<div class="thought">')
    .replace(/<\/생각>/g, '</div>')
    .replace(/<시스템>/g, '<div class="system">')
    .replace(/<\/시스템>/g, '</div>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

function formatDate(date) {
    if (!date) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${y}.${m}.${d}. ${h}:${min}`;
}

// --- 카드 템플릿 ---
// === 교체 시작 ===
function battleLogCard(log, currentCharId) {
  const isMeA = String(log.meId) === String(currentCharId);

  // 이름/이미지 안전 기본값
  const meName = String(log.meName || '나의 캐릭터');
  const opName = String(log.opName || '상대 캐릭터');
  const opponentName = isMeA ? opName : meName;

  // Elo 안전 숫자화
  const myEloBefore = Number(isMeA ? log.eloMe : log.eloOp);
  const myEloAfter  = Number(isMeA ? log.eloMeAfter : log.eloOpAfter);
  const safeEloBefore = Number.isFinite(myEloBefore) ? myEloBefore : 1000;
  const safeEloAfter  = Number.isFinite(myEloAfter)  ? myEloAfter  : safeEloBefore;
  const eloChange = safeEloAfter - safeEloBefore;
  const eloChangeStr = (eloChange >= 0 ? `+${eloChange}` : `${eloChange}`);

  // 승패 표시
  let result = '무승부';
  let resultClass = '';
  if (log.winner === 'A' || log.winner === 'B') {
    const didIWin = (isMeA && log.winner === 'A') || (!isMeA && log.winner === 'B');
    result = didIWin ? '승리' : '패배';
    resultClass = didIWin ? 'win' : 'lose';
  }

  // 날짜 안전 처리
  const tsSec = (log.createdAt?.seconds ?? log.updatedAt?.seconds ?? 0);
  const date = new Date(tsSec * 1000);
  const dateStr = Number.isFinite(date.getTime()) ? formatDate(date) : '';

  return `
  <div class="card info-card battle-log-char-card" data-log-id="${esc(log.id)}" style="cursor:pointer;">
    <div class="row">
      <img class="avatar" src="${esc(isMeA ? (log.opImageUrl||'') : (log.meImageUrl||''))}" alt="" onerror="this.style.display='none'">
      <div class="col">
        <div class="opponent-name">vs ${esc(opponentName)}</div>
        <div class="result-line">
          <span class="${resultClass}">${result}</span>
          (Elo ${safeEloAfter} <span class="small ${resultClass}">(${eloChangeStr})</span>)
        </div>
        <div class="date">${esc(dateStr)}</div>
      </div>
    </div>
  </div>`;
}
// === 교체 끝 ===


function adventureLogCard(log) {
    const date = new Date((log.createdAt?.seconds || 0) * 1000);
    const statusText = log.status === 'ongoing' ? '진행 중' : '완료';
    return `
    <div class="card info-card adventure-log-card" data-adventure-id="${log.id}" style="margin-bottom: 12px; cursor:pointer;">
        <div class="name">${log.siteName} 탐험</div>
        <div class="desc small">
            ${log.worldId} · ${statusText} · ${formatDate(date)}
        </div>
        ${log.status === 'ongoing' ? `<button class="btn small resume-btn" style="margin-top:8px;" data-adventure-id="${log.id}">모험 계속하기</button>` : ''}
    </div>
    `;
}


// --- 데이터 로딩 및 렌더링 ---
let battleLogsCache = []; 

async function renderBattleLogs(container, characterId) {
    container.innerHTML = `<div class="spinner"></div>`;
    try {
        // 1. API 호출
        const res = await api.getCharacterBattleLogs(characterId);
        
        // 2. 데이터 유효성 검사
        if (!res.ok || !Array.isArray(res.data)) {
            throw new Error(res.error || 'API로부터 유효한 데이터를 받지 못했습니다.');
        }
        
        battleLogsCache = res.data; 

        // 3. 렌더링 또는 빈 화면 표시
        if (battleLogsCache.length > 0) {
            try {
                const cardsHtml = battleLogsCache.map(log => battleLogCard(log, characterId)).join('');
                // [수정] 애니메이션이 적용되도록 'v-list' 클래스를 추가합니다.
                container.innerHTML = '<div class="list v-list">' + cardsHtml + '</div>';
            } catch (renderError) {
                console.error('Timeline battle log rendering failed:', renderError);
                container.innerHTML = `<div class="card pad err">전투 기록을 화면에 표시하는 중 오류가 발생했습니다: ${renderError.message}</div>`;
            }
        } else {
            container.innerHTML = '<div class="card pad small">아직 전투 기록이 없습니다.</div>';
        }
    } catch (e) {
        console.error('Failed to fetch battle logs:', e);
        container.innerHTML = `<div class="card pad err">전투 기록을 불러오는 데 실패했습니다: ${e.message}</div>`;
    }
}

async function renderAdventureLogs(container, characterId) {
    container.innerHTML = `<div class="spinner"></div>`;
    try {
        const res = await api.getCharacterAdventures(characterId);
        if (res.ok && res.data.length > 0) {
            container.innerHTML = res.data.map(adventureLogCard).join('');
        } else {
            container.innerHTML = '<div class="card pad small">아직 모험 기록이 없습니다.</div>';
        }
    } catch (e) {
        container.innerHTML = `<div class="card pad err">모험 기록을 불러오는 데 실패했습니다: ${e.message}</div>`;
    }
}


export function render(container, characterData) {
    const characterId = characterData.id;
    container.innerHTML = `
        <div class="tabs tabs-char" style="grid-template-columns: repeat(2, 1fr); padding: 8px 0; margin-bottom: 12px;">
            <button data-subtab="battle" class="active">배틀</button>
            <button data-subtab="adventure">탐험</button>
        </div>
        <div class="tab-panels">
            <div class="panel subpanel battle active"></div>
            <div class="panel subpanel adventure" style="display:none;"></div>
        </div>
    `;

    const battlePanel = container.querySelector('.panel.battle');
    const adventurePanel = container.querySelector('.panel.adventure');

    renderBattleLogs(battlePanel, characterId);

    container.querySelector('.tabs-char').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-subtab]');
        if (!btn) return;

        container.querySelectorAll('button[data-subtab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        container.querySelectorAll('.subpanel').forEach(p => p.style.display = 'none');
        const targetPanel = container.querySelector(`.panel.${btn.dataset.subtab}`);
        targetPanel.style.display = '';

        if (btn.dataset.subtab === 'adventure' && !targetPanel.dataset.loaded) {
            renderAdventureLogs(targetPanel, characterId);
            targetPanel.dataset.loaded = '1';
        }
    });

    container.addEventListener('click', async (e) => {
        const card = e.target.closest('.battle-log-char-card');
        if (!card) return;
        
        const logId = card.dataset.logId;
        
        try {
            const log = battleLogsCache.find(l => l.id === logId);
            if (!log) return alert('로그 정보를 찾을 수 없습니다.');
            
            const [meRes, opRes] = await Promise.all([
                api.getCharacter(log.meId),
                api.getCharacter(log.opId)
            ]);
            
            if (!meRes.ok || !opRes.ok) throw new Error('캐릭터 정보 로딩 실패');
            
            const me = meRes.data;
            const op = opRes.data;
            
            const isMeA = log.meId === characterId;
            const myEloAfter = isMeA ? log.eloMeAfter : log.eloOpAfter;
            const opEloAfter = isMeA ? log.eloOpAfter : log.eloMeAfter;

            const battleCharacterCard = (c, side, elo) => {
                const bg = c.imageUrl || '';
                const name = c.name || '(이름없음)';
                const isWinner = (log.winner === 'A' && c.id === log.meId) || (log.winner === 'B' && c.id === log.opId);
                const isLoser = (log.winner === 'A' && c.id === log.opId) || (log.winner === 'B' && c.id === log.meId);
                const resultText = log.winner ? (isWinner ? '<span class="ok">승리</span>' : (isLoser ? '<span class="err">패배</span>' : '무승부')) : '무승부';
                
                return `
                <div class="card character-card" data-nav-to="#character/${c.id}" style="cursor:pointer; flex:1; height: 160px; margin:0;">
                    <div class="bg" style="background-image:url('${esc(bg)}')"></div>
                    <div class="grad"></div>
                    <div class="title shadow-title" style="bottom: 30px; font-size:16px;">${esc(name)}</div>
                    <div class="char-info" style="bottom: 8px; right: 8px;">
                        ${resultText} (Elo: ${elo ?? (c.elo || 1000)})
                    </div>
                </div>`;
            };
            
            const meCard = battleCharacterCard(isMeA ? me : op, '나', myEloAfter);
            const opCard = battleCharacterCard(isMeA ? op : me, '상대', opEloAfter);

            const modal = document.createElement('div');
            modal.className = 'modal-layer';
            modal.innerHTML = `
            <div class="modal-card">
                <button class="modal-close" aria-label="닫기">×</button>
                <div class="modal-body">
                    <h3>전투 기록</h3>
                    <div class="compare-row" style="margin: 12px 0 20px; display:flex; gap: 12px;">
                        ${meCard}
                        ${opCard}
                    </div>
                    <div class="md-body">${parseRichText(log.log)}</div>
                </div>
            </div>`;
            document.body.appendChild(modal);
            modal.addEventListener('click', (ev) => {
                const navTo = ev.target.closest('[data-nav-to]');
                if (navTo) {
                    window.location.hash = navTo.dataset.navTo;
                    modal.remove();
                    return;
                }
                if (ev.target === modal || ev.target.classList.contains('modal-close')) {
                    modal.remove();
                }
            });
        } catch (err) {
            alert(`오류: ${err.message}`);
        }
    });

    container.addEventListener('click', (e) => {
        const card = e.target.closest('.adventure-log-card, .resume-btn');
        if (card && card.dataset.adventureId) {
            ui.navTo(`adventure-detail/${card.dataset.adventureId}`);
        }
    });
}
