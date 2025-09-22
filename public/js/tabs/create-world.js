// public/js/tabs/create-world.js
import { api } from '../api.js';
import { withBlocker, ui } from '../ui/frame.js';
import { callClientSideGemini } from '../lib/gemini-client.js'; // Gemini 호출 로직 분리

const rootSel = '[data-view="create-world"]';

export function mount() {
  const root = document.querySelector(rootSel);
  if (!root || root.dataset.mounted === '1') return;
  root.dataset.mounted = '1';

  root.querySelector('#btn-world-generate-ai').onclick = async () => {
    const worldName = root.querySelector('#world-create-name').value.trim();
    const userInput = root.querySelector('#world-create-input').value.trim();
    if (!worldName) return alert('세계관 이름을 입력해주세요.');

    try {
      await withBlocker(async () => {
        // 1. AI 호출로 세계관 데이터 생성
        const worldJson = await callClientSideGemini({
          // 임시로 하드코딩. 실제로는 서버에서 시스템 프롬프트를 가져와야 함
          system: `... (loadWorldSystemPrompt의 내용) ...`, 
          user: `세계 이름: ${worldName}\n\n추가 요청사항: ${userInput || '(없음)'}`
        });

        if (!worldJson) throw new Error('AI가 유효한 JSON을 생성하지 못했습니다.');

        // 2. 생성된 데이터를 서버에 저장
        const res = await api.saveWorld(worldJson);
        alert(`세계관이 성공적으로 생성되었습니다! (ID: ${res.data.id})`);
        
        // 3. 성공 후 홈으로 이동
        ui.navTo('home');
      });
    } catch(e) {
      alert(`생성 실패: ${e.message}`);
    }
  };
}
