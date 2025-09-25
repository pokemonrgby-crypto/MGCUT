// functions/routes/user.mjs
import { getUserFromReq } from '../lib/auth.mjs';
import { setApiKeySecret } from '../lib/secret-manager.mjs';

export function mountUser(app) {
  // API 키를 Secret Manager에 저장
  app.post('/api/user/api-key', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

      const { apiKey } = req.body;
      if (typeof apiKey !== 'string' || !apiKey.startsWith('AIza') || apiKey.length < 30) {
        return res.status(400).json({ ok: false, error: 'INVALID_API_KEY' });
      }

      await setApiKeySecret(user.uid, apiKey);
      res.json({ ok: true });
    } catch (e) {
      console.error('Error saving API key to Secret Manager:', e);
      let errorMessage = 'SECRET_STORAGE_FAILED';
      if (String(e.message).includes('PermissionDenied')) {
        errorMessage = 'SECRET_PERMISSION_DENIED: Functions 서비스 계정에 Secret Manager 권한이 필요합니다.';
      }
      res.status(500).json({ ok: false, error: errorMessage });
    }
  });
}
