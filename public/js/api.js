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

// [교체] 응답이 HTML일 때 BAD_JSON 대신 깔끔히 에러 던지기
async function call(method, path, body, extraHeaders = {}) {

  // [추가] Firebase ID 토큰을 Authorization 헤더에 실어 보낸다
  let token = null;
  try { token = await idToken(); } catch {}

  const headers = { ...(extraHeaders||{}) };
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;


const res = await fetch(path, {
  method,
  headers, // 위에서 만든 headers(Authorization / Content-Type / extraHeaders 다 포함)
  body: body ? JSON.stringify(body) : undefined,
  credentials: 'include'
});



  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    // 서버에서 404/에러로 index.html 같은 걸 돌려준 케이스
    const text = await res.text();
    throw new Error(`NETWORK_NON_JSON: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error || `HTTP_${res.status}`);
  }
  return json; // { ok:true, data: ... }
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

  // characters
  saveCharacter: ({ worldId, promptId, characterData, imageUrl }) =>
    call('POST', '/api/characters/save', { worldId, promptId, characterData, imageUrl }),
  getCharacter: (id) => call('GET', `/api/characters/${id}`), // [추가]


  // prompts
  getSystemPrompt: (name) => call('GET', `/api/system-prompts/${name}`),
  listPrompts: () => call('GET', '/api/prompts'),
  uploadPrompt: ({ title, content }) => call('POST', '/api/prompts', { title, content }),
  validatePrompt: (id) => call('POST', `/api/prompts/${id}/validate`),
  reportPrompt: (id, reason) => call('POST', `/api/prompts/${id}/report`, { reason }),


// 세계관에 소속된 캐릭터를 Elo 내림차순으로
getWorldCharacters: (worldId) =>
  call('GET', `/api/characters?worldId=${encodeURIComponent(worldId)}&sort=elo_desc&limit=50`),

// 랭킹 탭
getCharacterRanking: ({ limit=50 }={}) =>
  call('GET', `/api/rankings/characters?limit=${limit}`),

getWorldRanking: ({ limit=50 }={}) =>
  call('GET', `/api/rankings/worlds?limit=${limit}`),

findMatch: (charId) => call('POST', '/api/matchmaking/find', { charId }),


  // skills/items 저장
  updateAbilitiesEquipped: (id, chosen /* string[] 또는 number[] */) =>
    call('POST', `/api/characters/${encodeURIComponent(id)}/abilities`, { chosen }),

  updateItemsEquipped: (id, equipped /* (string|null)[] 길이=3 */) =>
    call('POST', `/api/characters/${encodeURIComponent(id)}/items`, { equipped }),

  // 배틀 준비/턴
  createBattle: (meId, opId) =>
    call('POST', '/api/battle/create', { meId, opId }),


  battleSimulate: (battleId, userApiKey) =>
    call('POST', '/api/battle/simulate', { battleId }, { 'X-User-Api-Key': userApiKey || '' }),

    
// Elo 매치(선택 기능)
reportMatch: (aId, bId, result /* 'A'|'B'|'DRAW' */) =>
  call('POST', `/api/match`, { aId, bId, result }),
};
