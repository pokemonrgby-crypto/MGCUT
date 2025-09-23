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
