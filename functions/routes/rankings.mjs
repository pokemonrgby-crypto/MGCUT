// /functions/routes/rankings.mjs
import { db } from '../lib/firebase.mjs';

export function mountRankings(app) {
  // 캐릭터 Elo 랭킹
  app.get('/api/rankings/characters', async (req, res) => {
    try {
      const { limit = 50 } = req.query || {};
      const qs = await db.collection('characters')
        .orderBy('elo', 'desc')
        .limit(Number(limit) || 50)
        .get();
      const list = qs.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json({ ok: true, data: list });
    } catch (e) { res.status(500).json({ ok:false, error: String(e) }); }
  });

  // 세계관 랭킹(인기도 순 = likesCount)
  app.get('/api/rankings/worlds', async (req, res) => {
    try {
      const { limit = 50 } = req.query || {};
      const qs = await db.collection('worlds')
        .orderBy('likesCount', 'desc')
        .limit(Number(limit) || 50)
        .get();
      const list = qs.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json({ ok: true, data: list });
    } catch (e) { res.status(500).json({ ok:false, error: String(e) }); }
  });
}
