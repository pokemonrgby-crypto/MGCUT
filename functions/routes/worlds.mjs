// functions/routes/worlds.mjs
import { db, FieldValue } from '../lib/firebase.mjs';
import { getUserFromReq } from '../lib/auth.mjs';
import { callGemini, pickModels } from '../lib/gemini.mjs';
import { loadWorldSystemPrompt } from '../lib/prompts.mjs';
import { decryptWithPassword } from '../lib/crypto.mjs';
import { checkAndUpdateCooldown } from '../lib/cooldown.mjs';

// 헬퍼 함수: UID와 비밀번호로 암호화된 API 키를 가져와 복호화합니다.
async function getDecryptedKey(uid, password) {
    if (!password) throw new Error('PASSWORD_REQUIRED');
    const userDoc = await db.collection('users').doc(uid).get();
    const encryptedKey = userDoc.exists ? userDoc.data().encryptedKey : null;
    if (!encryptedKey) throw new Error('ENCRYPTED_KEY_NOT_FOUND: 내 정보 탭에서 API 키를 먼저 저장해주세요.');
    
    const decryptedKey = decryptWithPassword(encryptedKey, password);
    if (!decryptedKey) throw new Error('DECRYPTION_FAILED: 비밀번호가 올바르지 않거나 키가 손상되었습니다.');
    return decryptedKey;
}

