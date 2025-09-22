// public/js/tabs/create.js
const rootSel = '[data-view="create"]';

export function mount() {
  const root = document.querySelector(rootSel);
  if (root.dataset.mounted === '1') return;
  root.dataset.mounted = '1';
  renderHub();
}

function renderHub() {
  const host = document.querySelector(`${rootSel} .grid3`);
  if (!host) return;
  host.innerHTML = `
    <div class="card create-card" data-nav-to="#create-world">
      <div class="icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L4.5 5L12 8l7.5-3L12 2zm-7.49 13.5c.66 2.45 2.19 4.45 4.99 5.5V10.5l-5-2v5.5zM12 10.5v10.5c2.8-.95 4.33-3.05 4.99-5.5V8.5l-5 2zM19.5 5.5v5l-5 2V7l5-2z"/></svg></div>
      <div><div class="t">세계관 생성</div><div class="s">AI로 새로운 세계를 창조</div></div>
    </div>
    <div class="card create-card" data-nav-to="#create-character">
      <div class="icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 6c1.1 0 2 .9 2 2s-.9 2-2 2s-2-.9-2-2s.9-2 2-2m0 9c2.7 0 5.8 1.29 6 2v1H6v-1c.2-.71 3.3-2 6-2m0-11C9.79 4 8 5.79 8 8s1.79 4 4 4s4-1.79 4-4s-1.79-4-4-4zm0 9c-2.67 0-8 1.34-8 4v3h16v-3c0-2.66-5.33-4-8-4z"/></svg></div>
      <div><div class="t">캐릭터 생성</div><div class="s">세계관 속 인물 만들기</div></div>
    </div>
    <div class="card create-card" data-nav-to="#create-prompt">
      <div class="icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 5h18v2H3V5zm0 4h18v2H3V9zm0 4h18v2H3v-2zm0 4h18v2H3v-2z"/></svg></div>
      <div><div class="t">프롬프트 업로드</div><div class="s">캐릭터 생성 규칙 공유</div></div>
    </div>
  `;

  // 카드 클릭 시 해시 변경으로 라우팅을 트리거합니다.
  document.querySelectorAll(`${rootSel} [data-nav-to]`).forEach(b => {
    b.onclick = () => {
      window.location.hash = b.dataset.navTo;
    };
  });
}
