// /functions/routes/worlds.mjs
import { db, FieldValue } from '../lib/firebase.mjs';
import { getUserFromReq } from '../lib/auth.mjs';

export function mountWorlds(app) {

  // 세계관 목록
  app.get('/api/worlds', async (req, res) => {
    try {
      const qs = await db.collection('worlds')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();
      const items = qs.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json({ ok: true, data: items });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  // 세계관 생성/저장 (간단 upsert)
  app.post('/api/worlds', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

      const w = req.body || {};
      const now = FieldValue.serverTimestamp();

      // name은 필수
      if (!w.name || !String(w.name).trim()) {
        return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });
      }

      // 새 문서 생성
      const docRef = await db.collection('worlds').add({
        name: w.name,
        introShort: w.introShort || '',
        introLong: w.introLong || '',
        coverUrl: w.coverUrl || '',
        factions: Array.isArray(w.factions) ? w.factions : [],
        npcs: Array.isArray(w.npcs) ? w.npcs : [],
        sites: Array.isArray(w.sites) ? w.sites : [],
        episodes: Array.isArray(w.episodes) ? w.episodes : [],
        allowPublicContribution: !!w.allowPublicContribution,
        likesCount: 0,
        ownerUid: user.uid,
        createdAt: now,
        updatedAt: now,
      });

      res.json({ ok: true, data: { id: docRef.id } });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  // 세계관 단건 조회
  app.get('/api/worlds/:id', async (req, res) => {
    try {
      const snap = await db.collection('worlds').doc(req.params.id).get();
      if (!snap.exists) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      res.json({ ok: true, data: { id: snap.id, ...snap.data() } });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  // 커버 이미지 갱신
  app.patch('/api/worlds/:id/cover', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

      const { coverUrl } = req.body || {};
      if (!coverUrl) return res.status(400).json({ ok: false, error: 'coverUrl required' });

      const ref = db.collection('worlds').doc(req.params.id);
      await ref.update({ coverUrl, updatedAt: FieldValue.serverTimestamp() });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  // 명소 추가 (간단 merge)
  app.post('/api/worlds/:id/sites', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

      const site = req.body || {};
      if (!site.name || !String(site.name).trim()) {
        return res.status(400).json({ ok: false, error: 'SITE_NAME_REQUIRED' });
      }

      const ref = db.collection('worlds').doc(req.params.id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ ok: false, error: 'WORLD_NOT_FOUND' });

      const data = snap.data();
      const list = Array.isArray(data.sites) ? [...data.sites] : [];
      const ix = list.findIndex(s => (s.name||'') === site.name);
      if (ix >= 0) list[ix] = { ...list[ix], ...site };
      else list.push(site);

      await ref.update({ sites: list, updatedAt: FieldValue.serverTimestamp() });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  // 명소 이미지 갱신 (name 매칭)
  app.patch('/api/worlds/:id/siteImage', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

      const { siteName, imageUrl } = req.body || {};
      if (!siteName || !imageUrl) {
        return res.status(400).json({ ok: false, error: 'siteName/imageUrl required' });
      }

      const ref = db.collection('worlds').doc(req.params.id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ ok: false, error: 'WORLD_NOT_FOUND' });

      const data = snap.data();
      const list = Array.isArray(data.sites) ? [...data.sites] : [];
      const ix = list.findIndex(s => (s.name||'') === siteName);
      if (ix < 0) return res.status(404).json({ ok: false, error: 'SITE_NOT_FOUND' });

      list[ix] = { ...list[ix], imageUrl };
      await ref.update({ sites: list, updatedAt: FieldValue.serverTimestamp() });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  // 공용 요소 추가/삭제 (sites|npcs|factions)
  app.post('/api/worlds/:id/elements', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      const { type, data } = req.body || {};
      if (!['sites','npcs','factions'].includes(type)) {
        return res.status(400).json({ ok: false, error: 'INVALID_TYPE' });
      }
      if (!data || !data.name) {
        return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });
      }

      const ref = db.collection('worlds').doc(req.params.id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ ok: false, error: 'WORLD_NOT_FOUND' });

      const w = snap.data();
      const arr = Array.isArray(w[type]) ? [...w[type]] : [];
      const ix = arr.findIndex(x => (x.name||'') === data.name);
      if (ix >= 0) arr[ix] = { ...arr[ix], ...data };
      else arr.push(data);

      await ref.update({ [type]: arr, updatedAt: FieldValue.serverTimestamp() });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  app.delete('/api/worlds/:id/elements', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
      const { type, name } = req.body || {};
      if (!['sites','npcs','factions'].includes(type)) {
        return res.status(400).json({ ok: false, error: 'INVALID_TYPE' });
      }
      if (!name) return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });

      const ref = db.collection('worlds').doc(req.params.id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ ok: false, error: 'WORLD_NOT_FOUND' });

      const w = snap.data();
      const arr = Array.isArray(w[type]) ? w[type].filter(x => (x.name||'') !== name) : [];
      await ref.update({ [type]: arr, updatedAt: FieldValue.serverTimestamp() });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  // 좋아요
  app.post('/api/worlds/:id/like', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

      const ref = db.collection('worlds').doc(req.params.id);
      await ref.update({ likesCount: FieldValue.increment(1) });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });
}
