// functions/routes/rankings.mjs
import { db } from '../lib/firebase.mjs';

export function mountRankings(app) {
  // 캐릭터 랭킹 (ELO 순)
  app.get('/api/rankings/characters', async (req, res) => {
    try {
      const qs = await db.collection('characters')
        .orderBy('elo', 'desc')
        .limit(100)
        .get();
      const items = qs.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json({ ok: true, data: items });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  // 세계관 랭킹 (좋아요 순)
  app.get('/api/rankings/worlds', async (req, res) => {
    try {
      const qs = await db.collection('worlds')
        .orderBy('likesCount', 'desc')
        .limit(100)
        .get();
      const items = qs.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json({ ok: true, data: items });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });
}
