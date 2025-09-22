import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js';

async function idToken() {
  const auth = getAuth();
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
createWorld: (payload = {}) => call('POST', '/api/worlds/create', payload),

// prompts
listPrompts: () => call('GET', '/api/prompts'),
uploadPrompt: ({ title, content }) => call('POST', '/api/prompts', { title, content }),
validatePrompt: (id) => call('POST', `/api/prompts/${id}/validate`),
reportPrompt: (id, reason) => call('POST', `/api/prompts/${id}/report`, { reason }),

// characters
createCharacter: ({ worldId, promptId, customPrompt, userInput }) =>
  call('POST', '/api/characters/create', { worldId, promptId, customPrompt, userInput }),

// 세계 목록 (공개 최신 30)
listWorlds: () => call('GET', '/api/worlds'),

// 표지 URL 저장 (이미지 업로드 후 호출)
updateWorldCover: (id, coverUrl) => call('PATCH', `/api/worlds/${id}/cover`, { coverUrl }),

  
};

