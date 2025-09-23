// public/js/tabs/create-site.js
import { api } from '../api.js';
import { withBlocker, ui } from '../ui/frame.js';

const rootSel = '[data-view="create-site"]';

export function mount() {
  const root = document.querySelector(rootSel);
  if (!root || root.dataset.mounted === '1') return;
  root.dataset.mounted = '1';

  root.querySelector('#btn-site-create').onclick = async () => {
    const worldId = root.querySelector('#site-world-id').value.trim();
    const name = root.querySelector('#site-name').value.trim();
    const description = root.querySelector('#site-description').value.trim();
    const difficulty = root.querySelector('#site-difficulty').value;
    const imageFile = root.querySelector('#site-image').files[0];

    if (!worldId || !name || !description) {
      return alert('세계관 ID, 명소 이름, 설명을 모두 입력해야 합니다.');
    }
    
    // TODO: 실제 이미지 업로드 로직 구현 필요 (e.g., Firebase Storage)
    let imageUrl = '';
    if (imageFile) {
      console.log('이미지 파일 선택됨:', imageFile.name);
      alert('이미지 업로드 기능은 아직 개발 중입니다. 현재는 이미지 URL 없이 생성됩니다.');
    }
    
    try {
      await withBlocker(() => api.createSite(worldId, {
        name,
        description,
        difficulty,
        imageUrl,
      }));
      alert(`명소 '${name}'가 성공적으로 생성되었습니다!`);
      // 성공 후 홈으로 이동 또는 월드 상세로 이동할 수 있음
      window.location.hash = '#home'; 
    } catch (e) {
      alert(`생성 실패: ${e.message}`);
    }
  };
}
