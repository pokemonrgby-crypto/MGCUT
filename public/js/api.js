import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js';

export const auth = {
  get currentUser(){ return getAuth().currentUser; },
  onAuthStateChanged(cb){ return onAuthStateChanged(getAuth(), cb); },
  async signOut(){ return signOut(getAuth()); },
  async signInWithGoogle(){
    const provider = new GoogleAuthProvider();
    return signInWithPopup(getAuth(), provider);
  },
};

async function idToken() {
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
  if (!res.ok || !json.ok) throw new Error(json.error || json.details?.join(', ') || res.statusText);
  return json;
}

export const api = {
  // worlds
  saveWorld: (worldData) => call('POST', '/api/worlds', worldData),
  listWorlds: () => call('GET', '/api/worlds'),
  updateWorldCover: (id, coverUrl) => call('PATCH', `/api/worlds/${id}/cover`, { coverUrl }),
  getWorld: (id) => call('GET', `/api/worlds/${id}`),
  likeWorld: (id) => call('POST', `/api/worlds/${id}/like`),
  getMyCharacters: () => call('GET', '/api/my-characters'),
  createSite: (worldId, siteData) => call('POST', `/api/worlds/${worldId}/sites`, siteData),

  // characters
  saveCharacter: ({ worldId, promptId, characterData }) =>
    call('POST', '/api/characters/save', { worldId, promptId, characterData }),

  // prompts
  getSystemPrompt: (name) => call('GET', `/api/system-prompts/${name}`),
  listPrompts: () => call('GET', '/api/prompts'),
  uploadPrompt: ({ title, content }) => call('POST', '/api/prompts', { title, content }),
  validatePrompt: (id) => call('POST', `/api/prompts/${id}/validate`),
  reportPrompt: (id, reason) => call('POST', `/api/prompts/${id}/report`, { reason }),
};
