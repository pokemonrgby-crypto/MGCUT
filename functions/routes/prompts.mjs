// functions/routes/prompts.mjs
import { db, FieldValue } from '../lib/firebase.mjs';
import { getUserFromReq } from '../lib/auth.mjs';
// [제거] 서버 사이드 AI 호출 관련 import 제거
// import { pickModels, callGemini } from '../lib/gemini.mjs';
// import { loadCharacterBasePrompt } from '../lib/prompts.mjs';
// import { validateCharacter } from '../lib/schemas.mjs';
import { loadWorldSystemPrompt, loadCharacterBasePrompt } from '../lib/prompts.mjs';


// [제거] getGeminiKeyFromHeaders 함수 제거

export function mountPrompts(app){

  app.get('/api/system-prompts/:name', async (req, res) => {
    try {
      let promptText = '';
      if (req.params.name === 'world-system') {
        promptText = await loadWorldSystemPrompt();
      } else if (req.params.name === 'character-base') {
        promptText = await loadCharacterBasePrompt();
      } else {
        return res.status(404).json({ ok: false, error: 'PROMPT_NOT_FOUND' });
      }
      res.json({ ok: true, data: { content: promptText } });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  // [GET] 공개 목록
  app.get('/api/prompts', async (req,res)=>{
    try{
      const qs = await db.collection('prompts')
        .where('status','==','public')
        .orderBy('createdAt','desc').limit(50).get();
      const items = qs.docs.map(d=>({ id:d.id, ...d.data() }));
      res.json({ ok:true, data:items });
    }catch(e){ res.status(400).json({ ok:false, error:e.message||'ERR_PROMPTS_LIST' }); }
  });

  // [POST] 업로드
  app.post('/api/prompts', async (req,res)=>{
    try{
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok:false, error:'UNAUTHENTICATED' });

      const { title, content } = req.body || {};
      if (!title || !content) return res.status(400).json({ ok:false, error:'REQUIRED' });

      const ref = await db.collection('prompts').add({
        title: String(title).slice(0,80),
        content: String(content),
        ownerUid: user.uid,
        createdAt: FieldValue.serverTimestamp(),
        status:'public', usageCount:0, lastValidatedAt:null, schemaVersion:1,
      });
      res.json({ ok:true, data:{ id: ref.id } });
    }catch(e){ res.status(400).json({ ok:false, error:e.message||'ERR_PROMPT_UPLOAD' }); }
  });

  // [수정] 검증 API에서 AI 호출 로직 제거
  app.post('/api/prompts/:id/validate', async (req,res)=>{
    try{
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok:false, error:'UNAUTHENTICATED' });

      const ref = db.collection('prompts').doc(req.params.id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ ok:false, error:'NOT_FOUND' });
      const data = snap.data();
      if (data.ownerUid !== user.uid) return res.status(403).json({ ok:false, error:'FORBIDDEN' });

      // AI 호출 로직을 모두 제거하고, 단순히 검증 시간만 업데이트.
      // 실제 검증은 향후 클라이언트 사이드에서 구현해야 함.
      await ref.update({ lastValidatedAt: FieldValue.serverTimestamp() });
      res.json({ ok:true, data: { message: "Validation timestamp updated." } });
    }catch(e){ res.status(400).json({ ok:false, error:e.message||'ERR_PROMPT_VALIDATE' }); }
  });

  // [POST] 신고
  app.post('/api/prompts/:id/report', async (req,res)=>{
    try{
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok:false, error:'UNAUTHENTICATED' });
      const reason = String(req.body?.reason||'').trim();
      if (reason.length < 3) return res.status(400).json({ ok:false, error:'REASON_REQUIRED' });

      const pref = db.collection('prompts').doc(req.params.id);
      const psnap = await pref.get();
      if (!psnap.exists) return res.status(404).json({ ok:false, error:'NOT_FOUND' });

      await pref.collection('reports').add({
        reporterUid: user.uid, reason: reason.slice(0,500), createdAt: FieldValue.serverTimestamp()
      });
      res.json({ ok:true });
    }catch(e){ res.status(400).json({ ok:false, error:e.message||'ERR_PROMPT_REPORT' }); }
  });
}
