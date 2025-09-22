// public/js/tabs/create-world.js
import { api } from '../api.js';
import { withBlocker, ui } from '../ui/frame.js';
import { callClientSideGemini } from '../lib/gemini-client.js';

const rootSel = '[data-view="create-world"]';
let worldSystemPrompt = ''; // 프롬프트를 캐싱할 변수

export function mount() {
  const root = document.querySelector(rootSel);
  if (!root || root.dataset.mounted === '1') return;
  root.dataset.mounted = '1';

  // 뷰가 처음 로드될 때 시스템 프롬프트를 미리 받아옴
  api.getSystemPrompt('world-system')
    .then(res => { worldSystemPrompt = res.data.content; })
    .catch(e => console.error('World system prompt 로딩 실패:', e));

  root.querySelector('#btn-world-generate-ai').onclick = async () => {
    const worldName = root.querySelector('#world-create-name').value.trim();
    const userInput = root.querySelector('#world-create-input').value.trim();
    if (!worldName) return alert('세계관 이름을 입력해주세요.');
    if (!worldSystemPrompt) return alert('시스템 프롬프트를 로드하지 못했습니다. 잠시 후 다시 시도해주세요.');

    try {
      await withBlocker(async () => {
        const worldJson = await callClientSideGemini({
          system: worldSystemPrompt,
          user: `세계 이름: ${worldName}\n\n추가 요청사항: ${userInput || '(없음)'}`
        });

        if (!worldJson) throw new Error('AI가 유효한 JSON을 생성하지 못했습니다.');

        // AI가 생성한 JSON에 사용자가 입력한 이름이 빠졌을 경우를 대비해 덮어쓰기
        worldJson.name = worldName;

        const res = await api.saveWorld(worldJson);
        alert(`세계관이 성공적으로 생성되었습니다! (ID: ${res.data.id})`);
        
        ui.navTo('home');
        // 홈 탭의 데이터를 새로고침하기 위해 loaded 속성 제거
        document.querySelector('[data-view="home"]')?.removeAttribute('data-loaded');
      });
    } catch(e) {
      alert(`생성 실패: ${e.message}`);
    }
  };
}
