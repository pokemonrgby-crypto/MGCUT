// functions/routes/characters.mjs
import { FieldValue } from 'firebase-admin/firestore';

// Elo 계산 함수
function updateElo(a, b, Sa, K = 32) {
  const Ea = 1 / (1 + Math.pow(10, (b - a) / 400));
  const newA = Math.round(a + K * (Sa - Ea));
  const newB = Math.round(b + K * ((1 - Sa) - (1 - Ea)));
  return [newA, newB];
}

// Elo 기반 상대 찾기 함수
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
  return top.length > 0 ? top[Math.floor(Math.random() * top.length)] : null;
}

// AI 호출을 위한 프롬프트 생성 함수
function buildOneShotBattlePrompt({ me, op, world }) {
  const pick = (c) => {
    const chosen = Array.isArray(c.chosen) ? c.chosen : [];
    const skills = Array.isArray(c.abilities) ? c.abilities : [];
    const picked = chosen
      .map(x => skills[x]?.name || skills.find(s => s?.id === x || s?.name === x)?.name)
      .filter(Boolean);
    const items = (Array.isArray(c.items) ? c.items : []).map(i => i?.name).filter(Boolean);
    const intro = String(c.introShort || c.description || '').slice(0, 180);
    return { name: c.name || '', elo: Number(c.elo ?? 1000), picked, items, intro, worldId: c.worldId };
  };
  const A = pick(me), B = pick(op);
  const worldName = world?.name || me?.worldName || me?.worldId || '-';
  const worldDesc = String(world?.description || world?.introShort || '').slice(0, 300);

  return [
    `# 세계관`,
    `- 이름: ${worldName}`,
    worldDesc ? `- 개요: ${worldDesc}` : '',
    ``,
    `# 참가자`,
    `- A: ${A.name} (Elo ${A.elo})`,
    `  - 스킬: ${A.picked.join(' · ') || '-'}`,
    `  - 아이템: ${A.items.join(' · ') || '-'}`,
    `  - 소개: ${A.intro}`,
    `- B: ${B.name} (Elo ${B.elo})`,
    `  - 스킬: ${B.picked.join(' · ') || '-'}`,
    `  - 아이템: ${B.items.join(' · ') || '-'}`,
    `  - 소개: ${B.intro}`,
    ``,
    `# 출력 형식`,
    `1) 한 문단으로 된 전투의 제목`,
    `2) 3~6 문단으로 구성된 전투 전개 과정 (마크다운 사용)`,
    `3) 마지막 줄에 '승자: A' 또는 '승자: B' 중 하나만 명시 (무승부 없음)`,
  ].join('\n');
}


