// functions/routes/user.mjs
import { getUserFromReq } from '../lib/auth.mjs';
import { setApiKeySecret } from '../lib/secret-manager.mjs'; // 새로 만든 헬퍼 import

export function mountUser(app) {
  // API 키를 Secret Manager에 저장
  app.post('/api/user/api-key', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

      const { apiKey } = req.body;
      // 기본적인 키 형식 검사 (더 정교하게 할 수도 있음)
      if (typeof apiKey !== 'string' || !apiKey.startsWith('AIza') || apiKey.length < 30) {
        return res.status(400).json({ ok: false, error: 'INVALID_API_KEY' });
      }

      await setApiKeySecret(user.uid, apiKey);
      res.json({ ok: true });
    } catch (e) {
      console.error('Error saving API key to Secret Manager:', e);
      res.status(500).json({ ok: false, error: 'SECRET_STORAGE_FAILED' });
    }
  });

  // '/api/user/encrypted-key' GET 엔드포인트는 더 이상 필요 없으므로 삭제합니다.
}
