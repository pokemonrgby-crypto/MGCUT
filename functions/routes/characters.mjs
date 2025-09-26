// (수정된 결과)
// functions/routes/characters.mjs
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/firebase.mjs';
import { getUserFromReq } from '../lib/auth.mjs';
import { callGemini, pickModels } from '../lib/gemini.mjs';
import { loadCharacterBasePrompt } from '../lib/prompts.mjs';
import { checkAndUpdateCooldown } from '../lib/cooldown.mjs';
import { getApiKeySecret } from '../lib/secret-manager.mjs';
import { preRollEvent } from '../lib/adventure-events.mjs';
import { randomUUID } from 'crypto';
// [추가] 아이템 등급별 가중치 텍스트를 import 합니다.
import { itemGradeWeights } from '../lib/adventure-combat-rules.mjs';

// 헬퍼 함수: UID로 API 키를 가져옵니다.
async function getApiKeyForUser(uid) {
  const apiKey = await getApiKeySecret(uid);
  if (!apiKey) {
    throw new Error('API_KEY_NOT_FOUND: 내 정보 탭에서 API 키를 먼저 등록해주세요.');
  }
  return apiKey;
}

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
    const chosenIds = new Set(Array.isArray(c.chosen) ? c.chosen : []);
    const skills = (Array.isArray(c.abilities) ? c.abilities : []).filter(s => chosenIds.has(s.id));
    const equippedIds = new Set(Array.isArray(c.equipped) ? c.equipped : []);
    const items = (Array.isArray(c.items) ? c.items : []).filter(i => equippedIds.has(i.id));
    const narrative = (Array.isArray(c.narratives) && c.narratives.length > 0) ? c.narratives[0].long : (c.introShort || c.description || '');

    // [수정] 가장 높은 등급의 아이템을 기준으로 장비 수준을 결정합니다.
    let equipmentLevel = itemGradeWeights.Common; // 기본값
    if (items.length > 0) {
        const gradeOrder = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Exotic'];
        const highestGradeItem = items.sort((a, b) => gradeOrder.indexOf(b.grade) - gradeOrder.indexOf(a.grade))[0];
        equipmentLevel = itemGradeWeights[highestGradeItem.grade] || itemGradeWeights.Common;
    }
    
    return {
      name: c.name || '',
      elo: Number(c.elo ?? 1000),
      narrative: String(narrative).slice(0, 500),
      skills: skills.map(s => ({ name: s.name, description: s.description })),
      items: items.map(i => ({ name: i.name, description: i.description, grade: i.grade })),
      equipmentLevel: equipmentLevel, // [추가] 장비 수준 설명 텍스트
    };
  };
  const A = pick(me);
  const B = pick(op);
  const worldName = world?.name || me?.worldName || op?.worldName || '-';
  const worldDesc = String(world?.description || world?.introShort || '').slice(0, 800);
  
  // [수정] 프롬프트에 '장비 수준' 항목 추가 및 지시사항 강화
  return [
    `# 세계관 정보`,
    `- 이름: ${worldName}`,
    `- 개요: ${worldDesc}`,
    ``,
    `# A측 캐릭터: ${A.name} (Elo: ${A.elo})`,
    `## 장비 수준: ${A.equipmentLevel}`,
    `## 서사`, `${A.narrative}`,
    `## 장착 스킬`, ...A.skills.map(s => `- ${s.name}: ${s.description}`),
    `## 장착 아이템`, ...A.items.map(i => `- ${i.name} (${i.grade}): ${i.description}`),
    ``,
    `# B측 캐릭터: ${B.name} (Elo: ${B.elo})`,
    `## 장비 수준: ${B.equipmentLevel}`,
    `## 서사`, `${B.narrative}`,
    `## 장착 스킬`, ...B.skills.map(s => `- ${s.name}: ${s.description}`),
    `## 장착 아이템`, ...B.items.map(i => `- ${i.name} (${i.grade}): ${i.description}`),
    ``,
    `# 지시사항`,
    `위 정보를 바탕으로 두 캐릭터의 전투를 <서술>, <대사>, <생각>, <강조> 태그를 활용하여 3~6문단의 흥미진진한 이야기로 묘사해줘. (예시: <서술>그녀는 사과를 먹는다</서술>)`,
    `전투 과정에서 각 캐릭터의 서사, 스킬, 아이템 특징이 잘 드러나야 해.`,
    `[매우 중요] '장비 수준' 설명이 더 강력한 쪽이 전투에서 확실한 우위를 점하도록 묘사하고, 승패를 결정하는 가장 중요한 요소로 반영해야 해. (예: '전설적인 장비' > '평범한 장비')`,
    `마지막 줄에는 반드시 '승자: A' 또는 '승자: B' 중 하나만 단독으로 출력해야 해.`,
  ].join('\n');
}

