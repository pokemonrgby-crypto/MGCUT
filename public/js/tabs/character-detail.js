// /public/js/tabs/character-detail.js
const ROOT = '[data-view="character-detail"]';

export async function mount(characterId) {
  const el = document.querySelector(ROOT);
  if (!el) return;
  el.innerHTML = `
    <div class="card pad">
      캐릭터 상세는 준비 중이야.<br>
      요청한 ID: <b>${characterId || '(없음)'}</b>
    </div>
  `;
}
