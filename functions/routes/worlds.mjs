// functions/routes/worlds.mjs
import { db, FieldValue } from '../lib/firebase.mjs';
import { toKstDay } from '../lib/kst.mjs';
import { getUserFromReq } from '../lib/auth.mjs';
// TODO: 새로운 스키마에 맞는 validateWorld, validateSite 함수를 schemas.mjs에 만들어야 함

export function mountWorlds(app){

  // [POST] 월드 생성
  app.post('/api/worlds', async (req,res)=>{
    try{
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok:false, error:'UNAUTHENTICATED' });

      // KST 기준 하루 1회 생성 제한
      const today = toKstDay(new Date());
      const metaRef = db.collection('user_meta').doc(user.uid);
      const metaSnap = await metaRef.get();
      if ((metaSnap.data()?.lastWorldCreateDay||null) === today){
        return res.status(429).json({ ok:false, error:'DAILY_LIMIT' });
      }

      const worldData = req.body || {};
      
      if (!worldData.name || !worldData.introShort) {
        return res.status(400).json({ ok: false, error: 'REQUIRED_FIELDS_MISSING' });
      }

      const ref = await db.collection('worlds').add({
        ...worldData,
        ownerUid: user.uid,
        createdAt: FieldValue.serverTimestamp(),
        likesCount: 0,
        visibility: 'public',
        coverUrl: ''
      });
      
      await metaRef.set({ lastWorldCreateDay: today }, { merge:true });
      
      res.status(201).json({ ok:true, data: { id: ref.id } });
    }catch(e){ res.status(500).json({ ok:false, error:String(e) }); }
  });
  
  // [GET] 월드 목록
  app.get('/api/worlds', async (req,res)=>{
    try{
      const qs = await db.collection('worlds')
        .orderBy('createdAt','desc').limit(30).get();
      const items = qs.docs.map(d=>({ id:d.id, ...d.data() }));
      res.json({ ok:true, data:items });
    }catch(e){ res.status(500).json({ ok:false, error:String(e) }); }
  });

  // [GET] 월드 단건
  app.get('/api/worlds/:id', async (req,res)=>{
    try{
      const doc = await db.collection('worlds').doc(req.params.id).get();
      if (!doc.exists) return res.status(404).json({ ok:false, error:'NOT_FOUND' });
      res.json({ ok:true, data:{ id:doc.id, ...doc.data() } });
    }catch(e){ res.status(500).json({ ok:false, error:String(e) }); }
  });

  // [POST] 좋아요 토글
  app.post('/api/worlds/:id/like', async (req,res)=>{
    try{
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok:false, error:'UNAUTHENTICATED' });

      const worldId = req.params.id;
      const likeRef = db.collection('worlds').doc(worldId).collection('likes').doc(user.uid);
      const worldRef = db.collection('worlds').doc(worldId);

      await db.runTransaction(async (tx)=>{
        const like = await tx.get(likeRef);
        const world = await tx.get(worldRef);
        if (!world.exists) throw new Error('NOT_FOUND');
        const cur = world.data().likesCount || 0;
        if (like.exists){ tx.delete(likeRef); tx.update(worldRef, { likesCount: Math.max(0, cur-1) }); }
        else { tx.set(likeRef, { createdAt: new Date() }); tx.update(worldRef, { likesCount: cur+1 }); }
      });

      res.json({ ok:true });
    }catch(e){ res.status(500).json({ ok:false, error:String(e) }); }
  });

  // [PATCH] 커버 이미지 URL 저장
  app.patch('/api/worlds/:id/cover', async (req,res)=>{
    try{
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok:false, error:'UNAUTHENTICATED' });

      const { coverUrl } = req.body || {};
      if (!coverUrl) return res.status(400).json({ ok:false, error:'REQUIRED' });

      const ref = db.collection('worlds').doc(req.params.id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ ok:false, error:'NOT_FOUND' });
      if (snap.data().ownerUid !== user.uid) return res.status(403).json({ ok:false, error:'FORBIDDEN' });
      
      await ref.update({ coverUrl: String(coverUrl) });
      res.json({ ok:true });
    }catch(e){ res.status(500).json({ ok:false, error:String(e) }); }
  });
  
  // [추가] 명소(site) 추가
  app.post('/api/worlds/:id/sites', async (req,res)=>{
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

      const siteData = req.body || {};
      // TODO: schemas.mjs에 validateSite 만들어서 검증
      if (!siteData.name || !siteData.description || !siteData.difficulty) {
        return res.status(400).json({ ok: false, error: 'REQUIRED_FIELDS_MISSING' });
      }

      const ref = db.collection('worlds').doc(req.params.id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      if (snap.data().ownerUid !== user.uid) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });

      await ref.update({
        sites: FieldValue.arrayUnion({
          name: String(siteData.name),
          description: String(siteData.description),
          difficulty: String(siteData.difficulty),
          imageUrl: String(siteData.imageUrl || '')
        })
      });
      res.json({ ok: true });
    } catch(e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });
  app.patch('/api/worlds/:id/siteImage', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

      const { siteName, imageUrl } = req.body || {};
      if (!siteName || !imageUrl) return res.status(400).json({ ok: false, error: 'REQUIRED' });

      const worldRef = db.collection('worlds').doc(req.params.id);
      const worldSnap = await worldRef.get();
      if (!worldSnap.exists) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

      const worldData = worldSnap.data();
      if (worldData.ownerUid !== user.uid) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
      
      const sites = worldData.sites || [];
      const siteIndex = sites.findIndex(s => s.name === siteName);
      if (siteIndex === -1) return res.status(404).json({ ok: false, error: 'SITE_NOT_FOUND' });

      sites[siteIndex].imageUrl = String(imageUrl);

      await worldRef.update({ sites });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });
}
