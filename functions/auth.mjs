// functions/auth.mjs
import admin from 'firebase-admin';

try { admin.app(); } catch { admin.initializeApp(); }

/**
 * Authorization: Bearer <ID_TOKEN> 헤더에서 사용자 추출
 * 성공 시 { uid, email } 반환, 실패/없으면 null
 */
export async function getUserFromReq(req) {
  const h = req.get('Authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;

  try {
    const decoded = await admin.auth().verifyIdToken(m[1], true);
    return { uid: decoded.uid, email: decoded.email ?? null };
  } catch (e) {
    // 토큰 만료/위조/로그아웃 등은 null로 처리
    return null;
  }
}
