// public/js/api.js
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-storage.js';

export const auth = {
  get currentUser(){ return getAuth().currentUser; },
  onAuthStateChanged(cb){ return onAuthStateChanged(getAuth(), cb); },
  async signOut(){ return signOut(getAuth()); },
  async signInWithGoogle(){
    const provider = new GoogleAuthProvider();
    return signInWithPopup(getAuth(), provider);
  },
};

export const storage = {
  async uploadImage(path, file) {
    const storageRef = ref(getStorage(), `${path}/${Date.now()}_${file.name}`);
    const snapshot = await uploadBytes(storageRef, file);
    return await getDownloadURL(snapshot.ref);
  }
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
  updateSiteImage: (worldId, siteName, imageUrl) => call('PATCH', `/api/worlds/${worldId}/siteImage`, { siteName, imageUrl }),
  addWorldElement: (worldId, type, data) => call('POST', `/api/worlds/${worldId}/elements`, { type, data }),
  deleteWorldElement: (worldId, type, name) => call('DELETE', `/api/worlds/${worldId}/elements`, { type, name }),
  getWorldCharacters: (worldId) => call('GET', `/api/worlds/${worldId}/characters`), // [추가]

  // characters
  saveCharacter: ({ worldId, promptId, characterData, imageUrl }) =>
    call('POST', '/api/characters/save', { worldId, promptId, characterData, imageUrl }),
  getCharacter: (id) => call('GET', `/api/characters/${id}`), // [추가]
  updateElo: (winnerId, loserId) => call('POST', '/api/characters/elo', { winnerId, loserId }), // [추가]


  // prompts
  getSystemPrompt: (name) => call('GET', `/api/system-prompts/${name}`),
  listPrompts: () => call('GET', '/api/prompts'),
  uploadPrompt: ({ title, content }) => call('POST', '/api/prompts', { title, content }),
  validatePrompt: (id) => call('POST', `/api/prompts/${id}/validate`),
  reportPrompt: (id, reason) => call('POST', `/api/prompts/${id}/report`, { reason }),

  // [신규] rankings
  // [추가] 캐릭터 단건/목록/랭킹/매치
  getCharacter: (id) => call('GET', `/api/characters/${id}`),
  listCharacters: (params={}) => {
    const q = new URLSearchParams(params).toString();
    return call('GET', `/api/characters${q ? `?${q}` : ''}`);
   },
  getCharacterRanking: ({ limit=50 }={}) => call('GET', `/api/rankings/characters?limit=${limit}`),
  getWorldRanking: ({ limit=50 }={}) => call('GET', `/api/rankings/worlds?limit=${limit}`),
  reportMatch: (aId, bId, result /* 'A'|'B'|'DRAW' */) => call('POST', `/api/match`, { aId, bId, result }),

};
