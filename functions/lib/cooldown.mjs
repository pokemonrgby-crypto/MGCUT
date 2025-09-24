// functions/lib/cooldown.mjs
import { FieldValue } from 'firebase-admin/firestore';

/**
 * 사용자의 특정 행동에 대한 쿨타임을 확인하고 업데이트합니다.
 * @param {object} db - Firestore instance
 * @param {string} uid - User ID
 * @param {string} action - 행동 이름 (e.g., 'generateCharacter')
 * @param {number} durationSeconds - 쿨타임 (초)
 */
export async function checkAndUpdateCooldown(db, uid, action, durationSeconds) {
  const now = new Date();
  const ref = db.collection('users').doc(uid).collection('cooldowns').doc(action);
  const snap = await ref.get();

  if (snap.exists) {
    const lastUsed = snap.data().timestamp.toDate();
    const elapsed = (now.getTime() - lastUsed.getTime()) / 1000;
    if (elapsed < durationSeconds) {
      const remaining = Math.ceil(durationSeconds - elapsed);
      throw new Error(`COOLDOWN_ACTIVE: ${remaining}초 후에 다시 시도하세요.`);
    }
  }

  // 쿨타임이 지났거나 첫 사용 시, 현재 시간으로 타임스탬프 업데이트
  await ref.set({ timestamp: FieldValue.serverTimestamp() });
}
