import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js';

// frame.js 등이 기대하는 auth 래퍼 (onAuthStateChanged/ signOut 등 메서드 보유)
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
  headers['x-gemini-key'] = localStorage.getItem('GEMINI_KEY') || '';

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
  // worlds
  saveWorld: (worldData) => call('POST', '/api/worlds', worldData),
  listWorlds: () => call('GET', '/api/worlds'),
  updateWorldCover: (id, coverUrl) => call('PATCH', `/api/worlds/${id}/cover`, { coverUrl }),


    // [신규] 단일 세계관 정보 가져오기
  getWorld: (id) => call('GET', `/api/worlds/${id}`),
  // [신규] 세계관 좋아요 토글
  likeWorld: (id) => call('POST', `/api/worlds/${id}/like`),
  // [신규] 내 캐릭터 목록 가져오기
  getMyCharacters: () => call('GET', '/api/my-characters'),

  // characters
  createCharacter: ({ worldId, promptId, customPrompt, userInput }) =>
    call('POST', '/api/characters/create', { worldId, promptId, customPrompt, userInput }),

  // prompts
  // [신규] 시스템 프롬프트 가져오기
  getSystemPrompt: (name) => call('GET', `/api/system-prompts/${name}`),
  listPrompts: () => call('GET', '/api/prompts'),
  uploadPrompt: ({ title, content }) => call('POST', '/api/prompts', { title, content }),
  validatePrompt: (id) => call('POST', `/api/prompts/${id}/validate`),
  reportPrompt: (id, reason) => call('POST', `/api/prompts/${id}/report`, { reason }),
};
