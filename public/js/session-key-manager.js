// public/js/session-key-manager.js
import { ui } from './ui/frame.js';

let sessionPasswordCache = null;

function promptForPassword() {
  return new Promise((resolve, reject) => {
    // 사용자가 이미 비밀번호 입력을 보고 있다면 중복 생성 방지
    if (document.querySelector('.modal-layer#password-prompt')) {
      return reject(new Error('Password prompt is already open.'));
    }

    const modal = document.createElement('div');
    modal.className = 'modal-layer';
    modal.id = 'password-prompt'; // 중복 확인을 위한 ID 추가
    modal.innerHTML = `
      <div class="modal-card" style="text-align:center;">
        <div class="modal-body">
          <h3>API 키 잠금 해제</h3>
          <p class="small" style="margin-bottom:12px;">AI 기능을 사용하려면 암호화에 사용한 비밀번호를 입력해주세요. 이 비밀번호는 로그인할 때마다 한 번만 물어봅니다.</p>
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
      const pass = input.value;
      if (!pass) {
          alert('비밀번호를 입력해주세요.');
          return;
      }
      closeModal();
      resolve(pass);
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
   * 세션용 비밀번호를 가져옵니다.
   * 캐시된 비밀번호가 없으면 사용자에게 입력을 요청합니다.
   * @returns {Promise<string>} 사용자가 입력한 비밀번호
   */
  async getPassword() {
    if (sessionPasswordCache) {
      return sessionPasswordCache;
    }
    
    // ui.busy는 외부에서 처리하도록 변경 (중복 blocker 방지)
    const password = await promptForPassword();
    sessionPasswordCache = password; // 세션 동안 캐싱
    return password;
  },

  /**
   * 캐시된 비밀번호를 지웁니다. (로그아웃 시 호출)
   */
  clearKey() {
    sessionPasswordCache = null;
  }
};
