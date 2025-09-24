// public/js/tabs/character-battlelog.js
import { api } from '../api.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function parseRichText(text) {
  if (!text) return '';
  // 마크다운 형식의 텍스트를 HTML로 간단히 변환
  let html = esc(text)
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // 서사 태그 변환
  return html.replace(/<대사>/g, '<div class="dialogue">')
    .replace(/<\/대사>/g, '</div>')
    .replace(/<서술>/g, '<div class="narrative">')
    .replace(/<\/서술>/g, '</div>')
    .replace(/<강조>/g, '<strong class="emphasis">')
    .replace(/<\/강조>/g, '</strong>')
    .replace(/<생각>/g, '<div class="thought">')
    .replace(/<\/생각>/g, '</div>')
    .replace(/<시스템>/g, '<div class="system">')
    .replace(/<\/시스템>/g, '</div>');
}

function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${y}.${m}.${d}. ${h}:${min}`;
}


function battleLogCard(log, currentCharId, index) {
    const isMeA = log.meId === currentCharId;
    const result = log.winner === (isMeA ? 'A' : 'B') ? '승리' : '패배';
    const resultClass = result === '승리' ? 'ok' : 'err';
    const myEloAfter = isMeA ? log.eloMeAfter : log.eloOpAfter;
    const eloChange = myEloAfter - (isMeA ? log.eloMe : log.eloOp);
    const eloChangeStr = eloChange >= 0 ? `+${eloChange}` : eloChange;
    const opponentName = isMeA ? log.opName : log.meName;
    const opponentImageUrl = isMeA ? log.opImageUrl : log.meImageUrl;
    const date = new Date((log.createdAt?.seconds || 0) * 1000);

    return `
    <div class="battle-log-char-card" data-log-index="${index}" style="cursor:pointer;">
        <div class="bg" style="${opponentImageUrl ? `background-image:url('${esc(opponentImageUrl)}')` : ''}"></div>
        <div class="grad"></div>
        <div class="info-overlay">
            <div class="opponent-name">vs ${esc(opponentName)}</div>
            <div class="result-line">
                <span class="${resultClass}">${result}</span>
                (Elo ${myEloAfter} <span class="small ${resultClass}">(${eloChangeStr})</span>)
            </div>
            <div class="date">${formatDate(date)}</div>
        </div>
    </div>`;
}

export async function render(container, characterId) {
  container.innerHTML = `<div class="spinner"></div>`;
  let battleLogs = [];

  try {
    const logRes = await api.getCharacterBattleLogs(characterId);
    if (logRes.ok && logRes.data.length > 0) {
      battleLogs = logRes.data;
      container.innerHTML = '<div class="list">' + battleLogs.map((log, i) => battleLogCard(log, characterId, i)).join('') + '</div>';
    } else {
      container.innerHTML = '<div class="card pad small">아직 전투 기록이 없습니다.</div>';
    }
  } catch (e) {
    container.innerHTML = `<div class="card pad err">로그를 불러오는 데 실패했습니다: ${e.message}</div>`;
  }

  container.addEventListener('click', (e) => {
    const card = e.target.closest('.battle-log-char-card');
    if (!card) return;

    const logIndex = parseInt(card.dataset.logIndex, 10);
    const log = battleLogs[logIndex];
    if (!log || !log.log) return;

    const modal = document.createElement('div');
    modal.className = 'modal-layer';
    modal.innerHTML = `
      <div class="modal-card">
        <button class="modal-close" aria-label="닫기">×</button>
        <div class="modal-body">
          <h3>전투 기록</h3>
          <div>${parseRichText(log.log)}</div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (ev) => {
      if (ev.target === modal || ev.target.classList.contains('modal-close')) {
        modal.remove();
      }
    });
  });
}
