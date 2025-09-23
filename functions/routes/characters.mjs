// functions/routes/characters.mjs
import { db, FieldValue } from '../lib/firebase.mjs';
import { getUserFromReq } from '../lib/auth.mjs';
import { pickModels, callGemini } from '../lib/gemini.mjs';
import { loadCharacterBasePrompt } from '../lib/prompts.mjs';
import { validateCharacter } from '../lib/schemas.mjs';

function getGeminiKeyFromHeaders(req,fallback){
  return req.headers['x-gemini-key'] ? String(req.headers['x-gemini-key']) : fallback;
}

// [수정된 부분] AI에게 더 풍부한 세계관 정보를 전달하도록 수정
function buildWorldText(w){
  const sites=(w?.sites||[]).map(s=>`- ${s.name}: ${s.description}`).join('\n');
  const orgs=(w?.factions||[]).map(o=>`- ${o.name}: ${o.description}`).join('\n');
  const npcs=(w?.npcs||[]).map(n=>`- ${n.name}: ${n.description}`).join('\n');
  // 최신 에피소드 1개의 내용만 간략히 전달
  const latestEpisode = (w?.episodes||[]).slice(-1).map(e=>`* ${e.title}: ${e.content.replace(/<[^>]+>/g, "").substring(0,200)}...`).join('\n');

  return [
    `세계 이름: ${w?.name||''}`,
    `세계관 한 줄 소개: ${w?.introShort||''}`,
    `주요 명소:\n${sites}`,
    `주요 세력/조직:\n${orgs}`,
    `주요 NPC:\n${npcs}`,
    `최근 발생한 사건:\n${latestEpisode}`
  ].join('\n\n');
}

export function mountCharacters(app){

  app.get('/api/my-characters', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

      const qs = await db.collection('characters')
        .where('ownerUid', '==', user.uid)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();
      
      const items = qs.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json({ ok: true, data: items });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  
  app.post('/api/characters/create', async (req,res)=>{
    try{
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok:false, error:'UNAUTHENTICATED' });

      // [수정된 부분] customPrompt 제거, userInput만 사용
      const { worldId, promptId, userInput } = req.body || {};
      if (!worldId) return res.status(400).json({ ok:false, error:'REQUIRED_WORLD' });
      if (!promptId) return res.status(400).json({ ok:false, error:'REQUIRED_PROMPT' });
      if (String(userInput||'').length > 1000)
        return res.status(400).json({ ok:false, error:'USER_INPUT_TOO_LONG' });

      const wref = db.collection('worlds').doc(worldId);
      const wsnap = await wref.get();
      if (!wsnap.exists) return res.status(404).json({ ok:false, error:'WORLD_NOT_FOUND' });
      const wdata = wsnap.data();

      let promptText = '';
      const psnap = await db.collection('prompts').doc(promptId).get();
      if (!psnap.exists) return res.status(404).json({ ok:false, error:'PROMPT_NOT_FOUND' });
      const pdata = psnap.data();
      // [수정된 부분] 검증된 프롬프트만 사용하도록 서버에서도 확인 (선택사항이지만 권장)
      if (!pdata.lastValidatedAt) return res.status(403).json({ok:false, error: 'PROMPT_NOT_VALIDATED'});
      if (pdata.status !== 'public' && pdata.ownerUid !== user.uid)
        return res.status(403).json({ ok:false, error:'PROMPT_FORBIDDEN' });
      promptText = String(pdata.content);
      psnap.ref.update({ usageCount: FieldValue.increment(1) }).catch(()=>{});

      const basePrompt = await loadCharacterBasePrompt();
      const worldText = buildWorldText(wdata); // 수정된 함수 사용
      const composedUser = [
        `### 세계관 정보`,
        worldText,
        `### 생성 프롬프트`,
        promptText,
        `### 사용자 요청`,
        `${String(userInput||'').trim()}`,
        `\n\n위 정보를 바탕으로 JSON 스키마에 맞춰 캐릭터를 생성해줘.`,
      ].join('\n\n');

      const { primary } = pickModels();
      const apiKey = getGeminiKeyFromHeaders(req, process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
      if (!apiKey) return res.status(500).json({ ok:false, error:'NO_GEMINI_KEY' });

      const out = await callGemini({ key: apiKey, model: primary, system: basePrompt, user: composedUser });
      const ch = out.json;
      const v = validateCharacter(ch);
      if (!v.ok) return res.status(400).json({ ok:false, error:'SCHEMA_FAIL', details:v.errors });

      const doc = await db.collection('characters').add({
        worldId, worldName: wdata.name || '', ...ch,
        ownerUid: user.uid, createdAt: FieldValue.serverTimestamp(), promptRef: promptId || null,
      });
      res.json({ ok:true, data:{ id: doc.id } });
    }catch(e){ res.status(400).json({ ok:false, error:e.message||'ERR_CHAR_CREATE' }); }
  });
}
