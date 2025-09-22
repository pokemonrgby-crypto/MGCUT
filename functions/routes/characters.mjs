// functions/routes/characters.mjs
import { db, FieldValue } from '../lib/firebase.mjs';
import { getUserFromReq } from '../lib/auth.mjs';
import { pickModels, callGemini } from '../lib/gemini.mjs';
import { loadCharacterBasePrompt } from '../lib/prompts.mjs';
import { validateCharacter } from '../lib/schemas.mjs';

function getGeminiKeyFromHeaders(req,fallback){
  return req.headers['x-gemini-key'] ? String(req.headers['x-gemini-key']) : fallback;
}
function buildWorldText(w){
  const sites=(w?.detail?.sites||[]).map(s=>`- ${s.name}: ${s.description}`).join('\n');
  const orgs=(w?.detail?.orgs||[]).map(o=>`- ${o.name}: ${o.description}`).join('\n');
  const npcs=(w?.detail?.npcs||[]).map(n=>`- ${n.name}: ${n.role}`).join('\n');
  return [
    `세계: ${w?.name||''}`, `소개: ${w?.intro||''}`, `배경: ${w?.detail?.lore||''}`,
    `명소:\n${sites}`, `조직:\n${orgs}`, `NPC:\n${npcs}`,
  ].join('\n\n');
}

export function mountCharacters(app){
  app.post('/api/characters/create', async (req,res)=>{
    try{
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok:false, error:'UNAUTHENTICATED' });

      const { worldId, promptId, customPrompt, userInput } = req.body || {};
      if (!worldId) return res.status(400).json({ ok:false, error:'REQUIRED_WORLD' });
      if (!((promptId && !customPrompt) || (!promptId && customPrompt)))
        return res.status(400).json({ ok:false, error:'PROMPT_CHOOSE_ONE' });
      if (String(userInput||'').length > 1000)
        return res.status(400).json({ ok:false, error:'USER_INPUT_TOO_LONG' });

      const wref = db.collection('worlds').doc(worldId);
      const wsnap = await wref.get();
      if (!wsnap.exists) return res.status(404).json({ ok:false, error:'WORLD_NOT_FOUND' });
      const wdata = wsnap.data();

      let promptText = '';
      if (promptId){
        const psnap = await db.collection('prompts').doc(promptId).get();
        if (!psnap.exists) return res.status(404).json({ ok:false, error:'PROMPT_NOT_FOUND' });
        const pdata = psnap.data();
        if (pdata.status !== 'public' && pdata.ownerUid !== user.uid)
          return res.status(403).json({ ok:false, error:'PROMPT_FORBIDDEN' });
        promptText = String(pdata.content);
        psnap.ref.update({ usageCount: FieldValue.increment(1) }).catch(()=>{});
      }else{
        promptText = String(customPrompt);
      }

      const basePrompt = await loadCharacterBasePrompt();
      const worldText = wdata.worldText || buildWorldText(wdata);
      const composedUser = [
        `worldText:\n${worldText}`,
        `prompt:\n${promptText}`,
        `userInput:\n${String(userInput||'').trim()}`,
        `\n\n반드시 위 JSON 스키마로만 출력. 설명/코드펜스 금지.`,
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
