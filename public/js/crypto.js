// public/js/crypto.js (새 파일)

const SALT = 'your-unique-salt-for-mgc-next'; // <-- 이 부분은 다른 임의의 문자열로 변경해주세요.

/**
 * 비밀번호를 사용하여 텍스트를 암호화합니다.
 * @param {string} text - 암호화할 원본 텍스트 (API 키)
 * @param {string} password - 암호화에 사용할 비밀번호
 * @returns {string} 암호화된 텍스트
 */
export function encryptWithPassword(text, password) {
  if (!text || !password) throw new Error('암호화할 대상과 비밀번호가 필요합니다.');
  return CryptoJS.AES.encrypt(text, password + SALT).toString();
}

/**
 * 비밀번호를 사용하여 암호문을 복호화합니다.
 * @param {string} ciphertext - 복호화할 암호문
 * @param {string} password - 복호화에 사용할 비밀번호
 * @returns {string} 복호화된 원본 텍스트. 실패 시 빈 문자열 반환.
 */
export function decryptWithPassword(ciphertext, password) {
  if (!ciphertext || !password) return '';
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, password + SALT);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (e) {
    console.error('복호화 실패:', e);
    return ''; // 비밀번호가 틀리면 여기서 에러가 발생하며 빈 문자열 반환
  }
}
