import express from 'express';
import { toKstDay } from './lib/kst.mjs';
import { pickModels, callGemini } from './lib/gemini.mjs';
import { validateCharacter } from './lib/schemas.mjs';
import { loadWorldSystemPrompt, loadCharacterBasePrompt } from './lib/prompts.mjs';
import { onRequest } from 'firebase-functions/v2/https';
import { db, FieldValue } from './lib/firebase.mjs';
import { getUserFromReq } from './lib/auth.mjs';

const app = express();



// --- 공통 인증: Firebase ID 토큰 필요 (Authorization: Bearer <idToken>) ---
async function requireUser(req) {
  const h = req.headers?.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) throw Object.assign(new Error('UNAUTH'), { code: 401 });
  const idToken = m[1];
  const info = await admin.auth().verifyIdToken(idToken);
  if (!info?.uid) throw Object.assign(new Error('UNAUTH'), { code: 401 });
  return info.uid;
}

function getGeminiKeyFromHeaders(req, fallback) {
  // 사용자가 무료 키를 줬다면 서버에서만 사용
  return req.headers['x-gemini-key'] ? String(req.headers['x-gemini-key']) : fallback;
}

function buildWorldText(w) {
  const sites = (w?.detail?.sites || []).map(s => `- ${s.name}: ${s.description}`).join('\n');
  const orgs  = (w?.detail?.orgs  || []).map(o => `- ${o.name}: ${o.description}`).join('\n');
  const npcs  = (w?.detail?.npcs  || []).map(n => `- ${n.name}: ${n.role}`).join('\n');
  return [
    `세계: ${w?.name || ''}`,
    `소개: ${w?.intro || ''}`,
    `배경: ${w?.detail?.lore || ''}`,
    `명소:\n${sites}`,
    `조직:\n${orgs}`,
    `NPC:\n${npcs}`,
  ].join('\n\n');
}

async function upsertUserDayLimit(uid, field) {
  const db = admin.firestore();
  const ref = db.collection('users').doc(uid);
  const today = toKstDay(new Date());
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    if (data?.[field] === today) {
      throw Object.assign(new Error('DAILY_LIMIT'), { code: 429 });
    }
    tx.set(ref, { [field]: today }, { merge: true });
  });
}

function normalizeWorld(json) {
  const j = json || {};
  return {
    name: String(j.name || '').trim().slice(0, 80),
    intro: String(j.intro || '').trim(),
    detail: {
      lore: String(j?.detail?.lore || '').trim(),
      sites: Array.isArray(j?.detail?.sites) ? j.detail.sites.map((s, i) => ({
        id: String(s?.id || `site-${i}`).trim(),
        name: String(s?.name || '').trim(),
        description: String(s?.description || '').trim(),
      })) : [],
      orgs: Array.isArray(j?.detail?.orgs) ? j.detail.orgs.map((o, i) => ({
        id: String(o?.id || `org-${i}`).trim(),
        name: String(o?.name || '').trim(),
        description: String(o?.description || '').trim(),
      })) : [],
      npcs: Array.isArray(j?.detail?.npcs) ? j.detail.npcs.map((n, i) => ({
        id: String(n?.id || `npc-${i}`).trim(),
        name: String(n?.name || '').trim(),
        role: String(n?.role || '').trim(),
      })) : [],
    },
  };
}






app.use(express.json());

// 헬스체크
app.get('/api/ping', (req, res) => res.json({ ok: true }));

// 세계 목록 (최신 30)
app.get('/api/worlds', async (req, res) => {
  try {
    const snap = await db.collection('worlds')
      .orderBy('createdAt', 'desc')
      .limit(30)
      .get();
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});


// [GET] /api/prompts  (공개 목록)
app.get('/api/prompts', async (req, res) => {
  try {
    const db = admin.firestore();
    const qs = await db.collection('prompts')
      .where('status', '==', 'public')
      .orderBy('createdAt', 'desc')
      .limit(50).get();
    const items = qs.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ ok: true, data: items });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message || 'ERR_PROMPTS_LIST' });
  }
});

