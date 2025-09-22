import { auth } from './firebase.mjs';


export async function getUserFromReq(req) {
const h = req.headers['authorization'] || '';
const m = h.match(/^Bearer\s+(.*)$/i);
if (!m) return null;
try {
const decoded = await auth.verifyIdToken(m[1]);
return decoded; // { uid, email, ... }
} catch {
return null;
}
}
