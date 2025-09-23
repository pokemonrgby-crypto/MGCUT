// /functions/routes/characters.mjs
import { db, FieldValue } from '../lib/firebase.mjs';
import { getUserFromReq } from '../lib/auth.mjs';
import { validateCharacter } from '../lib/schemas.mjs';

// Elo 계산
const K = 32;
function expected(a, b) { return 1 / (1 + Math.pow(10, (b - a) / 400)); }
function updateElo(a, b, scoreA) {
  const ea = expected(a, b);
  const eb = expected(b, a);
  const sa = scoreA;         // 1=승, 0.5=무, 0=패
  const sb = 1 - sa;
  return [Math.round(a + K * (sa - ea)), Math.round(b + K * (sb - eb))];
}

export function mountCharacters(app) {
  // 단건 조회
  app.get('/api/characters/:id', async (req, res) => {
    try {
      const snap = await db.collection('characters').doc(req.params.id).get();
      if (!snap.exists) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      res.json({ ok: true, data: { id: snap.id, ...snap.data() } });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });



  // [신규] 스킬 선택 저장 (characters/:id/abilities)
app.post('/api/characters/:id/abilities', async (req, res) => {
  try{
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ ok:false, error:'UNAUTHENTICATED' });

    const id = req.params.id;
    const { chosen } = req.body || {};
    if (!Array.isArray(chosen) || chosen.length !== 3)
      return res.status(400).json({ ok:false, error:'CHOSEN_3_REQUIRED' });

    const ref = db.collection('characters').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ ok:false, error:'NOT_FOUND' });
    const c = snap.data();
    if (c.ownerUid !== user.uid) return res.status(403).json({ ok:false, error:'NOT_OWNER' });

    await ref.update({ chosen, updatedAt: FieldValue.serverTimestamp() });
    return res.json({ ok:true, data:{ id, chosen }});
  }catch(e){ return res.status(500).json({ ok:false, error:String(e) }); }
});

// [신규] 아이템 장착 저장 (characters/:id/items)
app.post('/api/characters/:id/items', async (req, res) => {
  try{
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ ok:false, error:'UNAUTHENTICATED' });

    const id = req.params.id;
    const { equipped } = req.body || {}; // (string|null)[] 길이=3
    if (!Array.isArray(equipped) || equipped.length !== 3)
      return res.status(400).json({ ok:false, error:'EQUIPPED_3_REQUIRED' });

    const ref = db.collection('characters').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ ok:false, error:'NOT_FOUND' });
    const c = snap.data();
    if (c.ownerUid !== user.uid) return res.status(403).json({ ok:false, error:'NOT_OWNER' });

    // 인벤토리에 없는 이름은 null 처리
    const names = (Array.isArray(c.items) ? c.items : []).map(x=>String(x?.name||''));
    const norm = equipped.map(n => (n && names.includes(String(n))) ? String(n) : null);

    await ref.update({ equipped: norm, updatedAt: FieldValue.serverTimestamp() });
    return res.json({ ok:true, data:{ id, equipped:norm }});
  }catch(e){ return res.status(500).json({ ok:false, error:String(e) }); }
});


// [신규] 배틀 생성
app.post('/api/battle/create', async (req, res) => {
  try{
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ ok:false, error:'UNAUTHENTICATED' });

    const { meId, opId } = req.body || {};
    if (!meId || !opId) return res.status(400).json({ ok:false, error:'ARGS_REQUIRED' });

    const [meSnap, opSnap] = await Promise.all([
      db.collection('characters').doc(meId).get(),
      db.collection('characters').doc(opId).get(),
    ]);
    if (!meSnap.exists || !opSnap.exists) return res.status(404).json({ ok:false, error:'CHAR_NOT_FOUND' });

    const me = meSnap.data(), op = opSnap.data();
    if (me.ownerUid !== user.uid) return res.status(403).json({ ok:false, error:'NOT_OWNER' });

    const now = FieldValue.serverTimestamp();
    const doc = await db.collection('battles').add({
      meId, opId,
      eloMe: me.elo ?? 1000,
      eloOp: op.elo ?? 1000,
      createdAt: now,
      updatedAt: now,
      status: 'ready'
    });
    return res.json({ ok:true, data:{ id: doc.id }});
  }catch(e){ return res.status(500).json({ ok:false, error:String(e) }); }
});

  // [신규] 배틀 턴 (리치텍스트 로그 추가)
