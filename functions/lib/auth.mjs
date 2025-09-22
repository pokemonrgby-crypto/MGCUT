import { auth } from './firebase.mjs';

export async function getUserFromReq(req) {
  const h = req.headers['authorization'] || '';
  const m = h.match(/^Bearer\s+(.*)$/i);
  if (!m) return null;
  try {
    return await auth.verifyIdToken(m[1]); // { uid, email, ... }
  } catch {
    return null;
  }
}
