import express from 'express';
import { onRequest } from 'firebase-functions/v2/https';
import { db, FieldValue } from './lib/firebase.mjs';
import { getUserFromReq } from './lib/auth.mjs';

const app = express();
app.use(express.json());

// 헬스체크
app.get('/api/ping', (req, res) => res.json({ ok: true }));

// 세계 목록
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

    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const day = kst.toISOString().slice(0, 10);

    const metaRef = db.collection('user_meta').doc(user.uid);
    const metaSnap = await metaRef.get();
    const lastDay = metaSnap.exists ? metaSnap.data().lastWorldCreateDay : null;
    if (lastDay === day) return res.status(429).json({ ok: false, error: 'DAILY_LIMIT' });

    const { name = '새 세계', intro = '소개글', detail = {} } = req.body || {};

    // TODO: 여기서 AI 생성(텍스트/이미지) 붙일 수 있음
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

export const api = onRequest({ region: 'asia-northeast3' }, app);
