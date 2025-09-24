// public/js/session-key-manager.js (새 파일)
import { api } from './api.js';
import { decryptWithPassword } from './crypto.js';
import { ui } from './ui/frame.js';

let decryptedKeyCache = null;

/**
 * 사용자에게 비밀번호를 물어보는 모달 UI를 표시합니다.
 * @returns {Promise<string>} 사용자가 입력한 비밀번호
 */
function promptForPassword() {
  return new Promise((resolve, reject) => {
    const modal = document.createElement('div');
    modal.className = 'modal-layer';
    modal.innerHTML = `
      <div class="modal-card" style="text-align:center;">
        <div class="modal-body">
          <h3>API 키 잠금 해제</h3>
          <p class="small" style="margin-bottom:12px;">저장된 API 키를 사용하려면 암호화에 사용한 비밀번호를 입력해주세요. 이 비밀번호는 로그인할 때마다 한 번만 물어봅니다.</p>
          <input type="password" id="modal-password-input" placeholder="API 키 암호화 비밀번호" style="text-align:center;">
          <div style="display:flex; gap:8px; margin-top:16px;">
            <button class="btn secondary full" id="btn-modal-cancel">취소</button>
            <button class="btn full" id="btn-modal-confirm">확인</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const input = modal.querySelector('#modal-password-input');
    const confirmBtn = modal.querySelector('#btn-modal-confirm');
    const cancelBtn = modal.querySelector('#btn-modal-cancel');

    const closeModal = () => modal.remove();
    
    const onConfirm = () => {
      closeModal();
      resolve(input.value);
    };

    const onCancel = () => {
      closeModal();
      reject(new Error('사용자가 비밀번호 입력을 취소했습니다.'));
    };

    confirmBtn.onclick = onConfirm;
    input.onkeydown = (e) => { if (e.key === 'Enter') onConfirm(); };
    cancelBtn.onclick = onCancel;
    modal.onclick = (e) => { if (e.target === modal) onCancel(); };
    
    input.focus();
  });
}

export const sessionKeyManager = {
  /**
   * 복호화된 Gemini API 키를 가져옵니다.
   * 캐시된 키가 없으면 서버에서 암호화된 키를 가져와 사용자에게 비밀번호를 물어본 후 복호화합니다.
   * @returns {Promise<string>} 복호화된 API 키
   */
  async getDecryptedKey() {
    if (decryptedKeyCache) {
      return decryptedKeyCache;
    }

    ui.busy(true);
    try {
      const res = await api.getEncryptedKey();
      const encryptedKey = res.data?.encryptedKey;
      if (!encryptedKey) {
        throw new Error('서버에 암호화된 API 키가 저장되어 있지 않습니다. [내 정보] 탭에서 먼저 키를 저장해주세요.');
      }
      ui.busy(false);

      const password = await promptForPassword();
      const decryptedKey = decryptWithPassword(encryptedKey, password);

      if (!decryptedKey) {
        throw new Error('비밀번호가 올바르지 않거나 키가 손상되었습니다.');
      }

      decryptedKeyCache = decryptedKey; // 세션 동안 캐싱
      return decryptedKey;
    } catch (e) {
      ui.busy(false);
      throw e; // 에러를 상위로 전파
    }
  },

  /**
   * 캐시된 API 키를 지웁니다. (로그아웃 시 호출)
   */
  clearKey() {
    decryptedKeyCache = null;
  }
};