export function mountWorlds(app) {

  app.get('/api/worlds', async (req, res) => {
    try {
      const qs = await db.collection('worlds').orderBy('createdAt', 'desc').limit(50).get();
      res.json({ ok: true, data: qs.docs.map(d => ({ id: d.id, ...d.data() })) });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.post('/api/worlds', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      const w = req.body || {};
      if (!w.name || !String(w.name).trim()) return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });
      const now = FieldValue.serverTimestamp();
      const docRef = await db.collection('worlds').add({
        name: w.name, introShort: w.introShort || '', introLong: w.introLong || '', coverUrl: w.coverUrl || '',
        factions: Array.isArray(w.factions) ? w.factions : [], npcs: Array.isArray(w.npcs) ? w.npcs : [],
        sites: Array.isArray(w.sites) ? w.sites : [], episodes: Array.isArray(w.episodes) ? w.episodes : [],
        allowPublicContribution: !!w.allowPublicContribution, likesCount: 0, ownerUid: user.uid, createdAt: now, updatedAt: now,
      });
      res.json({ ok: true, data: { id: docRef.id } });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.post('/api/worlds/generate', async (req, res) => {
    try {
        const user = await getUserFromReq(req);
        if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

        await checkAndUpdateCooldown(db, user.uid, 'generateWorld', 600); // 10분 쿨다운 추가

        const { name, userInput, password } = req.body;
        if (!name) return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });

        const geminiKey = await getDecryptedKey(user.uid, password);

        const systemPrompt = await loadWorldSystemPrompt();
        const userPrompt = `세계 이름: ${name}\n\n추가 요청사항: ${userInput || '(없음)'}`;
        
        const { primary } = pickModels();
        const { json: worldJson } = await callGemini({ key: geminiKey, model: primary, system: systemPrompt, user: userPrompt });

        if (!worldJson || !worldJson.name) throw new Error('AI_GENERATION_FAILED');
        worldJson.name = name; // 사용자 입력 이름으로 강제

        res.json({ ok: true, data: worldJson });
    } catch (e) {
        console.error('World generation failed:', e);
        if (e.message.startsWith('COOLDOWN_ACTIVE')) {
            return res.status(429).json({ ok: false, error: e.message });
        }
        res.status(500).json({ ok: false, error: String(e) });
    }
  });

  app.get('/api/worlds/:id', async (req, res) => {
    try {
      const snap = await db.collection('worlds').doc(req.params.id).get();
      if (!snap.exists) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      res.json({ ok: true, data: { id: snap.id, ...snap.data() } });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.patch('/api/worlds/:id/cover', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      const { coverUrl } = req.body || {};
      if (!coverUrl) return res.status(400).json({ ok: false, error: 'coverUrl required' });
      const ref = db.collection('worlds').doc(req.params.id);
      await ref.update({ coverUrl, updatedAt: FieldValue.serverTimestamp() });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.post('/api/worlds/:id/sites', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      const site = req.body || {};
      if (!site.name || !String(site.name).trim()) return res.status(400).json({ ok: false, error: 'SITE_NAME_REQUIRED' });
      const ref = db.collection('worlds').doc(req.params.id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ ok: false, error: 'WORLD_NOT_FOUND' });
      const list = Array.isArray(snap.data().sites) ? [...snap.data().sites] : [];
      const ix = list.findIndex(s => (s.name||'') === site.name);
      if (ix >= 0) list[ix] = { ...list[ix], ...site };
      else list.push(site);
      await ref.update({ sites: list, updatedAt: FieldValue.serverTimestamp() });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.patch('/api/worlds/:id/siteImage', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      const { siteName, imageUrl } = req.body || {};
      if (!siteName || !imageUrl) return res.status(400).json({ ok: false, error: 'siteName/imageUrl required' });
      const ref = db.collection('worlds').doc(req.params.id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ ok: false, error: 'WORLD_NOT_FOUND' });
      const list = Array.isArray(snap.data().sites) ? [...snap.data().sites] : [];
      const ix = list.findIndex(s => (s.name||'') === siteName);
      if (ix < 0) return res.status(404).json({ ok: false, error: 'SITE_NOT_FOUND' });
      list[ix] = { ...list[ix], imageUrl };
      await ref.update({ sites: list, updatedAt: FieldValue.serverTimestamp() });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.post('/api/worlds/:id/elements', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      const { type, data, password } = req.body || {};
      if (!['sites','npcs','factions'].includes(type)) return res.status(400).json({ ok: false, error: 'INVALID_TYPE' });

      await checkAndUpdateCooldown(db, user.uid, `addElement:${type}`, 60); // 타입별 1분 쿨다운

      let newElement = data;
      if (data.userInput && password) { // AI 생성 요청
          const geminiKey = await getDecryptedKey(user.uid, password);
          const worldContext = JSON.stringify(data.worldContext, null, 2);
          const systemPrompt = `당신은 세계관 확장 AI입니다. 주어진 세계관 정보에 어울리는 새로운 요소를 JSON 형식으로 생성합니다. 설명은 200자 내외로 작성해주세요.
          - 명소(sites) 생성 시: {"name": "명소 이름", "description": "설명", "difficulty": "normal", "imageUrl": ""}
          - NPC(npcs) 생성 시: {"name": "NPC 이름", "description": "설명"}
          - 세력(factions) 생성 시: {"name": "세력 이름", "description": "설명"}
          요청된 타입에 맞는 JSON 객체 하나만 반환하세요.`;
          
          const userPrompt = `현재 세계관 정보:\n${worldContext}\n\n사용자 요청사항: "${data.userInput}"\n\n위 세계관에 어울리는 새로운 ${type} 1개를 생성해줘.`;

          const { json } = await callGemini({ key: geminiKey, model: pickModels().primary, system: systemPrompt, user: userPrompt });
          if (!json || !json.name) throw new Error('AI_GENERATION_FAILED');
          newElement = json;
      }

      if (!newElement || !newElement.name) return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });
      const ref = db.collection('worlds').doc(req.params.id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ ok: false, error: 'WORLD_NOT_FOUND' });
      const arr = Array.isArray(snap.data()[type]) ? [...snap.data()[type]] : [];
      const ix = arr.findIndex(x => (x.name||'') === newElement.name);
      if (ix >= 0) arr[ix] = { ...arr[ix], ...newElement };
      else arr.push(newElement);

      await ref.update({ [type]: arr, updatedAt: FieldValue.serverTimestamp() });
      res.json({ ok: true, data: newElement });
    } catch (e) {
        if (e.message.startsWith('COOLDOWN_ACTIVE')) {
            return res.status(429).json({ ok: false, error: e.message });
        }
        res.status(500).json({ ok: false, error: String(e) });
    }
  });

  app.delete('/api/worlds/:id/elements', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      const { type, name } = req.body || {};
      if (!['sites','npcs','factions'].includes(type)) return res.status(400).json({ ok: false, error: 'INVALID_TYPE' });
      if (!name) return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });
      const ref = db.collection('worlds').doc(req.params.id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ ok: false, error: 'WORLD_NOT_FOUND' });
      const arr = Array.isArray(snap.data()[type]) ? snap.data()[type].filter(x => (x.name||'') !== name) : [];
      await ref.update({ [type]: arr, updatedAt: FieldValue.serverTimestamp() });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.post('/api/worlds/:id/like', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      const ref = db.collection('worlds').doc(req.params.id);
      await ref.update({ likesCount: FieldValue.increment(1) });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });
}
