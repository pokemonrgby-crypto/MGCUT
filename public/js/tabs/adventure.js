// /public/js/tabs/adventure.js
export function mount(){
  const host = document.querySelector('[data-view="adventure"] .list');
  host.innerHTML = `
    <div class="card pad">
      <div style="font-weight:700">모험 시스템</div>
      <div class="small">다음 업데이트에서 탐험/전투 로그를 연결할 예정입니다.</div>
    </div>
  `;
}
