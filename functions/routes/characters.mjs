// functions/routes/characters.mjs
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/firebase.mjs';
import { getUserFromReq } from '../lib/auth.mjs';
import { callGemini, pickModels } from '../lib/gemini.mjs';
import { loadCharacterBasePrompt } from '../lib/prompts.mjs';
import { checkAndUpdateCooldown } from '../lib/cooldown.mjs';

function updateElo(a, b, Sa, K = 32) {
  const Ea = 1 / (1 + Math.pow(10, (b - a) / 400));
  const Eb = 1 / (1 + Math.pow(10, (a - b) / 400));
  const newA = Math.round(a + K * (Sa - Ea));
  const newB = Math.round(b + K * ((1 - Sa) - Eb));
  return [newA, newB];
}

async function findOpponentByElo({ db, elo, excludeCharId, excludeUid, band = 150 }) {
  const e = Number(elo ?? 1000);
  const range = async (lo, hi) => {
    const qs = await db.collection('characters')
      .where('elo', '>=', lo)
      .where('elo', '<=', hi)
      .orderBy('elo', 'asc')
      .limit(60)
      .get();
    return qs.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(x => x.id !== excludeCharId && x.ownerUid !== excludeUid);
  };
  let cands = await range(Math.max(0, e - band), e + band);
  if (!cands.length) cands = await range(Math.max(0, e - 300), e + 300);
  if (!cands.length) return null;
  cands.sort((a, b) => Math.abs((a.elo ?? 1000) - e) - Math.abs((b.elo ?? 1000) - e));
  const top = cands.slice(0, Math.min(6, cands.length));
  return top[Math.floor(Math.random() * top.length)];
}

function buildOneShotBattlePrompt({ me, op, world }) {
  const pick = (c) => {
    const chosen = Array.isArray(c.chosen) ? c.chosen : [];
    const skills = Array.isArray(c.abilities) ? c.abilities : [];
    const pickedSkills = chosen
      .map(x => skills[x] || skills.find(s => s?.id === x || s?.name === x))
      .filter(Boolean);
    const items = (Array.isArray(c.items) ? c.items : []).map(i => ({name: i.name, description: i.description})).filter(Boolean);
    const narrative = (Array.isArray(c.narratives) && c.narratives.length > 0) ? c.narratives[0].long : (c.introShort || c.description || '');
    return {
      name: c.name || '',
      elo: Number(c.elo ?? 1000),
      narrative: String(narrative).slice(0, 500),
      skills: pickedSkills.map(s => ({name: s.name, description: s.description})),
      items,
    };
  };
  const A = pick(me);
  const B = pick(op);
  const worldName = world?.name || me?.worldName || op?.worldName || '-';
  const worldDesc = String(world?.description || world?.introShort || '').slice(0, 800);
  return [
    `# 세계관 정보`,
    `- 이름: ${worldName}`,
    `- 개요: ${worldDesc}`,
    ``,
    `# A측 캐릭터: ${A.name} (Elo: ${A.elo})`,
    `## 서사`, `${A.narrative}`,
    `## 장착 스킬`, ...A.skills.map(s => `- ${s.name}: ${s.description}`),
    `## 장착 아이템`, ...A.items.map(i => `- ${i.name}: ${i.description}`),
    ``,
    `# B측 캐릭터: ${B.name} (Elo: ${B.elo})`,
    `## 서사`, `${B.narrative}`,
    `## 장착 스킬`, ...B.skills.map(s => `- ${s.name}: ${s.description}`),
    `## 장착 아이템`, ...B.items.map(i => `- ${i.name}: ${i.description}`),
    ``,
    `# 지시사항`,
    `위 정보를 바탕으로 두 캐릭터의 전투를 3~6문단의 흥미진진한 이야기로 묘사해줘.`,
    `전투 과정에서 각 캐릭터의 서사, 스킬, 아이템 특징이 잘 드러나야 해.`,
    `마지막 줄에는 반드시 '승자: A' 또는 '승자: B' 중 하나만 단독으로 출력해야 해.`,
  ].join('\n');
}

