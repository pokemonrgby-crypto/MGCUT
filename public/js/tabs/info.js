// public/js/tabs/info.js
import { api, auth } from '../api.js';
import { withBlocker } from '../ui/frame.js';

export function mount(){
  const uid = auth.currentUser?.uid || '(로그인 필요)';
  const view = document.querySelector('[data-view="info"]');
  if (!view) return;

  view.querySelector('.kv-uid .v').textContent = uid;

  view.querySelector('#btn-save-key').onclick = async () => {
    const key = view.querySelector('#gemini-key').value.trim();

    if (!key) return alert('Gemini API 키를 입력해주세요.');
    if (!key.startsWith('AIza') || key.length < 30) {
        return alert('올바른 형식의 Gemini API 키를 입력해주세요.');
    }

    try {
      await withBlocker(async () => {
        await api.saveApiKey(key); // 새 API 호출
        
        view.querySelector('#gemini-key').value = '';
        
        alert('API 키가 안전하게 저장되었습니다.');
      });
    } catch (e) {
      alert(`저장 실패: ${e.message}`);
    }
  };

  view.querySelector('#btn-logout').onclick = () => {
    auth.signOut?.();
  };
}
