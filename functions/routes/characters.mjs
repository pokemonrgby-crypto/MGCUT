// ===== characters.mjs — SAFE BLOCK (routes only) =====
import { FieldValue } from 'firebase-admin/firestore';
// 노드 런타임이 18 미만이면 주석 해제: import fetch from 'node-fetch';

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
    worldDesc ? `- 개요: ${worldDesc}` : `- 개요: (생략)`,
    ``,
    `# 참가자`,
    `- A: ${A.name} (Elo ${A.elo})`,
    `  - 스킬: ${A.picked.join(' · ') || '-'}`,
    `  - 아이템: ${A.items.join(' · ') || '-'}`,
    `- B: ${B.name} (Elo ${B.elo})`,
    `  - 스킬: ${B.picked.join(' · ') || '-'}`,
    `  - 아이템: ${B.items.join(' · ') || '-'}`,
    ``,
    `# 출력 형식`,
    `1) 한 문단 요약`,
    `2) 전개 3~6 문단 (마크다운)`,
    `3) 마지막 줄 단독으로 '승자: A' | '승자: B' | '승자: 무승부'`,
  ].join('\n');
}

export function mountCharacters(app, db, getUserFromReq) {
  // --- 내 캐릭터 목록 (updatedAt desc) ---
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

  // --- 캐릭터 단건 조회 ---
  app.get('/api/characters/:id', async (req, res) => {
    try {
      const d = await db.collection('characters').doc(req.params.id).get();
      if (!d.exists) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      res.json({ ok: true, data: { id: d.id, ...d.data() } });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  // --- 세계관 소속 캐릭터 (Elo desc) ---
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

  // --- 캐릭터 저장(생성/업데이트) ---
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

  // --- 스킬(3개) 저장 ---
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

  // --- 아이템(3칸) 저장 ---
  app.post('/api/characters/:id/items', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      const { equipped } = req.body || {};
      if (!Array.isArray(equipped) || equipped.length !== 3) {
        return res.status(400).json({ ok: false, error: 'EQUIPPED_3_REQUIRED' });
      }
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

  // --- 매칭: 자기/같은 소유자 제외 + Elo 근접 ---
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

      const opp = await findOpponentByElo({
        db,
        elo: me.elo ?? 1000,
        excludeCharId: charId,
        excludeUid: user.uid
      });
      res.json({ ok: true, data: { opponentId: opp?.id || null } });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  // --- 배틀 생성 (ready) ---
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
      if ((aSnap.data().ownerUid || '') !== user.uid) return res.status(403).json({ ok: false, error: 'NOT_OWNER' });

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

  // --- 배틀 1회 시뮬 + 타임라인 기록 ---
  app.post('/api/battle/simulate', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

      const apiKey = String(req.get('X-User-Api-Key') || req.get('X-OpenAI-Key') || '').trim();
      if (!apiKey) return res.status(400).json({ ok: false, error: 'USER_API_KEY_REQUIRED' });

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

      // 세계관
      let world = null;
      try {
        const wid = me.worldId || op.worldId;
        if (wid) {
          const w = await db.collection('worlds').doc(wid).get();
          if (w.exists) world = w.data();
        }
      } catch {}

      // 프롬프트
      const prompt = buildOneShotBattlePrompt({ me, op, world });

      // === Gemini 호출 (사용자 키) ===
      const model = 'gemini-2.0-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const body = {
        systemInstruction: { role: 'system', parts: [{ text: '당신은 판타지 전투 해설가다. 출력은 한국어 마크다운.' }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 2048, responseMimeType: 'text/markdown' }
      };
      const resAI = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!resAI.ok) {
        const t = await resAI.text().catch(() => '');
        throw new Error(`Gemini ${resAI.status} ${t.slice(0, 200)}`);
      }
      const j = await resAI.json();
      const markdown =
        j?.candidates?.[0]?.content?.parts?.[0]?.text ||
        j?.candidates?.[0]?.content?.parts?.[0]?.raw_text ||
        '**오류**: 결과 없음';

      // 승자 파싱
      const m = /승자:\s*(A|B|무승부)/.exec(markdown);
      const winTag = m ? m[1] : ((me.elo ?? 1000) >= (op.elo ?? 1000) ? 'A' : 'B');

      const now = FieldValue.serverTimestamp();
      await bRef.update({ status: 'done', updatedAt: now, logMd: markdown, winner: winTag });

      // 타임라인 (양쪽 캐릭터에 기록)
      const preview = markdown.split('\n').slice(0, 4).join(' ').slice(0, 280);
      await Promise.all([
        db.collection('characters').doc(b.meId).collection('timeline').add({
          ts: now, type: 'battle', battleId, opponentId: b.opId,
          result: winTag === 'A' ? 'WIN' : (winTag === 'B' ? 'LOSE' : 'DRAW'),
          preview, worldId: me.worldId || null
        }),
        db.collection('characters').doc(b.opId).collection('timeline').add({
          ts: now, type: 'battle', battleId, opponentId: b.meId,
          result: winTag === 'B' ? 'WIN' : (winTag === 'A' ? 'LOSE' : 'DRAW'),
          preview, worldId: op.worldId || null
        })
      ]);

      res.json({ ok: true, data: { winner: winTag, markdown } });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  // --- 배틀 종료 → Elo 반영 ---
  app.post('/api/battle/finish', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

      const { battleId, result } = req.body || {};
      if (!battleId || !['A', 'B', 'DRAW'].includes(result))
        return res.status(400).json({ ok: false, error: 'ARGS_REQUIRED' });

      const bRef = db.collection('battles').doc(battleId);
      const bSnap = await bRef.get();
      if (!bSnap.exists) return res.status(404).json({ ok: false, error: 'BATTLE_NOT_FOUND' });
      const b = bSnap.data();

      const [aSnap, oSnap] = await Promise.all([
        db.collection('characters').doc(b.meId).get(),
        db.collection('characters').doc(b.opId).get(),
      ]);
      const a = aSnap.data(), o = oSnap.data();
      const Sa = (result === 'A') ? 1 : (result === 'DRAW' ? 0.5 : 0);
      const [newA, newB] = updateElo(a.elo ?? 1000, o.elo ?? 1000, Sa);

      await Promise.all([
        db.collection('characters').doc(b.meId).update({ elo: newA, updatedAt: FieldValue.serverTimestamp() }),
        db.collection('characters').doc(b.opId).update({ elo: newB, updatedAt: FieldValue.serverTimestamp() }),
        bRef.update({ eloMeAfter: newA, eloOpAfter: newB, updatedAt: FieldValue.serverTimestamp() })
      ]);

      res.json({ ok: true, data: { eloMe: newA, eloOp: newB } });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });
} // <<< 반드시 이 닫힘이 있어야 해! (Unexpected end of input 방지)
