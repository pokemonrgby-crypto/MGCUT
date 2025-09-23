// functions/routes/characters.mjs
import { db, FieldValue } from '../lib/firebase.mjs';
import { getUserFromReq } from '../lib/auth.mjs';
import { validateCharacter } from '../lib/schemas.mjs';

export function mountCharacters(app){

  app.get('/api/my-characters', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

      const qs = await db.collection('characters')
        .where('ownerUid', '==', user.uid)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();
      
      const items = qs.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json({ ok: true, data: items });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  // [수정] /api/characters/create -> /api/characters/save
  // AI 호출 로직을 제거하고, 클라이언트가 생성한 캐릭터 데이터를 받아 저장하는 역할만 수행
  app.post('/api/characters/save', async (req,res)=>{
    try{
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok:false, error:'UNAUTHENTICATED' });

      const { worldId, promptId, characterData } = req.body || {};
      if (!worldId || !characterData) return res.status(400).json({ ok:false, error:'REQUIRED_DATA_MISSING' });

      // 서버 사이드 유효성 검사
      const v = validateCharacter(characterData);
      if (!v.ok) return res.status(400).json({ ok:false, error:'SCHEMA_FAIL', details:v.errors });
      
      const wsnap = await db.collection('worlds').doc(worldId).get();
      if (!wsnap.exists) return res.status(404).json({ ok:false, error:'WORLD_NOT_FOUND' });
      const wdata = wsnap.data();

      // 프롬프트 사용 횟수 업데이트
      if (promptId) {
        db.collection('prompts').doc(promptId).update({ usageCount: FieldValue.increment(1) }).catch(()=>{});
      }

      const doc = await db.collection('characters').add({
        ...characterData,
        worldId,
        worldName: wdata.name || '',
        ownerUid: user.uid,
        createdAt: FieldValue.serverTimestamp(),
        promptRef: promptId || null,
      });
      res.json({ ok:true, data:{ id: doc.id } });
    }catch(e){ res.status(400).json({ ok:false, error:e.message||'ERR_CHAR_SAVE' }); }
  });
}
