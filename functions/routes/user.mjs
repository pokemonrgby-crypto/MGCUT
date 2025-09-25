// functions/routes/user.mjs
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { getUserFromReq } from '../auth.mjs'; // Bearer 토큰 파서 (auth.verifyIdToken)  :contentReference[oaicite:4]{index=4}

const sm = new SecretManagerServiceClient();

export function mountUser(app){
  // 헬스체크용 (선택)
  app.get('/api/user/ping', (req, res) => res.json({ ok: true }));

  // === API 키 저장 ===
  app.post('/api/user/api-key', async (req, res) => {
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

    const apiKey = String(req.body?.apiKey || '').trim();
    if (!apiKey || !apiKey.startsWith('AIza') || apiKey.length < 30) {
      return res.status(400).json({ ok: false, error: 'INVALID_API_KEY' });
    }

    // Secret 이름을 uid별로 분리 (프로젝트/리전은 SDK가 프로젝트를 자동 인식)
    const secretId = `user_gemini_key_${user.uid}`;

    try {
      // 1) 시크릿 존재 확인, 없으면 생성
      const [projectId] = await sm.getProjectId();
      const parent = `projects/${projectId}`;
      const name = `${parent}/secrets/${secretId}`;

      try {
        await sm.getSecret({ name }); // 있나 확인
      } catch (e) {
        if (String(e.message || '').includes('NotFound')) {
          await sm.createSecret({
            parent,
            secretId,
            secret: { replication: { automatic: {} } },
          });
        } else {
          console.error('[api-key] getSecret error:', e);
          return res.status(500).json({ ok: false, error: 'SECRET_STORAGE_FAILED' });
        }
      }

      // 2) 버전 추가 (실제 저장)
      await sm.addSecretVersion({
        parent: name,
        payload: { data: Buffer.from(apiKey, 'utf8') },
      });

      // 성공
      return res.json({ ok: true });
    } catch (err) {
      console.error('[api-key] addSecretVersion error:', err && err.message, err && err.code);
      // 권한 부족이면 메시지 힌트
      if (String(err.message || '').includes('Permission') || String(err.code || '') === '7') {
        return res.status(500).json({ ok: false, error: 'SECRET_PERMISSION_DENIED' });
      }
      return res.status(500).json({ ok: false, error: 'SECRET_STORAGE_FAILED' });
    }
  });
}
