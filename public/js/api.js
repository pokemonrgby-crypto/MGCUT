// public/js/api.js
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-storage.js';

// [수정] getAuth()를 직접 사용하도록 auth 객체 간소화
export const auth = getAuth();

export const storage = {
  async uploadImage(path, file) {
    const storageRef = ref(getStorage(), `${path}/${Date.now()}_${file.name}`);
    const snapshot = await uploadBytes(storageRef, file);
    return await getDownloadURL(snapshot.ref);
  }
};

async function idToken() {
  // [수정] currentUser가 로드될 때까지 기다리거나, 없으면 명확한 에러를 발생시킵니다.
  const user = auth.currentUser;
  if (!user) {
    // Firebase가 초기화 중일 수 있으므로 잠시 대기 후 재시도
    await new Promise(resolve => setTimeout(resolve, 500));
    if (!auth.currentUser) {
      throw new Error('AUTH_USER_NOT_FOUND: 로그인 상태를 확인할 수 없습니다. 페이지를 새로고침하거나 다시 로그인해주세요.');
    }
  }
  return await auth.currentUser.getIdToken(true); // true를 넣어 강제로 토큰을 갱신합니다.
}

async function call(method, path, body, extraHeaders = {}) {
  let token = null;
  try {
    token = await idToken();
  } catch (e) {
    // idToken()에서 발생시킨 에러를 여기서 잡아서 사용자에게 보여줍니다.
    console.error('인증 토큰 획득 실패:', e);
    // [중요] 에러를 다시 던져서 withBlocker 등 상위 로직이 인지하도록 합니다.
    throw e; 
  }

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
    // 401 에러의 경우, 응답이 HTML (Firebase Hosting의 기본 에러 페이지)일 수 있습니다.
    if (res.status === 401) {
        throw new Error('UNAUTHORIZED: 서버로부터 인증 실패 응답을 받았습니다.');
    }
    throw new Error(`NETWORK_NON_JSON: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (res.status === 429) {
    throw new Error(json?.error || 'COOLDOWN');
  }
  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error || `HTTP_${res.status}`);
  }
  return json;
}

export const api = {
  // user key
  saveApiKey: (apiKey) => call('POST', '/api/user/api-key', { apiKey }),

  // worlds
  generateWorld: (payload) => call('POST', '/api/worlds/generate', payload),
  saveWorld: (worldData) => call('POST', '/api/worlds', worldData),
  listWorlds: () => call('GET', '/api/worlds'),
  updateWorldCover: (id, coverUrl) => call('PATCH', `/api/worlds/${id}/cover`, { coverUrl }),
  getWorld: (id) => call('GET', `/api/worlds/${id}`),
  likeWorld: (id) => call('POST', `/api/worlds/${id}/like`),
  createSite: (worldId, siteData) => call('POST', `/api/worlds/${worldId}/sites`, siteData),
  updateSiteImage: (worldId, siteName, imageUrl) => call('PATCH', `/api/worlds/${worldId}/siteImage`, { siteName, imageUrl }),
  addWorldElement: (worldId, type, data) => call('POST', `/api/worlds/${worldId}/elements`, { type, data }),
  deleteWorldElement: (worldId, type, name) => call('DELETE', `/api/worlds/${worldId}/elements`, { type, name }),

  // characters
  generateCharacter: (payload) => call('POST', '/api/characters/generate', payload),
  getCharacter: (id) => call('GET', `/api/characters/${id}`),
  getMyCharacters: () => call('GET', '/api/my-characters'),
  getCharacterBattleLogs: (id) => call('GET', `/api/characters/${id}/battle-logs`),
  updateCharacterImage: (id, imageUrl) => call('PATCH', `/api/characters/${id}/image`, { imageUrl }),
  deleteCharacter: (id) => call('DELETE', `/api/characters/${id}`),
  updateAbilitiesEquipped: (id, chosen) => call('POST', `/api/characters/${id}/abilities`, { chosen }),
  updateItemsEquipped: (id, equipped) => call('POST', `/api/characters/${id}/items`, { equipped }),
  
  // adventures
  startAdventure: (payload) => call('POST', '/api/adventures/start', payload),
  proceedAdventure: (adventureId, payload) => call('POST', `/api/adventures/${adventureId}/proceed`, payload),
  continueAdventure: (adventureId) => call('POST', `/api/adventures/${adventureId}/continue`),
  // [수정] 두 개의 다른 함수로 명확하게 분리
  getCharacterAdventures: (id) => call('GET', `/api/characters/${id}/adventures`),
  getOngoingAdventure: (id) => call('GET', `/api/characters/${id}/adventures/ongoing`),
  getAdventure: (id) => call('GET', `/api/adventures/${id}`),

  // prompts
  getSystemPrompt: (name) => call('GET', `/api/system-prompts/${name}`),
  listPrompts: () => call('GET', '/api/prompts'),
  uploadPrompt: ({ title, content }) => call('POST', '/api/prompts', { title, content }),
  validatePrompt: (id) => call('POST', `/api/prompts/${id}/validate`),
  reportPrompt: (id, reason) => call('POST', `/api/prompts/${id}/report`, { reason }),

  // rankings & matching
  getWorldCharacters: (worldId) => call('GET', `/api/characters?worldId=${encodeURIComponent(worldId)}&sort=elo_desc&limit=50`),
  getCharacterRanking: ({ limit=50 }={}) => call('GET', `/api/rankings/characters?limit=${limit}`),
  getWorldRanking: ({ limit=50 }={}) => call('GET', `/api/rankings/worlds?limit=${limit}`),
  findMatch: (charId) => call('POST', '/api/matchmaking/find', { charId }),
  createBattle: (meId, opId) => call('POST', '/api/battle/create', { meId, opId }),
  battleSimulate: (battleId) => call('POST', '/api/battle/simulate', { battleId }),
};
