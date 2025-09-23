// (수정된 결과)
// functions/index.mjs
import express from 'express';
import { onRequest } from 'firebase-functions/v2/https';

import { db } from './lib/firebase.mjs';
import { getUserFromReq } from './lib/auth.mjs';

import { mountWorlds } from './routes/worlds.mjs';
import { mountPrompts } from './routes/prompts.mjs';
import { mountCharacters } from './routes/characters.mjs';
import { mountRankings } from './routes/rankings.mjs';

const app = express();
app.use(express.json());

// 헬스체크
app.get('/api/ping', (req, res) => res.json({ ok: true }));

// 라우트 모듈 장착
// [수정] 모든 mount 함수에 필요한 인자를 전달합니다.
mountWorlds(app, db, getUserFromReq);
mountPrompts(app, db, getUserFromReq);
mountCharacters(app, db, getUserFromReq);
mountRankings(app, db, getUserFromReq);

export const api = onRequest({ region: 'asia-northeast3' }, app);
