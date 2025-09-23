// /public/js/tabs/ranking.js
const ROOT = '[data-view="ranking"]';

export async function mount() {
  const el = document.querySelector(ROOT);
  if (!el) return;
  el.innerHTML = `
    <div class="card pad small">
      랭킹 화면은 준비 중이야. 기본 뼈대만 넣어뒀어. (에러 방지용)
    </div>
  `;
}
