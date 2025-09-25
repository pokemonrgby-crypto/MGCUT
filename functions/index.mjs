// functions/index.mjs
import express from 'express';
import { onRequest } from 'firebase-functions/v2/onRequest';

import { mountWorlds } from './routes/worlds.mjs';
import { mountPrompts } from './routes/prompts.mjs';
import { mountCharacters } from './routes/characters.mjs';
import { mountRankings } from './routes/rankings.mjs';
import { mountUser } from './routes/user.mjs';
import { mountAdventures } from './routes/adventures.mjs'; // [추가]

const app = express();
app.use(express.json());

// 헬스체크
app.get('/api/ping', (req, res) => res.json({ ok: true }));

// 라우트 모듈 장착
mountWorlds(app);
mountPrompts(app);
mountCharacters(app);
mountRankings(app);
mountUser(app);
mountAdventures(app); // [추가]


export const api = onRequest({ region: 'asia-northeast3' }, app);