export function mountCharacters(app, db, getUserFromReq) {
  app.get('/api/my-characters', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      const snap = await db.collection('characters')
        .where('ownerUid', '==', user.uid)
        .orderBy('updatedAt', 'desc')
        .limit(50).get();
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

  app.post('/api/characters/save', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      const { worldId, promptId, characterData, imageUrl } = req.body || {};
      if (!worldId || !characterData) return res.status(400).json({ ok: false, error: 'ARGS_REQUIRED' });

      const now = FieldValue.serverTimestamp();
      const doc = await db.collection('characters').add({
        ...characterData,
        worldId,
        promptId: promptId || null,
        imageUrl: imageUrl || null,
        ownerUid: user.uid,
        elo: Number(characterData?.elo ?? 1000),
        createdAt: now, updatedAt: now
      });
      res.json({ ok: true, data: { id: doc.id } });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.post('/api/characters/:id/abilities', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      const { chosen } = req.body || {};
      if (!Array.isArray(chosen) || chosen.length !== 3) {
        return res.status(400).json({ ok: false, error: 'CHOSEN_3_REQUIRED' });
      }
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
      if (!Array.isArray(equipped) || equipped.length > 3) {
        return res.status(400).json({ ok: false, error: 'EQUIPPED_MAX_3_REQUIRED' });
      }
      const ref = db.collection('characters').doc(req.params.id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      const c = snap.data();
      if ((c.ownerUid || '') !== user.uid) return res.status(403).json({ ok: false, error: 'NOT_OWNER' });

      await ref.update({ equipped, updatedAt: FieldValue.serverTimestamp() });
      res.json({ ok: true, data: { id: req.params.id, equipped } });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.post('/api/matchmaking/find', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      const { charId } = req.body || {};
      if (!charId) return res.status(400).json({ ok: false, error: 'charId required' });

      const meSnap = await db.collection('characters').doc(charId).get();
      if (!meSnap.exists) return res.status(404).json({ ok: false, error: 'CHAR_NOT_FOUND' });
      const me = meSnap.data();
      if (me.ownerUid !== user.uid) return res.status(403).json({ ok: false, error: 'NOT_OWNER' });

      const opp = await findOpponentByElo({ db, elo: me.elo, excludeCharId: charId, excludeUid: user.uid });
      res.json({ ok: true, data: { opponentId: opp?.id || null } });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.post('/api/battle/create', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      const { meId, opId } = req.body || {};
      if (!meId || !opId) return res.status(400).json({ ok: false, error: 'ARGS_REQUIRED' });

      const [aSnap, bSnap] = await Promise.all([
        db.collection('characters').doc(meId).get(),
        db.collection('characters').doc(opId).get(),
      ]);
      if (!aSnap.exists || !bSnap.exists) return res.status(404).json({ ok: false, error: 'CHAR_NOT_FOUND' });
      if (aSnap.data().ownerUid !== user.uid) return res.status(403).json({ ok: false, error: 'NOT_OWNER' });

      const now = FieldValue.serverTimestamp();
      const doc = await db.collection('battles').add({
        meId, opId,
        eloMe: aSnap.data().elo ?? 1000,
        eloOp: bSnap.data().elo ?? 1000,
        status: 'ready',
        createdAt: now, updatedAt: now
      });
      res.json({ ok: true, data: { id: doc.id } });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.post('/api/battle/simulate', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

      const { battleId } = req.body || {};
      if (!battleId) return res.status(400).json({ ok: false, error: 'battleId required' });

      const bRef = db.collection('battles').doc(battleId);
      const bSnap = await bRef.get();
      if (!bSnap.exists) return res.status(404).json({ ok: false, error: 'BATTLE_NOT_FOUND' });
      const b = bSnap.data();

      const [meSnap, opSnap] = await Promise.all([
        db.collection('characters').doc(b.meId).get(),
        db.collection('characters').doc(b.opId).get(),
      ]);
      const me = meSnap.data(), op = opSnap.data();

      let world = null;
      try {
        const wid = me.worldId || op.worldId;
        if (wid) {
          const w = await db.collection('worlds').doc(wid).get();
          if (w.exists) world = w.data();
        }
      } catch {}

      const prompt = buildOneShotBattlePrompt({ me, op, world });
      
      // AI 호출은 클라이언트에서 하므로, 여기서는 단순히 프롬프트만 반환
      // 클라이언트는 이 프롬프트를 받아 Gemini에 요청을 보냄
      res.json({ ok: true, data: { promptForClient: prompt } });

    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  app.post('/api/battle/finish', async (req, res) => {
    try {
        const user = await getUserFromReq(req);
        if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

        const { battleId, winner } = req.body || {}; // 'A' or 'B'
        if (!battleId || !['A', 'B'].includes(winner)) {
            return res.status(400).json({ ok: false, error: 'battleId and winner (A or B) required' });
        }

        const bRef = db.collection('battles').doc(battleId);
        const bSnap = await bRef.get();
        if (!bSnap.exists) return res.status(404).json({ ok: false, error: 'BATTLE_NOT_FOUND' });
        const b = bSnap.data();
        
        // Elo가 이미 업데이트되었는지 확인
        if (b.status === 'finished') {
            return res.json({ ok: true, message: 'Already finished' });
        }

        const aRef = db.collection('characters').doc(b.meId);
        const oRef = db.collection('characters').doc(b.opId);

        await db.runTransaction(async (tx) => {
            const [aSnap, oSnap] = await Promise.all([tx.get(aRef), tx.get(oRef)]);
            if (!aSnap.exists || !oSnap.exists) throw new Error('Character not found in transaction');

            const a = aSnap.data();
            const o = oSnap.data();
            const Sa = (winner === 'A') ? 1 : 0;
            
            const [newA, newB] = updateElo(a.elo ?? 1000, o.elo ?? 1000, Sa);

            tx.update(aRef, { elo: newA, updatedAt: FieldValue.serverTimestamp() });
            tx.update(oRef, { elo: newB, updatedAt: FieldValue.serverTimestamp() });
            tx.update(bRef, { 
                status: 'finished',
                winner,
                eloMeAfter: newA, 
                eloOpAfter: newB, 
                updatedAt: FieldValue.serverTimestamp() 
            });
        });

        res.json({ ok: true, data: { message: 'Elo updated' } });
    } catch (e) {
        res.status(500).json({ ok: false, error: String(e) });
    }
  });
}
