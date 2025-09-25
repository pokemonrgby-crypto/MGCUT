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
    .replace(/<생각>/g, '<div class="thought">') // [수정] 오타를 수정했습니다.
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

// pokemonrgby-crypto/mgcut/MGCUT-835e6b59e9ab40cbbe58f3a0a75f08566581d8a2/public/js/tabs/character-timeline.js
// ... (Line 31 부근)

function battleLogCard(log, currentCharId) {
    const isMeA = log.meId === currentCharId;
    const opponentName = isMeA ? log.opName : log.meName;
    const myEloAfter = isMeA ? log.eloMeAfter : log.eloOpAfter;
    const opponentEloAfter = isMeA ? log.eloOpAfter : log.eloMeAfter;
    const myEloBefore = isMeA ? log.eloMe : log.eloOp;
    
    const eloChange = myEloAfter - myEloBefore;
    const eloChangeStr = eloChange >= 0 ? `+${eloChange}` : `${eloChange}`;
    
    let result = '무승부';
    let resultClass = '';
    if (log.winner) {
        const didIWin = (isMeA && log.winner === 'A') || (!isMeA && log.winner === 'B');
        result = didIWin ? '승리' : '패배';
        resultClass = didIWin ? 'ok' : 'err';
    }
    
    const opponentImageUrl = isMeA ? log.opImageUrl : log.meImageUrl;
    const date = new Date((log.createdAt?.seconds || 0) * 1000);

    return `
    <div class="battle-log-char-card" data-log-id="${log.id}" style="cursor:pointer;">
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
    <div class="card info-card adventure-log-card" data-adventure-id="${log.id}" style="margin-bottom: 12px; cursor:pointer;">
        <div class="name">${log.siteName} 탐험</div>
        <div class="desc small">
            ${log.worldId} · ${statusText} · ${formatDate(date)}
        </div>
        ${log.status === 'ongoing' ? `<button class="btn small resume-btn" style="margin-top:8px;" data-adventure-id="${log.id}">모험 계속하기</button>` : ''}
    </div>
    `;
}

// ... (Line 126 부근)

    // 배틀 로그 클릭 시 모달
    container.addEventListener('click', async (e) => { // [수정] async 추가
        const card = e.target.closest('.battle-log-char-card');
        if (!card) return;
        
        // [추가] 모달에서 사용할 캐릭터 정보 가져오기
        const charId = characterData.id;
        const meId = card.dataset.meId;
        const opId = card.dataset.opId;

        // [추가] 로그 정보 전체를 가져옴
        const res = await api.getCharacterBattleLogs(charId);
        const log = res.data.find(l => l.id === card.dataset.logId);
        if (!log) return alert('로그 정보를 찾을 수 없습니다.');
        
        const meRes = await api.getCharacter(meId);
        const opRes = await api.getCharacter(opId);
        
        const me = meRes.data;
        const op = opRes.data;
        
        const myElo = meId === charId ? log.eloMeAfter : log.eloOpAfter;
        const opElo = opId === charId ? log.eloOpAfter : log.eloMeAfter; // [수정] 상대방 Elo 변경
        
        const battleCharacterCard = (c, side, charId, elo) => { // [추가] 캐릭터 카드 템플릿 함수
            const bg = c.imageUrl || '';
            const name = c.name || '(이름없음)';
            const isMe = c.id === charId;
            const isWinner = (log.winner === 'A' && c.id === log.meId) || (log.winner === 'B' && c.id === log.opId);
            const isLoser = (log.winner === 'A' && c.id === log.opId) || (log.winner === 'B' && c.id === log.meId);
            const resultText = log.winner ? (isWinner ? '<span class="ok">승리</span>' : (isLoser ? '<span class="err">패배</span>' : '무승부')) : '무승부';
            
            return `
            <div class="card character-card" data-nav-to="#character/${c.id}" style="cursor:pointer; flex:1; height: 160px; margin:0;">
                <div class="bg" style="background-image:url('${esc(bg)}')"></div>
                <div class="grad"></div>
                <div class="title shadow-title" style="bottom: 30px; font-size:16px;">${esc(name)}</div>
                <div class="char-info" style="bottom: 8px; right: 8px;">
                    ${resultText} (Elo: ${elo})
                </div>
            </div>`;
        };
        
        const meCharData = meId === charId ? me : op;
        const opCharData = meId === charId ? op : me;
        
        const meCard = battleCharacterCard(meCharData, meCharData.id === log.meId ? 'A' : 'B', charId, myElo);
        const opCard = battleCharacterCard(opCharData, opCharData.id === log.meId ? 'A' : 'B', charId, opElo);

        const modal = document.createElement('div');
        modal.className = 'modal-layer';
        modal.innerHTML = `
        <div class="modal-card">
            <button class="modal-close" aria-label="닫기">×</button>
            <div class="modal-body">
                <h3>전투 기록</h3>
                <div class="compare-row" style="margin: 12px 0 20px;">
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
                modal.remove(); // 모달 닫기
                return;
            }
            if (ev.target === modal || ev.target.classList.contains('modal-close')) {
                modal.remove();
            }
        });
    });

    // [추가] 모험 로그 클릭 시 이벤트 바인딩
    container.addEventListener('click', (e) => {
        const card = e.target.closest('.adventure-log-card');
        const resumeBtn = e.target.closest('.resume-btn');
        const adventureId = card?.dataset.adventureId || resumeBtn?.dataset.adventureId;
        
        if (adventureId) {
            // 진행 중이든 아니든 상세 페이지로 이동
            ui.navTo(`adventure-detail/${adventureId}`);
        }
    });
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
    container.addEventListener('click', async (e) => {
        const card = e.target.closest('.battle-log-char-card');
        if (!card) return;
        
        const logId = card.dataset.logId;
        
        try {
            const res = await api.getCharacterBattleLogs(characterId);
            const log = res.data.find(l => l.id === logId);
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
                        ${resultText} (Elo: ${elo})
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
                    <div class="compare-row" style="margin: 12px 0 20px;">
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

    // 모험 로그 클릭 시 이벤트 바인딩
    container.addEventListener('click', (e) => {
        const card = e.target.closest('.adventure-log-card, .resume-btn');
        if (card && card.dataset.adventureId) {
            ui.navTo(`adventure-detail/${card.dataset.adventureId}`);
        }
    });
}
