// (수정 후)
// functions/routes/prompts.mjs
import { db, FieldValue } from '../lib/firebase.mjs';
import { getUserFromReq } from '../lib/auth.mjs';
import { loadWorldSystemPrompt, loadCharacterBasePrompt } from '../lib/prompts.mjs';

export function mountPrompts(app) {
  // 시스템 프롬프트 가져오기 (기존 create-world.js에서 사용)
  app.get('/api/system-prompts/:name', async (req, res) => {
    try {
      const { name } = req.params;
      let content = '';
      if (name === 'world-system') {
        content = await loadWorldSystemPrompt();
      } else if (name === 'character-base') {
        content = await loadCharacterBasePrompt();
      } else {
        return res.status(404).json({ ok: false, error: 'PROMPT_NOT_FOUND' });
      }
      res.json({ ok: true, data: { name, content } });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  // 유저 프롬프트 목록
  app.get('/api/prompts', async (req, res) => {
    try {
      const qs = await db.collection('prompts').orderBy('createdAt', 'desc').limit(50).get();
      res.json({ ok: true, data: qs.docs.map(d => ({ id: d.id, ...d.data() })) });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  // 유저 프롬프트 업로드
  app.post('/api/prompts', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

      const { title, content } = req.body;
      if (!title || !content) return res.status(400).json({ ok: false, error: 'TITLE_AND_CONTENT_REQUIRED' });
      
      const now = FieldValue.serverTimestamp();
      const docRef = await db.collection('prompts').add({
        title,
        content,
        ownerUid: user.uid,
        validated: false,
        reportCount: 0,
        createdAt: now,
      });
      res.json({ ok: true, data: { id: docRef.id } });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  // (아래는 나중을 위한 기능들 - api.js에 정의되어 있음)
  app.post('/api/prompts/:id/validate', async (req, res) => {
    // TODO: 관리자만 실행 가능하도록 권한 체크 필요
    res.status(501).json({ ok: false, error: 'NOT_IMPLEMENTED' });
  });

  app.post('/api/prompts/:id/report', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      const ref = db.collection('prompts').doc(req.params.id);
      await ref.update({ reportCount: FieldValue.increment(1) });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });
}