// [POST] /api/prompts  (하루 1개 업로드)
app.post('/api/prompts', async (req, res) => {
  try {
    const uid = await requireUser(req);
    await upsertUserDayLimit(uid, 'lastPromptDay');

    const { title, content } = req.body || {};
    if (!title || !content) throw Object.assign(new Error('REQUIRED'), { code: 400 });

    const db = admin.firestore();
    const now = admin.firestore.FieldValue.serverTimestamp();
    const doc = await db.collection('prompts').add({
      title: String(title).slice(0, 80),
      content: String(content),
      ownerUid: uid,
      createdAt: now,
      status: 'public',
      usageCount: 0,
      lastValidatedAt: null,
      schemaVersion: 1,
    });
    res.json({ ok: true, data: { id: doc.id } });
  } catch (e) {
    const code = e.code === 429 ? 429 : (e.code === 401 ? 401 : 400);
    res.status(code).json({ ok: false, error: e.message || 'ERR_PROMPT_UPLOAD' });
  }
});

// [POST] /api/prompts/:id/validate  (작성자 전용 검증)
app.post('/api/prompts/:id/validate', async (req, res) => {
  try {
    const uid = await requireUser(req);
    const db = admin.firestore();
    const ref = db.collection('prompts').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) throw Object.assign(new Error('NOT_FOUND'), { code: 404 });
    const data = snap.data();
    if (data.ownerUid !== uid) throw Object.assign(new Error('FORBIDDEN'), { code: 403 });

    // 샘플 worldText + basePrompt로 테스트
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

    if (!v.ok) {
      return res.status(400).json({ ok: false, error: 'SCHEMA_FAIL', details: v.errors });
    }

    await ref.update({ lastValidatedAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ ok: true, data: { preview: test } });
  } catch (e) {
    const code = e.code || 400;
    res.status(code).json({ ok: false, error: e.message || 'ERR_PROMPT_VALIDATE' });
  }
});

