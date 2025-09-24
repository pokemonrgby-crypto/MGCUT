import CryptoJS from 'crypto-js';

const SALT = 'your-unique-salt-for-mgc-next-project'; // 클라이언트와 동일한 Salt 값

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
    const decryptedText = bytes.toString(CryptoJS.enc.Utf8);
    if (!decryptedText) {
        throw new Error('Decryption resulted in empty string. Likely wrong password.');
    }
    return decryptedText;
  } catch (e) {
    console.error('Decryption failed:', e);
    return '';
  }
}
