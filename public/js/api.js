import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js';

async function idToken() {
  const auth = getAuth();
  const u = auth.currentUser;
  return u ? await u.getIdToken() : null;
}

async function call(method, path, body) {
  const headers = { 'content-type': 'application/json' };
  const t = await idToken();
  if (t) headers['authorization'] = 'Bearer ' + t;

  const res = await fetch(path, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(()=>({ ok:false, error:'BAD_JSON' }));
  if (!res.ok || !json.ok) throw new Error(json.error || res.statusText);
  return json;
}

export const api = {
  listWorlds: () => call('GET', '/api/worlds'),
  getWorld: (id) => call('GET', `/api/worlds/${id}`),
  createWorld: (payload) => call('POST', '/api/worlds/create', payload),
  likeWorld: (id) => call('POST', `/api/worlds/${id}/like`)
};
