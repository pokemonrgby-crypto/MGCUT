// functions/routes/prompts.mjs
import { db, FieldValue } from '../lib/firebase.mjs';
import { getUserFromReq } from '../lib/auth.mjs';
import { pickModels, callGemini } from '../lib/gemini.mjs';
import { loadCharacterBasePrompt } from '../lib/prompts.mjs';
import { validateCharacter } from '../lib/schemas.mjs';

function getGeminiKeyFromHeaders(req,fallback){
  return req.headers['x-gemini-key'] ? String(req.headers['x-gemini-key']) : fallback;
}

export function mountPrompts(app){
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

  // [POST] 업로드 (하루 1개 제한은 클라가 아니라 서버 정책으로 하고 싶다면 user_meta에 비슷하게 추가 가능)
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

  // [POST] 검증(작성자 전용)
  app.post('/api/prompts/:id/validate', async (req,res)=>{
    try{
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok:false, error:'UNAUTHENTICATED' });

      const ref = db.collection('prompts').doc(req.params.id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ ok:false, error:'NOT_FOUND' });
      const data = snap.data();
      if (data.ownerUid !== user.uid) return res.status(403).json({ ok:false, error:'FORBIDDEN' });

      const basePrompt = await loadCharacterBasePrompt();
      const sampleWorldText = `세계: 샘플월드
소개: 샘플 소개
배경: 샘플 배경
명소: - 샘플명소
조직: - 샘플조직
NPC: - 샘플NPC`;
      const userInput = `worldText:\n${sampleWorldText}\n\nprompt:\n${data.content}\n\nuserInput:\n(검증용 샘플)`;

      const { primary } = pickModels();
      const apiKey = getGeminiKeyFromHeaders(req, process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
      const out = await callGemini({ key: apiKey, model: primary, system: basePrompt, user: userInput });
      const test = out.json;
      const v = validateCharacter(test);
      if (!v.ok) return res.status(400).json({ ok:false, error:'SCHEMA_FAIL', details:v.errors });

      await ref.update({ lastValidatedAt: FieldValue.serverTimestamp() });
      res.json({ ok:true, data:{ preview:test } });
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
