import { api } from '../api.js';
import { withBlocker, ui } from '../ui/frame.js';

const rootSel = '[data-view="create-character"]';

export function mount() {
  const root = document.querySelector(rootSel);
  if (!root || root.dataset.mounted === '1') return;
  root.dataset.mounted = '1';

  root.querySelector('#btn-char-create').onclick = async () => {
    const worldId = root.querySelector('#char-world').value.trim();
    const promptId = root.querySelector('#char-prompt').value.trim() || null;
    const customPrompt = root.querySelector('#char-custom').value.trim() || null;
    const userInput = root.querySelector('#char-input').value.trim();

    if (!worldId) return alert('캐릭터를 생성할 World ID를 입력해야 합니다.');
    if ((!promptId && !customPrompt) || (promptId && customPrompt)) {
      return alert('프롬프트 ID 또는 직접 프롬프트 중 하나만 입력해야 합니다.');
    }

    try {
      const res = await withBlocker(() => api.createCharacter({ worldId, promptId, customPrompt, userInput }));
      alert(`캐릭터가 성공적으로 생성되었습니다! (ID: ${res.data.id})`);
      ui.navTo('home'); // 성공 후 홈으로 이동
    } catch (e) {
      alert(`생성 실패: ${e.message}`);
    }
  };
}
