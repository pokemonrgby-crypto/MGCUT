// (수정된 결과)
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

async function call(method, path, body, extraHeaders = {}) {
  let token = null;
  try { token = await idToken(); } catch {}

  const headers = { ...(extraHeaders||{}) };
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  

  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    throw new Error(`NETWORK_NON_JSON: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  // [수정] 쿨타임 에러(429) 처리 추가
  if (res.status === 429) {
    throw new Error('COOLDOWN');
  }
  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error || `HTTP_${res.status}`);
  }
  return json;
}


export const api = {
  // worlds
  generateWorld: (payload, geminiKey) => call('POST', '/api/worlds/generate', { ...payload, geminiKey }),
  listWorlds: () => call('GET', '/api/worlds'),
  updateWorldCover: (id, coverUrl) => call('PATCH', `/api/worlds/${id}/cover`, { coverUrl }),
  getWorld: (id) => call('GET', `/api/worlds/${id}`),
  likeWorld: (id) => call('POST', `/api/worlds/${id}/like`),
  getMyCharacters: () => call('GET', '/api/my-characters'),
  createSite: (worldId, siteData) => call('POST', `/api/worlds/${worldId}/sites`, siteData),
  updateSiteImage: (worldId, siteName, imageUrl) => call('PATCH', `/api/worlds/${worldId}/siteImage`, { siteName, imageUrl }),
  addWorldElement: (worldId, type, data, geminiKey) => call('POST', `/api/worlds/${worldId}/elements`, { type, data, geminiKey }),
  deleteWorldElement: (worldId, type, name) => call('DELETE', `/api/worlds/${worldId}/elements`, { type, name }),

  // characters
    generateCharacter: (payload, geminiKey) => call('POST', '/api/characters/generate', { ...payload, geminiKey }),
  getCharacter: (id) => call('GET', `/api/characters/${id}`),
  getCharacterBattleLogs: (id) => call('GET', `/api/characters/${id}/battle-logs`), // [추가] 이 줄을 추가하세요.
  updateCharacterImage: (id, imageUrl) => call('PATCH', `/api/characters/${id}/image`, { imageUrl }),
  deleteCharacter: (id) => call('DELETE', `/api/characters/${id}`),


  // prompts
  getSystemPrompt: (name) => call('GET', `/api/system-prompts/${name}`),
  listPrompts: () => call('GET', '/api/prompts'),
  uploadPrompt: ({ title, content }) => call('POST', '/api/prompts', { title, content }),
  validatePrompt: (id) => call('POST', `/api/prompts/${id}/validate`),
  reportPrompt: (id, reason) => call('POST', `/api/prompts/${id}/report`, { reason }),

  getWorldCharacters: (worldId) => call('GET', `/api/characters?worldId=${encodeURIComponent(worldId)}&sort=elo_desc&limit=50`),
  getCharacterRanking: ({ limit=50 }={}) => call('GET', `/api/rankings/characters?limit=${limit}`),
  getWorldRanking: ({ limit=50 }={}) => call('GET', `/api/rankings/worlds?limit=${limit}`),
  
  findMatch: (charId) => call('POST', '/api/matchmaking/find', { charId }),
  createBattle: (meId, opId) => call('POST', '/api/battle/create', { meId, opId }),
   battleSimulate: (battleId, geminiKey) => call('POST', '/api/battle/simulate', { battleId, geminiKey }),


  updateAbilitiesEquipped: (id, chosen) => call('POST', `/api/characters/${id}/abilities`, { chosen }),
  updateItemsEquipped: (id, equipped) => call('POST', `/api/characters/${id}/items`, { equipped }),
};