export function mountCharacters(app) {
  // 내 캐릭터 목록
  app.get('/api/my-characters', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      const snap = await db.collection('characters').where('ownerUid', '==', user.uid).orderBy('updatedAt', 'desc').limit(50).get();
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json({ ok: true, data });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  // 캐릭터 단건
  app.get('/api/characters/:id', async (req, res) => {
    try {
      const d = await db.collection('characters').doc(req.params.id).get();
      if (!d.exists) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      res.json({ ok: true, data: { id: d.id, ...d.data() } });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  // 캐릭터 배틀 로그 (타임라인 탭용)
  app.get('/api/characters/:id/battle-logs', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

      const charId = req.params.id;
      const q1 = db.collection('battles').where('meId', '==', charId).get();
      const q2 = db.collection('battles').where('opId', '==', charId).get();
      const [snap1, snap2] = await Promise.all([q1, q2]);

      const logs = [
        ...snap1.docs.map(d => ({ id: d.id, ...d.data() })),
        ...snap2.docs.map(d => ({ id: d.id, ...d.data() })),
      ];

      const uniqueLogs = Array.from(new Map(logs.map(log => [log.id, log])).values())
        .filter(log => log.status === 'finished')
        .sort((a, b) => {
          const sa = (a.createdAt?.seconds ?? a.updatedAt?.seconds ?? 0);
          const sb = (b.createdAt?.seconds ?? b.updatedAt?.seconds ?? 0);
          return sb - sa;
        });

      if (uniqueLogs.length === 0) {
        return res.json({ ok: true, data: [] });
      }

      const charIds = new Set();
      uniqueLogs.forEach(log => {
        if (log.meId) charIds.add(log.meId);
        if (log.opId) charIds.add(log.opId);
      });

      const charDataMap = new Map();
      if (charIds.size > 0) {
        const refs = Array.from(charIds).map(id => db.collection('characters').doc(id));
        const charSnaps = await db.getAll(...refs);
        charSnaps.forEach(snap => { if (snap.exists) charDataMap.set(snap.id, snap.data()); });
      }

      const enrichedLogs = uniqueLogs.map(log => {
        const me = charDataMap.get(log.meId);
        const op = charDataMap.get(log.opId);

        const meName = me?.name || log.meName || '나의 캐릭터';
        const opName = op?.name || log.opName || '상대 캐릭터';

        return {
          ...log,
          meName,
          opName,
          meImageUrl: me?.imageUrl || log.meImageUrl || '',
          opImageUrl: op?.imageUrl || log.opImageUrl || '',
          createdAt: log.createdAt || log.updatedAt || null,
          eloMe: Number(log.eloMe ?? me?.elo ?? 1000),
          eloOp: Number(log.eloOp ?? op?.elo ?? 1000),
          eloMeAfter: Number(log.eloMeAfter ?? log.eloMe ?? me?.elo ?? 1000),
          eloOpAfter: Number(log.eloOpAfter ?? log.eloOp ?? op?.elo ?? 1000),
        };
      });

      res.json({ ok: true, data: enrichedLogs.slice(0, 50) });
    } catch (e) {
      console.error(`Error fetching battle logs for character ${req.params.id}:`, e);
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  // 캐릭터 목록
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

  // 캐릭터 생성
  app.post('/api/characters/generate', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

      await checkAndUpdateCooldown(db, user.uid, 'generateCharacter', 300);

      const { worldId, promptId, userInput, imageUrl } = req.body;
      if (!worldId || !userInput || !userInput.name) return res.status(400).json({ ok: false, error: 'ARGS_REQUIRED' });

      const geminiKey = await getApiKeyForUser(user.uid);

      const [worldSnap, promptSnap] = await Promise.all([
        db.collection('worlds').doc(worldId).get(),
        promptId ? db.collection('prompts').doc(promptId).get() : Promise.resolve(null)
      ]);
      if (!worldSnap.exists) return res.status(404).json({ ok: false, error: 'WORLD_NOT_FOUND' });

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

      if (Array.isArray(characterJson.abilities)) {
        characterJson.abilities.forEach(a => a.id = randomUUID());
      }
      if (Array.isArray(characterJson.items)) {
        characterJson.items.forEach(i => i.id = randomUUID());
      }

      if (Array.isArray(characterJson.abilities) && characterJson.abilities.length > 0) {
        const abilityIds = characterJson.abilities.map(a => a.id);
        abilityIds.sort(() => 0.5 - Math.random());
        characterJson.chosen = abilityIds.slice(0, 3);
      } else {
        characterJson.chosen = [];
      }

      if (Math.random() < 0.2) {
        characterJson.items = characterJson.items || [];
        characterJson.items.push({ id: randomUUID(), name: "낡은 단검", description: "평범한 모험가의 시작 아이템입니다.", grade: "common" });
      }

      const now = FieldValue.serverTimestamp();
      const doc = await db.collection('characters').add({
        ...characterJson,
        worldId, worldName: world.name, promptId, imageUrl,
        ownerUid: user.uid,
        elo: 1000,
        equipped: [],
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

  // 장착 스킬 선택
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

  // 장착 아이템 선택
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

      const inventoryIds = new Set((c.items || []).map(i => i.id));
      const validEquippedIds = equipped.map(id => (id && inventoryIds.has(id)) ? id : null);

      await ref.update({ equipped: validEquippedIds, updatedAt: FieldValue.serverTimestamp() });
      res.json({ ok: true, data: { id: req.params.id, equipped: validEquippedIds } });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  // 매칭 상대 찾기
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

  // 배틀 생성
  app.post('/api/battle/create', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      await checkAndUpdateCooldown(db, user.uid, 'createBattle', 30);
      const { meId, opId } = req.body;
      if (!meId || !opId) return res.status(400).json({ ok: false, error: 'ARGS_REQUIRED' });
      const [aSnap, bSnap] = await Promise.all([db.collection('characters').doc(meId).get(), db.collection('characters').doc(opId).get()]);
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

  // 배틀 시뮬레이션
  app.post('/api/battle/simulate', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

      const { battleId } = req.body || {};
      if (!battleId) return res.status(400).json({ ok: false, error: 'BATTLE_ID_REQUIRED' });

      const geminiKey = await getApiKeyForUser(user.uid);

      const bRef = db.collection('battles').doc(battleId);
      const bSnap = await bRef.get();
      if (!bSnap.exists) return res.status(404).json({ ok: false, error: 'BATTLE_NOT_FOUND' });
      const b = bSnap.data();
      if (b.status === 'finished') return res.status(400).json({ ok: false, error: 'BATTLE_ALREADY_FINISHED' });

      const meRef = db.collection('characters').doc(b.meId);
      const opRef = db.collection('characters').doc(b.opId);
      const [meSnap, opSnap] = await Promise.all([meRef.get(), opRef.get()]);

      if (!meSnap.exists) return res.status(404).json({ ok: false, error: 'CHARACTER_NOT_FOUND (ME)' });
      if (meSnap.data().ownerUid !== user.uid) return res.status(403).json({ ok: false, error: 'NOT_OWNER' });
      if (!opSnap.exists) return res.status(404).json({ ok: false, error: 'CHARACTER_NOT_FOUND (OPPONENT)' });

      const me = { id: meSnap.id, ...meSnap.data() };
      const op = { id: opSnap.id, ...opSnap.data() };
      let world = null;
      if (me.worldId) {
        const w = await db.collection('worlds').doc(me.worldId).get();
        if (w.exists) world = w.data();
      }

      const prompt = buildOneShotBattlePrompt({ me, op, world });
      const { primary } = pickModels();
      const aiRes = await callGemini({ key: geminiKey, model: primary, user: prompt, responseMimeType: 'text/plain' });
      const markdown = aiRes.text;

      const m = /승자:\s*(A|B)/.exec(markdown);
      const winner = m ? m[1] : null;

      let droppedItem = null;

      if (winner) {
        const Sa = (winner === 'A') ? 1 : 0;
        const [newA, newB] = updateElo(me.elo ?? 1000, op.elo ?? 1000, Sa);
        const now = FieldValue.serverTimestamp();

        let meUpdatePayload = { elo: newA, updatedAt: now };

        if (Sa === 1) {
          const dropEvent = preRollEvent('hard');
          if (dropEvent.type === 'FIND_ITEM') {
            const itemPrompt = `TRPG 게임의 ${world?.name ?? '-'} 세계관에 어울리는 "${dropEvent.tier}" 등급 아이템 1개를 {"name": "...", "description": "...", "grade": "${dropEvent.tier}", "type": "equipable"} JSON 형식으로 생성해줘. 20% 확률로 "type"을 "consumable"로 설정해줘. 설명이나 코드 펜스 없이 순수 JSON 객체만 출력해줘.`;
            const { json: newItemJson } = await callGemini({ key: geminiKey, model: pickModels().primary, user: itemPrompt });
            if (newItemJson && newItemJson.name) {
              droppedItem = { ...newItemJson, id: randomUUID() };
              meUpdatePayload.items = FieldValue.arrayUnion(droppedItem);
            }
          }
        }

        await Promise.all([
          meRef.update(meUpdatePayload),
          opRef.update({ elo: newB, updatedAt: now }),
          bRef.update({ status: 'finished', winner: winner, log: markdown, eloMeAfter: newA, eloOpAfter: newB, updatedAt: now })
        ]);

      } else {
        await bRef.update({ status: 'finished', winner: null, log: markdown, updatedAt: FieldValue.serverTimestamp() });
      }

      res.json({ ok: true, data: { markdown, winner, droppedItem } });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });

  // 캐릭터 이미지 업데이트
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

  // 캐릭터 삭제
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
