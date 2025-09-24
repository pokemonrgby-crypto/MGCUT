// (수정된 결과)
import { api, auth } from '../api.js';
import { encryptWithPassword } from '../crypto.js';
import { withBlocker } from '../ui/frame.js';
import { sessionKeyManager } from '../session-key-manager.js';

export function mount(){
  const uid = auth.currentUser?.uid || '(로그인 필요)';
  const view = document.querySelector('[data-view="info"]');
  if (!view) return;

  view.querySelector('.kv-uid .v').textContent = uid;

  view.querySelector('#btn-save-key').onclick = async () => {
    const key = view.querySelector('#gemini-key').value.trim();
    const pass1 = view.querySelector('#gemini-key-password').value;
    const pass2 = view.querySelector('#gemini-key-password-confirm').value;

    if (!key) return alert('Gemini API 키를 입력해주세요.');
    if (!pass1) return alert('암호화에 사용할 비밀번호를 입력해주세요.');
    if (pass1 !== pass2) return alert('비밀번호가 일치하지 않습니다.');

    try {
      await withBlocker(async () => {
        const encryptedKey = encryptWithPassword(key, pass1);
        await api.saveEncryptedKey(encryptedKey);
        
        // 저장 성공 후 입력 필드 초기화
        view.querySelector('#gemini-key').value = '';
        view.querySelector('#gemini-key-password').value = '';
        view.querySelector('#gemini-key-password-confirm').value = '';
        
        alert('API 키가 안전하게 암호화되어 서버에 저장되었습니다.');
      });
    } catch (e) {
      alert(`저장 실패: ${e.message}`);
    }
  };

  view.querySelector('#btn-logout').onclick = () => {
    sessionKeyManager.clearKey(); // 로그아웃 시 캐시된 키 삭제
    auth.signOut?.();
  };
}
