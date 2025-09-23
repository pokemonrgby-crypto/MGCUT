// public/js/lib/storage.js
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-storage.js';

const storage = getStorage();

/**
 * 파일을 Firebase Storage에 업로드하고 공개 URL을 반환합니다.
 * @param {File} file - 업로드할 파일 객체
 * @param {string} path - Storage에 저장될 경로 (예: 'world-covers')
 * @returns {Promise<string>} 업로드된 파일의 공개 URL
 */
export async function uploadImageAndGetUrl(file, path) {
  if (!file) throw new Error('업로드할 파일이 없습니다.');
  if (!path) throw new Error('저장 경로가 지정되지 않았습니다.');

  const fileRef = ref(storage, `${path}/${Date.now()}-${file.name}`);
  
  try {
    const snapshot = await uploadBytes(fileRef, file);
    const downloadUrl = await getDownloadURL(snapshot.ref);
    return downloadUrl;
  } catch (e) {
    console.error("이미지 업로드 실패:", e);
    throw new Error(`이미지 업로드 실패: ${e.message}`);
  }
}
