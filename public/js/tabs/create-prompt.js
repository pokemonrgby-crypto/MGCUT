import { api } from '../api.js';
import { withBlocker, ui } from '../ui/frame.js';

const rootSel = '[data-view="create-prompt"]';

export function mount() {
  const root = document.querySelector(rootSel);
  if (!root || root.dataset.mounted === '1') return;
  root.dataset.mounted = '1';

  root.querySelector('#btn-prompt-upload').onclick = async () => {
    const title = root.querySelector('#p-title').value.trim();
    const content = root.querySelector('#p-content').value.trim();

    if (!title || !content) return alert('제목과 내용을 모두 입력해야 합니다.');

    try {
      const res = await withBlocker(() => api.uploadPrompt({ title, content }));
      alert(`프롬프트가 성공적으로 업로드되었습니다! (ID: ${res.data.id})`);
      ui.navTo('home'); // 성공 후 홈으로 이동
    } catch (e) {
      alert(`업로드 실패: ${e.message}`);
    }
  };
}
