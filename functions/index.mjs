// (기존 내용과 동일)
// functions/index.mjs
import express from 'express';
import { onRequest } from 'firebase-functions/v2/https';

import { db } from './lib/firebase.mjs'; // [수정] db import 추가
import { getUserFromReq } from './lib/auth.mjs'; // [수정] getUserFromReq import 추가

import { mountWorlds } from './routes/worlds.mjs';
import { mountPrompts } from './routes/prompts.mjs';
import { mountCharacters } from './routes/characters.mjs';
import { mountRankings } from './routes/rankings.mjs';

const app = express();
app.use(express.json());

// 헬스체크
app.get('/api/ping', (req, res) => res.json({ ok: true }));

// 라우트 모듈 장착
mountWorlds(app);
mountPrompts(app);
// [수정] mountCharacters 함수에 db와 getUserFromReq를 전달합니다.
mountCharacters(app, db, getUserFromReq);
mountRankings(app);

export const api = onRequest({ region: 'asia-northeast3' }, app);
