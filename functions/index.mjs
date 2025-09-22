import express from 'express';
} catch (e) {
res.status(500).json({ ok: false, error: String(e) });
}
});


// 단건
app.get('/api/worlds/:id', async (req, res) => {
try {
const doc = await db.collection('worlds').doc(req.params.id).get();
if (!doc.exists) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
res.json({ ok: true, data: { id: doc.id, ...doc.data() } });
} catch (e) {
res.status(500).json({ ok: false, error: String(e) });
}
});


// 생성 (1일 1회 제한)
app.post('/api/worlds/create', async (req, res) => {
try {
const user = await getUserFromReq(req);
if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });


const now = new Date();
// KST 기준 yyyy-mm-dd
const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
const day = kst.toISOString().slice(0, 10);


const metaRef = db.collection('user_meta').doc(user.uid);
const metaSnap = await metaRef.get();
const lastDay = metaSnap.exists ? metaSnap.data().lastWorldCreateDay : null;
if (lastDay === day) return res.status(429).json({ ok: false, error: 'DAILY_LIMIT' });


const { name = '새 세계', intro = '소개글', detail = {} } = req.body || {};


// TODO: 여기서 AI 생성 로직을 붙일 수 있음 (텍스트/이미지)
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


if (like.exists) {
tx.delete(likeRef);
tx.update(worldRef, { likesCount: (world.data().likesCount || 0) - 1 });
} else {
tx.set(likeRef, { createdAt: new Date() });
tx.update(worldRef, { likesCount: (world.data().likesCount || 0) + 1 });
}
});


res.json({ ok: true });
} catch (e) {
res.status(500).json({ ok: false, error: String(e) });
}
});


export const api = onRequest({ region: 'asia-northeast3' }, app);