// [POST] /api/prompts/:id/report  (누구나 신고)
app.post('/api/prompts/:id/report', async (req, res) => {
  try {
    const uid = await requireUser(req);
    const { reason } = req.body || {};
    if (!reason || String(reason).trim().length < 3) {
      throw Object.assign(new Error('REASON_REQUIRED'), { code: 400 });
    }
    const db = admin.firestore();
    const ref = db.collection('prompts').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) throw Object.assign(new Error('NOT_FOUND'), { code: 404 });

    await ref.collection('reports').add({
      reporterUid: uid,
      reason: String(reason).trim().slice(0, 500),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 즉시 차단이 필요하면 아래 주석 해제
    // await ref.update({ status: 'flagged' });

    res.json({ ok: true });
  } catch (e) {
    const code = e.code || 400;
    res.status(code).json({ ok: false, error: e.message || 'ERR_PROMPT_REPORT' });
  }
});




// 세계 단건
app.get('/api/worlds/:id', async (req, res) => {
  try {
    const doc = await db.collection('worlds').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    res.json({ ok: true, data: { id: doc.id, ...doc.data() } });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// 세계 생성 (1일 1회 제한)
app.post('/api/worlds/create', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

    // 한국 시간 기준 YYYY-MM-DD
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const day = kst.toISOString().slice(0, 10);

    const metaRef = db.collection('user_meta').doc(user.uid);
    const metaSnap = await metaRef.get();
    const lastDay = metaSnap.exists ? metaSnap.data().lastWorldCreateDay : null;
    if (lastDay === day) return res.status(429).json({ ok: false, error: 'DAILY_LIMIT' });

    const { name = '새 세계', intro = '소개글', detail = {} } = req.body || {};

    // TODO: 여기에서 AI(텍스트/이미지) 생성 로직을 이어 붙일 수 있어.
    const worldDoc = {
      ownerUid: user.uid,
      name,
      intro,
      detail,
      createdAt: FieldValue.serverTimestamp(),
      likesCount: 0
    };

    const ref = await db.collection('worlds').add(worldDoc);
    await metaRef.set({ lastWorldCreateDay: day }, { merge: true });

    res.json({ ok: true, id: ref.id });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});


// 좋아요 토글
app.post('/api/worlds/:id/like', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

    const worldId = req.params.id;
    const likeRef = db.collection('worlds').doc(worldId).collection('likes').doc(user.uid);
    const worldRef = db.collection('worlds').doc(worldId);

    await db.runTransaction(async (tx) => {
      const like = await tx.get(likeRef);
      const world = await tx.get(worldRef);
      if (!world.exists) throw new Error('NOT_FOUND');

      const cur = world.data().likesCount || 0;
      if (like.exists) {
        tx.delete(likeRef);
        tx.update(worldRef, { likesCount: Math.max(0, cur - 1) });
      } else {
        tx.set(likeRef, { createdAt: new Date() });
        tx.update(worldRef, { likesCount: cur + 1 });
      }
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});


// [POST] /api/characters/create
app.post('/api/characters/create', async (req, res) => {
  try {
    const uid = await requireUser(req);
    const { worldId, promptId, customPrompt, userInput } = req.body || {};
    if (!worldId) throw Object.assign(new Error('REQUIRED_WORLD'), { code: 400 });
    if (!((promptId && !customPrompt) || (!promptId && customPrompt))) {
      throw Object.assign(new Error('PROMPT_CHOOSE_ONE'), { code: 400 });
    }
    if (String(userInput || '').length > 1000) {
      throw Object.assign(new Error('USER_INPUT_TOO_LONG'), { code: 400 });
    }

    const db = admin.firestore();
    const wref = db.collection('worlds').doc(worldId);
    const wsnap = await wref.get();
    if (!wsnap.exists) throw Object.assign(new Error('WORLD_NOT_FOUND'), { code: 404 });
    const wdata = wsnap.data();

    // 프롬프트 불러오기
    let promptText = '';
    if (promptId) {
      const psnap = await db.collection('prompts').doc(promptId).get();
      if (!psnap.exists) throw Object.assign(new Error('PROMPT_NOT_FOUND'), { code: 404 });
      const pdata = psnap.data();
      if (pdata.status !== 'public' && pdata.ownerUid !== uid) {
        throw Object.assign(new Error('PROMPT_FORBIDDEN'), { code: 403 });
      }
      promptText = String(pdata.content);
      // 사용량 카운트(+1)
      psnap.ref.update({ usageCount: admin.firestore.FieldValue.increment(1) }).catch(()=>{});
    } else {
      promptText = String(customPrompt);
    }

    const basePrompt = await loadCharacterBasePrompt();
    const worldText = wdata.worldText || buildWorldText(wdata);

    const composedUser = [
      `worldText:\n${worldText}`,
      `prompt:\n${promptText}`,
      `userInput:\n${String(userInput || '').trim()}`,
      `\n\n반드시 위 JSON 스키마로만 출력. 설명/코드펜스 금지.`,
    ].join('\n\n');

    const { primary } = pickModels();
    const apiKey = getGeminiKeyFromHeaders(req, process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
    if (!apiKey) throw Object.assign(new Error('NO_GEMINI_KEY'), { code: 500 });

    const out = await callGemini({ key: apiKey, model: primary, system: basePrompt, user: composedUser });
    const ch = out.json;
    const v = validateCharacter(ch);
    if (!v.ok) return res.status(400).json({ ok: false, error: 'SCHEMA_FAIL', details: v.errors });

    const now = admin.firestore.FieldValue.serverTimestamp();
    const doc = await db.collection('characters').add({
      worldId,
      worldName: wdata.name || '',
      ...ch,
      ownerUid: uid,
      createdAt: now,
      promptRef: promptId || null,
    });

    res.json({ ok: true, data: { id: doc.id } });
  } catch (e) {
    const code = e.code || 400;
    res.status(code).json({ ok: false, error: e.message || 'ERR_CHAR_CREATE' });
  }
});


export const api = onRequest({ region: 'asia-northeast3' }, app);
