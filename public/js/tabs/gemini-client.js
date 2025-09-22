// public/js/lib/gemini-client.js

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

  // 모델은 우선 flash로 고정
  const model = 'gemini-1.5-flash-latest';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  
  const body = {
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      responseMimeType: "application/json",
    }
  };
  if (system) body.systemInstruction = { role: 'system', parts: [{ text: system }] };

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const errorData = await r.json().catch(() => ({}));
    throw new Error(`Gemini API 오류 (HTTP ${r.status}): ${errorData?.error?.message || '알 수 없는 오류'}`);
  }

  const data = await r.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return extractJson(text);
}
