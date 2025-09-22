// functions/routes/worlds.mjs
import { db, FieldValue } from '../lib/firebase.mjs';
import { toKstDay } from '../lib/kst.mjs';
import { getUserFromReq } from '../lib/auth.mjs';

export function mountWorlds(app){
  // [GET] 목록 (공개 최신 30)
  app.get('/api/worlds', async (req,res)=>{
    try{
      const qs = await db.collection('worlds')
        .orderBy('createdAt','desc').limit(30).get();
      const items = qs.docs.map(d=>({ id:d.id, ...d.data() }));
      res.json({ ok:true, data:items });
    }catch(e){ res.status(500).json({ ok:false, error:String(e) }); }
  });

  // [GET] 단건
  app.get('/api/worlds/:id', async (req,res)=>{
    try{
      const doc = await db.collection('worlds').doc(req.params.id).get();
      if (!doc.exists) return res.status(404).json({ ok:false, error:'NOT_FOUND' });
      res.json({ ok:true, data:{ id:doc.id, ...doc.data() } });
    }catch(e){ res.status(500).json({ ok:false, error:String(e) }); }
  });

  // [POST] 생성 (KST 기준 하루 1회)
  app.post('/api/worlds/create', async (req,res)=>{
    try{
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok:false, error:'UNAUTHENTICATED' });

      const today = toKstDay(new Date());
      const metaRef = db.collection('user_meta').doc(user.uid);
      const metaSnap = await metaRef.get();
      if ((metaSnap.data()?.lastWorldCreateDay||null) === today){
        return res.status(429).json({ ok:false, error:'DAILY_LIMIT' });
      }

      const { name='새 세계', intro='소개글', detail={} } = req.body || {};
      const ref = await db.collection('worlds').add({
        ownerUid: user.uid, name, intro, detail,
        createdAt: FieldValue.serverTimestamp(),
        likesCount: 0, visibility: 'public', coverUrl: ''
      });
      await metaRef.set({ lastWorldCreateDay: today }, { merge:true });
      res.json({ ok:true, id: ref.id });
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

      // 정책에 맞게 권한 체크(소유자만 허용 등) 필요 시 아래 조건 활성화
      // if (snap.data().ownerUid !== user.uid) return res.status(403).json({ ok:false, error:'FORBIDDEN' });

      await ref.update({ coverUrl: String(coverUrl) });
      res.json({ ok:true });
    }catch(e){ res.status(500).json({ ok:false, error:String(e) }); }
  });
}
