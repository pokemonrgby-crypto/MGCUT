// functions/lib/gemini.mjs
export const MODEL_POOL = [
  'models/gemini-2.5-flash',
  'models/gemini-2.0-flash',
  'models/gemini-2.5-flash-lite',
  'models/gemini-2.0-flash-lite',
];

export function pickModels() {
  const arr = [...MODEL_POOL].sort(() => 0.5 - Math.random());
  return { primary: arr[0], fallback: arr[1] || arr[0] };
}

function stripFences(s = '') {
  return String(s)
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

export function extractJson(text = '') {
  const m = text.match(/```json([\s\S]*?)```/i) || text.match(/{[\s\S]*}$/);
  if (!m) return null;
  try { return JSON.parse(stripFences(m[1] || m[0])); } catch { return null; }
}

/**
 * Gemini 호출 (텍스트 전용)
 * @param {object} p
 * @param {string} p.key - API Key (헤더 x-gemini-key 우선)
 * @param {string} p.model - models/gemini-...
 * @param {string} [p.system] - 시스템 프롬프트
 * @param {string} p.user - 유저 프롬프트
 * @returns {Promise<{text:string,json:any,raw:any}>}
 */
export async function callGemini({ key, model, system, user, responseMimeType = "application/json" }) {
  if (!key) throw new Error('GEMINI_API_KEY_REQUIRED');
  
  const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      responseMimeType: responseMimeType,
    }
  };
  if (system) body.systemInstruction = { role: 'system', parts: [{ text: system }] };

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  
  const data = await r.json();
  if (!r.ok) {
      console.error('Gemini API Error:', data);
      throw new Error(data?.error?.message || `Gemini HTTP ${r.status}`);
  }

  const text =
    data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('\n').trim() ||
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    '';
    
  if (responseMimeType === "application/json") {
      const json = extractJson(text);
      return { text, json, raw: data };
  }
  return { text, json: null, raw: data }; // JSON이 아닐 경우
}