// body: { battleId, action } , header: X-OpenAI-Key
app.post('/api/battle/turn', async (req, res) => {
  try{
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ ok:false, error:'UNAUTHENTICATED' });

    const apiKey = String(req.get('X-OpenAI-Key') || '').trim();
    if (!apiKey) return res.status(400).json({ ok:false, error:'OPENAI_KEY_REQUIRED' });

    const { battleId, action } = req.body || {};
    if (!battleId || !action) return res.status(400).json({ ok:false, error:'ARGS_REQUIRED' });

    const bRef = db.collection('battles').doc(battleId);
    const bSnap = await bRef.get();
    if (!bSnap.exists) return res.status(404).json({ ok:false, error:'BATTLE_NOT_FOUND' });

    // === TODO: 여기서 apiKey를 사용해 실제 모델 호출 ===
    // 리치텍스트(마크다운) 형태의 응답을 가정한 샘플 로그
    const now = FieldValue.serverTimestamp();
    const turnRef = await db.collection('battles').doc(battleId).collection('turns').add({
      ts: now,
      actor: 'system',
      text: `**행동**: ${String(action)}\n\n> (샘플) 모델 응답 자리 — 실제 연결 시 여기에 리치텍스트를 넣어주세요.`,
    });

    await bRef.update({ updatedAt: now, status: 'ongoing' });

    return res.json({ ok:true, data:{ turnId: turnRef.id }});
  }catch(e){ return res.status(500).json({ ok:false, error:String(e) }); }
});

  
  // [신규] 매칭 후보 찾기: 자기 자신 제외 + Elo 근접
app.post('/api/matchmaking/find', async (req, res) => {
  try{
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ ok:false, error:'UNAUTHENTICATED' });

    const { charId } = req.body || {};
    if (!charId) return res.status(400).json({ ok:false, error:'charId required' });

    const myDoc = await db.collection('characters').doc(charId).get();
    if (!myDoc.exists) return res.status(404).json({ ok:false, error:'CHAR_NOT_FOUND' });
    const me = myDoc.data();
    if (me.ownerUid !== user.uid) return res.status(403).json({ ok:false, error:'NOT_OWNER' });

    const elo = Number(me.elo ?? 1000);
    const band = 150; // 점수대 허용폭
    const minE = Math.max(0, elo - band);
    const maxE = elo + band;

    // Elo 범위로 후보 가져오기 (ownerUid/자기캐릭터 제외는 앱단 필터)
    const qs = await db.collection('characters')
      .where('elo', '>=', minE)
      .where('elo', '<=', maxE)
      .orderBy('elo')         // 인덱스 필요시 콘솔 링크로 한 번 생성
      .limit(40)
      .get();

    const candidates = qs.docs
      .map(d => ({ id:d.id, ...d.data() }))
      .filter(x => x.id !== charId && x.ownerUid !== user.uid);

    if (!candidates.length) return res.json({ ok:true, data:{ opponentId: null }});

    // Elo 차이가 가장 가까운 상대 고르기
    candidates.sort((a,b)=> Math.abs((a.elo??1000)-elo) - Math.abs((b.elo??1000)-elo));
    const opponent = candidates[0];

    return res.json({ ok:true, data:{ opponentId: opponent.id }});
  }catch(e){
    return res.status(500).json({ ok:false, error:String(e) });
  }
});


// [신규] 내 캐릭터 목록 (최신 50개)
app.get('/api/my-characters', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ ok:false, error:'UNAUTHENTICATED' });

    // 인덱스 없이도 안전하게: createdAt 기준 내림차순
    const snap = await db.collection('characters')
      .where('ownerUid', '==', user.uid)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ ok:true, data });
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e) });
  }
});

  


    // [신규] 내 캐릭터 목록(최신 50개)
  app.get('/api/my-characters', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok:false, error:'UNAUTHENTICATED' });

      const snap = await db.collection('characters')
        .where('ownerUid', '==', user.uid)
        .orderBy('updatedAt', 'desc')
        .limit(50)
        .get();

      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json({ ok:true, data });
    } catch (e) {
      res.status(500).json({ ok:false, error:String(e) });
    }
  });


  // 목록 (worldId·sort·limit)
  app.get('/api/characters', async (req, res) => {
    try {
      const { worldId, limit = 50, sort } = req.query || {};
      let ref = db.collection('characters');
      if (worldId) ref = ref.where('worldId', '==', worldId);
      if (sort === 'elo_desc') ref = ref.orderBy('elo', 'desc');
      else ref = ref.orderBy('createdAt', 'desc');

      const qs = await ref.limit(Number(limit) || 50).get();
      const list = qs.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json({ ok: true, data: list });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });

  // 생성(기본 아이템 0개, Elo=1000)
  app.post('/api/characters', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

      const c = req.body || {};
      if (!c.name || !c.worldId) return res.status(400).json({ ok: false, error: 'name/worldId required' });

      const now = FieldValue.serverTimestamp();
      const doc = await db.collection('characters').add({
        name: c.name,
        worldId: c.worldId,
        worldName: c.worldName || '',
        description: c.description || '',
        elo: Number.isFinite(c.elo) ? c.elo : 1000,
        items: Array.isArray(c.items) ? c.items : [],   // 기본 0개
        createdAt: now, updatedAt: now, ownerUid: user.uid
      });
      res.json({ ok: true, data: { id: doc.id } });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });



