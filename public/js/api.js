import {
  getAuth,
  // ... (기존 import와 동일)
} from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js';

export const auth = {
  // ... (기존 auth 객체와 동일)
};

async function idToken() { /* ... */ }
async function call(method, path, body) { /* ... */ }

export const api = {
  // worlds
  saveWorld: (worldData) => call('POST', '/api/worlds', worldData),
  listWorlds: () => call('GET', '/api/worlds'),
  updateWorldCover: (id, coverUrl) => call('PATCH', `/api/worlds/${id}/cover`, { coverUrl }),
  getWorld: (id) => call('GET', `/api/worlds/${id}`),
  likeWorld: (id) => call('POST', `/api/worlds/${id}/like`),
  getMyCharacters: () => call('GET', '/api/my-characters'),
  createSite: (worldId, siteData) => call('POST', `/api/worlds/${worldId}/sites`, siteData), // [추가]

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
