// public/js/lib/gemini-client.js

// [추가] 클라이언트 사이드 모델 풀
const MODEL_POOL = [
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.5-flash-lite',
];

function pickModel() {
  return MODEL_POOL[Math.floor(Math.random() * MODEL_POOL.length)];
}

function stripFences(s = '') {
  return String(s).trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
}

function extractJson(text = '') {
  const m = text.match(/```json([\s\S]*?)```/i) || text.match(/{[\s\S]*}$/);
  if (!m) return null;
  try { return JSON.parse(stripFences(m[1] || m[0])); } catch { return null; }
}

export async function callClientSideGemini({ system, user }) {
  const apiKey = localStorage.getItem('GEMINI_KEY');
  if (!apiKey) {
    throw new Error('Gemini API 키가 필요합니다. 내정보 탭에서 키를 저장해주세요.');
  }

  // [수정] 모델 풀에서 무작위 선택
  const model = pickModel();
  console.log(`Using Gemini Model: ${model}`); // 디버깅용 로그
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  
  const body = {
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      responseMimeType: "application/json",
    }
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const errorData = await r.json().catch(() => ({}));
    const message = errorData?.error?.message || '알 수 없는 오류';
    console.error('Gemini API Error:', errorData);
    throw new Error(`Gemini API 오류 (HTTP ${r.status}): ${message}`);
  }

  const data = await r.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return extractJson(text);
}
