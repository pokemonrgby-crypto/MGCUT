// functions/index.mjs  (전체 교체본)
import express from 'express';
import { onRequest } from 'firebase-functions/v2/https';

import { mountWorlds } from './routes/worlds.mjs';
import { mountPrompts } from './routes/prompts.mjs';
import { mountCharacters } from './routes/characters.mjs';

const app = express();
app.use(express.json());

// 헬스체크
app.get('/api/ping', (req, res) => res.json({ ok: true }));

// 라우트 모듈 장착
mountWorlds(app);
mountPrompts(app);
mountCharacters(app);

export const api = onRequest({ region: 'asia-northeast3' }, app);