// [신규] AI JSON을 받아 캐릭터 생성
app.post('/api/characters/save', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ ok:false, error:'UNAUTHENTICATED' });

    const { worldId, promptId = null, characterData = {}, imageUrl = '' } = req.body || {};
    if (!worldId) return res.status(400).json({ ok:false, error:'worldId required' });

    const v = validateCharacter(characterData);
    if (!v.ok) return res.status(400).json({ ok:false, error:`INVALID_CHARACTER: ${v.errors.join(', ')}` });

    // worldName 보강(선택)
    let worldName = '';
    try {
      const wSnap = await db.collection('worlds').doc(worldId).get();
      worldName = wSnap.exists ? (wSnap.data().name || '') : '';
    } catch {}

    const now = FieldValue.serverTimestamp();

    // 아이템 정규화: grade -> rarity(N/R/SR/SSR/UR), 기본 []
    const rarityMap = { common:'N', normal:'N', rare:'R', epic:'SR', legendary:'UR', mythic:'UR', ssr:'SSR', ur:'UR' };
    const itemsSrc = Array.isArray(characterData.items) ? characterData.items : [];
    const items = itemsSrc.map(it => {
      const raw = String(it?.rarity || it?.grade || 'N').toUpperCase();
      const mapped = rarityMap[raw.toLowerCase()] || raw;
      const r = ['N','R','SR','SSR','UR'].includes(mapped) ? mapped : 'N';
      return {
        name: String(it?.name||'').slice(0,60),
        description: String(it?.description||''),
        rarity: r
      };
    });

    const docRef = await db.collection('characters').add({
      name: characterData.name,
      introShort: characterData.introShort || '',
      narratives: characterData.narratives || [],
      abilities: characterData.abilities || [],
      chosen: characterData.chosen || [],
      description: characterData.description || '',
      imageUrl: imageUrl || '',
      worldId,
      worldName,
      promptId: promptId || null,
      elo: 1000,
      items,                 // 기본 0개(없으면 [])
      ownerUid: user.uid,
      createdAt: now,
      updatedAt: now,
    });

    res.json({ ok:true, data:{ id: docRef.id }});
  } catch(e) {
    res.status(500).json({ ok:false, error:String(e) });
  }
});


  

  // 매치 결과 반영 (Elo 업데이트)
  // body: { aId, bId, result }  // result: 'A' | 'B' | 'DRAW'
  app.post('/api/match', async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

      const { aId, bId, result } = req.body || {};
      if (!aId || !bId || !['A','B','DRAW'].includes(result)) {
        return res.status(400).json({ ok: false, error: 'INVALID_ARGS' });
      }

      const aRef = db.collection('characters').doc(aId);
      const bRef = db.collection('characters').doc(bId);
      const [aSnap, bSnap] = await Promise.all([aRef.get(), bRef.get()]);
      if (!aSnap.exists || !bSnap.exists) return res.status(404).json({ ok: false, error: 'CHAR_NOT_FOUND' });

      const a = aSnap.data(), b = bSnap.data();
      const sa = result === 'A' ? 1 : result === 'DRAW' ? 0.5 : 0;
      const [newA, newB] = updateElo(a.elo ?? 1000, b.elo ?? 1000, sa);

      await Promise.all([
        aRef.update({ elo: newA, updatedAt: FieldValue.serverTimestamp() }),
        bRef.update({ elo: newB, updatedAt: FieldValue.serverTimestamp() })
      ]);

      res.json({ ok: true, data: { a: { id:aId, elo:newA }, b: { id:bId, elo:newB } } });
    } catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
  });
}
