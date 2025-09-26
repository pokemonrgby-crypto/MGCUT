// public/js/tabs/character-timeline.js
import { api } from '../api.js';
import { ui } from '../ui/frame.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function parseRichText(text) {
  if (!text) return '';
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

let battleLogsCache = [];

function battleLogCard(log, currentCharId) {
  const isMeA = String(log.meId) === String(currentCharId);

  const opponentName = isMeA ? (log.opName || '상대') : (log.meName || '나');
  const opponentImageUrl = isMeA ? (log.opImageUrl || '') : (log.meImageUrl || '');

  const myEloAfter = Number(isMeA ? log.eloMeAfter : log.eloOpAfter);
  const myEloBefore = Number(isMeA ? log.eloMe : log.eloOp);
  const eloChange = myEloAfter - myEloBefore;
  const eloChangeStr = eloChange >= 0 ? `+${eloChange}` : `${eloChange}`;

  let resultText = '무승부';
  let resultClass = '';
  if (log.winner) {
    const didIWin = (isMeA && log.winner === 'A') || (!isMeA && log.winner === 'B');
    resultText = didIWin ? '승리' : '패배';
    resultClass = didIWin ? 'ok' : 'err';
  }

  const date = new Date((log.createdAt?.seconds ?? 0) * 1000);
  const dateStr = formatDate(date);

  return `
  <div class="card battle-log-char-card" data-log-id="${esc(log.id)}" style="cursor:pointer;">
    <div class="bg" style="background-image:url('${esc(opponentImageUrl)}')"></div>
    <div class="grad"></div>
    <div class="info-overlay">
      <div class="opponent-name">vs ${esc(opponentName)}</div>
      <div class="result-line">
        <span class="${resultClass}">${resultText}</span>
        (Elo ${myEloAfter} <span class="small ${resultClass}">(${eloChangeStr})</span>)
      </div>
      <div class="date">${dateStr}</div>
    </div>
  </div>`;
}

async function showBattleLogModal(logId, characterId) {
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

        const battleCharacterCard = (c, elo) => {
            const bg = c.imageUrl || '';
            const name = c.name || '(이름없음)';
            const isWinner = (log.winner === 'A' && c.id === log.meId) || (log.winner === 'B' && c.id === log.opId);
            const resultText = log.winner ? (isWinner ? '<span class="ok">승리</span>' : '<span class="err">패배</span>') : '무승부';

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

        const meCard = battleCharacterCard(isMeA ? me : op, myEloAfter);
        const opCard = battleCharacterCard(isMeA ? op : me, opEloAfter);

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
}


export async function render(container, characterData) {
    const characterId = characterData.id;
    container.innerHTML = `<div class="spinner"></div>`;
    
    // 이벤트 리스너 중복 등록 방지
    if (container.dataset.eventsAttached === 'true') {
        return;
    }
    container.dataset.eventsAttached = 'true';

    container.addEventListener('click', async (e) => {
        const card = e.target.closest('.battle-log-char-card');
        if (card) {
            const logId = card.dataset.logId;
            await showBattleLogModal(logId, characterId);
        }
    });

    try {
        const res = await api.getCharacterBattleLogs(characterId);
        if (!res.ok || !Array.isArray(res.data)) {
            throw new Error(res.error || 'API로부터 유효한 데이터를 받지 못했습니다.');
        }
        
        battleLogsCache = res.data; 

        if (battleLogsCache.length > 0) {
            const cardsHtml = battleLogsCache.map(log => battleLogCard(log, characterId)).join('');
            container.innerHTML = `<div class="list v-list" style="display: flex; flex-direction: column; gap: 12px;">${cardsHtml}</div>`;
        } else {
            container.innerHTML = '<div class="card pad small">아직 전투 기록이 없습니다.</div>';
        }
    } catch (e) {
        console.error('Failed to fetch battle logs:', e);
        container.innerHTML = `<div class="card pad err">전투 기록을 불러오는 데 실패했습니다: ${e.message}</div>`;
    }
}