export function mountCharacters(app) {
  app.get('/api/my-characters', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      const snap = await db.collection('characters').where('ownerUid', '==', user.uid).orderBy('updatedAt', 'desc').limit(50).get();
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json({ ok: true, data });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.get('/api/characters/:id', async (req, res) => {
    try {
      const d = await db.collection('characters').doc(req.params.id).get();
      if (!d.exists) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      res.json({ ok: true, data: { id: d.id, ...d.data() } });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.get('/api/characters/:id/battle-logs', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      const charId = req.params.id;
      const q1 = db.collection('battles').where('meId', '==', charId).get();
      const q2 = db.collection('battles').where('opId', '==', charId).get();
      const [snap1, snap2] = await Promise.all([q1, q2]);
      const logs = [...snap1.docs.map(d => ({ id: d.id, ...d.data() })), ...snap2.docs.map(d => ({ id: d.id, ...d.data() }))];
      const uniqueLogs = Array.from(new Map(logs.map(log => [log.id, log])).values()).filter(log => log.status === 'finished').sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      const charIds = new Set();
      uniqueLogs.forEach(log => { charIds.add(log.meId); charIds.add(log.opId); });
      if (charIds.size > 0) {
        const charSnaps = await db.getAll(...Array.from(charIds).map(id => db.collection('characters').doc(id)));
        const charDataMap = new Map();
        charSnaps.forEach(snap => { if (snap.exists) charDataMap.set(snap.id, snap.data()); });
        const enrichedLogs = uniqueLogs.map(log => {
            const me = charDataMap.get(log.meId);
            const op = charDataMap.get(log.opId);
            return { ...log, meImageUrl: me?.imageUrl || '', opImageUrl: op?.imageUrl || '' };
        });
        return res.json({ ok: true, data: enrichedLogs.slice(0, 50) });
      }
      res.json({ ok: true, data: uniqueLogs.slice(0, 50) });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });
  
  app.get('/api/characters', async (req, res) => {
    try {
      const { worldId, sort = 'elo_desc', limit = 50 } = req.query;
      let q = db.collection('characters');
      if (worldId) q = q.where('worldId', '==', String(worldId));
      if (sort === 'elo_desc') q = q.orderBy('elo', 'desc');
      else q = q.orderBy('updatedAt', 'desc');
      const n = Math.min(100, Number(limit || 50));
      const snap = await q.limit(n).get();
      res.json({ ok: true, data: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.post('/api/characters/generate', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      
      await checkAndUpdateCooldown(db, user.uid, 'generateCharacter', 300);

      const { geminiKey, worldId, promptId, userInput, imageUrl } = req.body;
      if (!geminiKey) return res.status(400).json({ ok: false, error: 'GEMINI_KEY_REQUIRED' });
      if (!worldId || !userInput || !userInput.name) return res.status(400).json({ ok: false, error: 'ARGS_REQUIRED' });
      
      const [worldSnap, promptSnap] = await Promise.all([
        db.collection('worlds').doc(worldId).get(),
        promptId ? db.collection('prompts').doc(promptId).get() : Promise.resolve(null)
      ]);
      if (!worldSnap.exists) return res.status(404).json({ ok:false, error:'WORLD_NOT_FOUND' });
      
      const world = worldSnap.data();
      const worldText = JSON.stringify({ name: world.name, introShort: world.introShort }, null, 2);
      const basePrompt = await loadCharacterBasePrompt();
      const customPrompt = promptSnap?.exists ? promptSnap.data().content : '사용자의 입력에 따라 자유롭게 캐릭터의 서사를 구성합니다.';
      
      const composedUser = [
        `### 세계관 정보`, worldText,
        `### 생성 프롬프트`, customPrompt,
        `### 사용자 요청`, `캐릭터 이름: ${userInput.name}\n추가 요청: ${userInput.request || '(없음)'}`,
        `\n\n위 정보를 바탕으로 JSON 스키마에 맞춰 캐릭터를 생성해줘.`,
      ].join('\n\n');

      const { primary } = pickModels();
      const { json: characterJson } = await callGemini({ key: geminiKey, model: primary, system: basePrompt, user: composedUser });

      if (!characterJson || !characterJson.name) throw new Error('AI_GENERATION_FAILED');
      
      if (Array.isArray(characterJson.abilities) && characterJson.abilities.length > 0) {
        const indices = Array.from({length: characterJson.abilities.length}, (_, i) => i);
        indices.sort(() => 0.5 - Math.random());
        characterJson.chosen = indices.slice(0, 3);
      }
      if (Math.random() < 0.2) {
        characterJson.items = characterJson.items || [];
        characterJson.items.push({ name: "낡은 단검", description: "평범한 모험가의 시작 아이템입니다.", grade: "common" });
      }

      const now = FieldValue.serverTimestamp();
      const doc = await db.collection('characters').add({
        ...characterJson,
        worldId, worldName: world.name, promptId, imageUrl,
        ownerUid: user.uid,
        elo: 1000,
        createdAt: now, updatedAt: now
      });

      res.json({ ok: true, data: { id: doc.id } });
    } catch (e) {
      if (e.message.startsWith('COOLDOWN_ACTIVE')) {
        return res.status(429).json({ ok: false, error: e.message });
      }
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  app.post('/api/characters/:id/abilities', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      const { chosen } = req.body || {};
      if (!Array.isArray(chosen)) return res.status(400).json({ ok: false, error: 'CHOSEN_REQUIRED' });
      
      const ref = db.collection('characters').doc(req.params.id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      if ((snap.data().ownerUid || '') !== user.uid) return res.status(403).json({ ok: false, error: 'NOT_OWNER' });
      
      await ref.update({ chosen, updatedAt: FieldValue.serverTimestamp() });
      res.json({ ok: true, data: { id: req.params.id, chosen } });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.post('/api/characters/:id/items', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      const { equipped } = req.body || {};
      if (!Array.isArray(equipped)) return res.status(400).json({ ok: false, error: 'EQUIPPED_REQUIRED' });
      
      const ref = db.collection('characters').doc(req.params.id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      const c = snap.data();
      if ((c.ownerUid || '') !== user.uid) return res.status(403).json({ ok: false, error: 'NOT_OWNER' });
      
      const inv = (Array.isArray(c.items) ? c.items : []).map(x => String(x?.name || ''));
      const norm = equipped.map(n => (n && inv.includes(String(n))) ? String(n) : null);
      
      await ref.update({ equipped: norm, updatedAt: FieldValue.serverTimestamp() });
      res.json({ ok: true, data: { id: req.params.id, equipped: norm } });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.post('/api/matchmaking/find', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      const { charId } = req.body || {};
      if (!charId) return res.status(400).json({ ok: false, error: 'charId required' });
      const meRef = db.collection('characters').doc(charId);
      const meSnap = await meRef.get();
      if (!meSnap.exists) return res.status(404).json({ ok: false, error: 'CHAR_NOT_FOUND' });
      const me = meSnap.data();
      if ((me.ownerUid || '') !== user.uid) return res.status(403).json({ ok: false, error: 'NOT_OWNER' });
      const opp = await findOpponentByElo({ db, elo: me.elo ?? 1000, excludeCharId: charId, excludeUid: user.uid });
      res.json({ ok: true, data: { opponentId: opp?.id || null } });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.post('/api/battle/create', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      await checkAndUpdateCooldown(db, user.uid, 'createBattle', 30);
      const { meId, opId } = req.body;
      if (!meId || !opId) return res.status(400).json({ ok: false, error: 'ARGS_REQUIRED' });
      const [aSnap, bSnap] = await Promise.all([ db.collection('characters').doc(meId).get(), db.collection('characters').doc(opId).get() ]);
      if (!aSnap.exists || !bSnap.exists) return res.status(404).json({ ok: false, error: 'CHAR_NOT_FOUND' });
      if ((aSnap.data().ownerUid || '') !== user.uid) return res.status(403).json({ ok: false, error: 'NOT_OWNER' });
      const now = FieldValue.serverTimestamp();
      const doc = await db.collection('battles').add({
        meId, opId,
        meName: aSnap.data().name || '',
        opName: bSnap.data().name || '',
        meImageUrl: aSnap.data().imageUrl || '',
        opImageUrl: bSnap.data().imageUrl || '',
        eloMe: aSnap.data().elo ?? 1000,
        eloOp: bSnap.data().elo ?? 1000,
        status: 'ready',
        createdAt: now, updatedAt: now
      });
      res.json({ ok: true, data: { id: doc.id } });
    } catch (e) {
      if (e.message.startsWith('COOLDOWN_ACTIVE')) {
        return res.status(429).json({ ok: false, error: e.message });
      }
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  app.post('/api/battle/simulate', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      const { battleId, geminiKey } = req.body || {};
      if (!battleId) return res.status(400).json({ ok: false, error: 'battleId required' });
      if (!geminiKey) return res.status(400).json({ ok: false, error: 'GEMINI_KEY_REQUIRED' });
      const bRef = db.collection('battles').doc(battleId);
      const bSnap = await bRef.get();
      if (!bSnap.exists) return res.status(404).json({ ok: false, error: 'BATTLE_NOT_FOUND' });
      const b = bSnap.data();
      if (b.status === 'finished') return res.status(400).json({ ok: false, error: 'BATTLE_ALREADY_FINISHED' });
      const meSnap = await db.collection('characters').doc(b.meId).get();
      if (meSnap.data().ownerUid !== user.uid) return res.status(403).json({ ok: false, error: 'NOT_OWNER' });
      const opSnap = await db.collection('characters').doc(b.opId).get();
      const me = meSnap.data(), op = opSnap.data();
      let world = null;
      if (me.worldId) {
          const w = await db.collection('worlds').doc(me.worldId).get();
          if (w.exists) world = w.data();
      }
      const prompt = buildOneShotBattlePrompt({ me, op, world });
      const { primary } = pickModels();
      const aiRes = await callGemini({ key: geminiKey, model: primary, user: prompt, responseMimeType: "text/plain" });
      const markdown = aiRes.text;
      const m = /승자:\s*(A|B)/.exec(markdown);
      const winner = m ? m[1] : null;
      if (winner) {
        const a = me, o = op;
        const Sa = (winner === 'A') ? 1 : 0;
        const [newA, newB] = updateElo(a.elo ?? 1000, o.elo ?? 1000, Sa);
        const now = FieldValue.serverTimestamp();
        await Promise.all([
          db.collection('characters').doc(b.meId).update({ elo: newA, updatedAt: now }),
          db.collection('characters').doc(b.opId).update({ elo: newB, updatedAt: now }),
          bRef.update({ status: 'finished', winner: winner, log: markdown, eloMeAfter: newA, eloOpAfter: newB, updatedAt: now, })
        ]);
      }
      res.json({ ok: true, data: { markdown, winner } });
    } catch (e) { 
      res.status(500).json({ ok: false, error: String(e) }); 
    }
  });
  
  app.patch('/api/characters/:id/image', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      const { imageUrl } = req.body;
      if (!imageUrl) return res.status(400).json({ ok: false, error: 'IMAGE_URL_REQUIRED' });
      const ref = db.collection('characters').doc(req.params.id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      if (snap.data().ownerUid !== user.uid) return res.status(403).json({ ok: false, error: 'NOT_OWNER' });
      await ref.update({ imageUrl, updatedAt: FieldValue.serverTimestamp() });
      res.json({ ok: true, data: { id: req.params.id, imageUrl } });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  app.delete('/api/characters/:id', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      const ref = db.collection('characters').doc(req.params.id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      if (snap.data().ownerUid !== user.uid) return res.status(403).json({ ok: false, error: 'NOT_OWNER' });
      await ref.delete();
      res.json({ ok: true, data: { id: req.params.id } });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });
}
