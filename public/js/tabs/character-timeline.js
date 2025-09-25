// public/js/tabs/character-timeline.js
import { api } from '../api.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function parseRichText(text) {
  if (!text) return '';
  return text.replace(/<대사>/g, '<div class="dialogue">')
    .replace(/<\/대사>/g, '</div>')
    .replace(/<서술>/g, '<div class="narrative">')
    .replace(/<\/서술>/g, '</div>')
    .replace(/<강조>/g, '<strong class="emphasis">')
    .replace(/<\/강조>/g, '</strong>')
    .replace(/<생각>/g, '<div class.thought">')
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

function battleLogCard(log, currentCharId) {
    const isMeA = log.meId === currentCharId;
    const result = log.winner === (isMeA ? 'A' : 'B') ? '승리' : '패배';
    const resultClass = result === '승리' ? 'ok' : 'err';
    const myEloAfter = isMeA ? log.eloMeAfter : log.eloOpAfter;
    const eloChange = myEloAfter - (isMeA ? log.eloMe : log.eloOp);
    const eloChangeStr = eloChange >= 0 ? `+${eloChange}` : String(eloChange);
    const opponentName = isMeA ? log.opName : log.meName;
    const opponentImageUrl = isMeA ? log.opImageUrl : log.meImageUrl;
    const date = new Date((log.createdAt?.seconds || 0) * 1000);

    return `
    <div class="battle-log-char-card" data-log-json='${esc(JSON.stringify(log))}' style="cursor:pointer;">
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

function adventureLogCard(log) {
    const date = new Date((log.createdAt?.seconds || 0) * 1000);
    const statusText = log.status === 'ongoing' ? '진행 중' : '완료';
    return `
    <div class="card info-card" style="margin-bottom: 12px;">
        <div class="name">${log.siteName} 탐험</div>
        <div class="desc small">
            ${log.worldId} · ${statusText} · ${formatDate(date)}
        </div>
    </div>
    `;
}

// --- 데이터 로딩 및 렌더링 ---

async function renderBattleLogs(container, characterId) {
    container.innerHTML = `<div class="spinner"></div>`;
    try {
        const res = await api.getCharacterBattleLogs(characterId);
        if (res.ok && res.data.length > 0) {
            container.innerHTML = '<div class="list">' + res.data.map(log => battleLogCard(log, characterId)).join('') + '</div>';
        } else {
            container.innerHTML = '<div class="card pad small">아직 전투 기록이 없습니다.</div>';
        }
    } catch (e) {
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

    // 초기 탭 로드
    renderBattleLogs(battlePanel, characterId);

    // 서브탭 이벤트 바인딩
    container.querySelector('.tabs-char').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-subtab]');
        if (!btn) return;

        container.querySelectorAll('button[data-subtab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        container.querySelectorAll('.subpanel').forEach(p => p.style.display = 'none');
        const targetPanel = container.querySelector(`.panel.${btn.dataset.subtab}`);
        targetPanel.style.display = '';

        // 아직 로드되지 않은 탭이라면 데이터 로드
        if (btn.dataset.subtab === 'adventure' && !targetPanel.dataset.loaded) {
            renderAdventureLogs(targetPanel, characterId);
            targetPanel.dataset.loaded = '1';
        }
    });

    // 배틀 로그 클릭 시 모달
    container.addEventListener('click', (e) => {
        const card = e.target.closest('.battle-log-char-card');
        if (!card || !card.dataset.logJson) return;

        const log = JSON.parse(card.dataset.logJson);
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
