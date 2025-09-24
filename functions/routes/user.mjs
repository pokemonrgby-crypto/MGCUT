// functions/routes/user.mjs
import { db } from '../lib/firebase.mjs';
import { getUserFromReq } from '../lib/auth.mjs';

export function mountUser(app) {
  const userRef = (uid) => db.collection('users').doc(uid);

  // 암호화된 API 키 저장
  app.post('/api/user/encrypted-key', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

      const { encryptedKey } = req.body;
      if (typeof encryptedKey !== 'string' || encryptedKey.length < 10) {
        return res.status(400).json({ ok: false, error: 'INVALID_ENCRYPTED_KEY' });
      }

      await userRef(user.uid).set({ encryptedKey }, { merge: true });
      res.json({ ok: true });
    } catch (e) {
      console.error('Error saving encrypted key:', e);
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  // 암호화된 API 키 조회
  app.get('/api/user/encrypted-key', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

      const doc = await userRef(user.uid).get();
      const encryptedKey = doc.exists ? doc.data().encryptedKey : null;

      res.json({ ok: true, data: { encryptedKey } });
    } catch (e) {
      console.error('Error fetching encrypted key:', e);
      res.status(500).json({ ok: false, error: String(e) });
    }
  });
}
