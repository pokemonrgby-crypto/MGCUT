// functions/routes/characters.mjs
import { db, FieldValue } from '../lib/firebase.mjs';
import { getUserFromReq } from '../lib/auth.mjs';
import { validateCharacter } from '../lib/schemas.mjs';

// ELO 점수 계산 로직
function calculateElo(playerRating, opponentRating, result) {
  const k = 32; // K-factor
  const expectedScore = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
  return Math.round(playerRating + k * (result - expectedScore));
}

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
  
  // [신규] 캐릭터 단건 조회
  app.get('/api/characters/:id', async (req, res) => {
    try {
      const doc = await db.collection('characters').doc(req.params.id).get();
      if (!doc.exists) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      res.json({ ok: true, data: { id: doc.id, ...doc.data() } });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });
  
  // [신규] 특정 세계관 캐릭터 목록 (ELO 순)
  app.get('/api/worlds/:id/characters', async (req, res) => {
    try {
      const qs = await db.collection('characters')
        .where('worldId', '==', req.params.id)
        .orderBy('elo', 'desc')
        .limit(50)
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

      const { worldId, promptId, characterData, imageUrl } = req.body || {};
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
        imageUrl: imageUrl || '', // [추가] 캐릭터 이미지 URL
        elo: 1200, // [추가] 초기 ELO 점수
        wins: 0,   // [추가] 승리
        losses: 0, // [추가] 패배
      });
      res.json({ ok:true, data:{ id: doc.id } });
    }catch(e){ res.status(400).json({ ok:false, error:e.message||'ERR_CHAR_SAVE' }); }
  });

  // [신규] ELO 점수 업데이트
  app.post('/api/characters/elo', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

      const { winnerId, loserId } = req.body;
      if (!winnerId || !loserId) return res.status(400).json({ ok: false, error: 'REQUIRED' });

      const winnerRef = db.collection('characters').doc(winnerId);
      const loserRef = db.collection('characters').doc(loserId);

      await db.runTransaction(async tx => {
        const [winnerSnap, loserSnap] = await Promise.all([tx.get(winnerRef), tx.get(loserRef)]);
        if (!winnerSnap.exists || !loserSnap.exists) throw new Error('CHARACTER_NOT_FOUND');

        const winner = winnerSnap.data();
        const loser = loserSnap.data();

        const newWinnerElo = calculateElo(winner.elo, loser.elo, 1);
        const newLoserElo = calculateElo(loser.elo, winner.elo, 0);

        tx.update(winnerRef, { elo: newWinnerElo, wins: FieldValue.increment(1) });
        tx.update(loserRef, { elo: newLoserElo, losses: FieldValue.increment(1) });
      });

      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });
}
