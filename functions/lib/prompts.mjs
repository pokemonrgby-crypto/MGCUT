// functions/lib/prompts.mjs
// Firestore configs/prompts 문서에서 불러오되, 없으면 기본값 사용
import admin from 'firebase-admin';

async function tryLoadFromConfigs(key) {
  try {
    const snap = await admin.firestore().collection('configs').doc('prompts').get();
    const data = snap.exists ? snap.data() : null;
    return data?.[key] || null;
  } catch { return null; }
}

export async function loadWorldSystemPrompt() {
  return (
    (await tryLoadFromConfigs('world_system')) ||
`당신은 세계관 설계자입니다. 아래 JSON 스키마로만 답하세요(설명 금지).

{
  "name": "세계 이름",
  "intro": "짧은 한 문단 소개",
  "detail": {
    "lore": "세계의 서사적 배경",
    "sites": [
      { "id": "식별자-케밥", "name": "명소 이름", "description": "설명" }
    ],
    "orgs": [
      { "id": "식별자-케밥", "name": "조직 이름", "description": "설명" }
    ],
    "npcs": [
      { "id": "식별자-케밥", "name": "NPC 이름", "role": "역할/설명" }
    ]
  }
}`
  );
}

export async function loadCharacterBasePrompt() {
  return (
    (await tryLoadFromConfigs('character_base')) ||
`당신은 캐릭터 생성기입니다. 결과는 아래 JSON만 출력(설명/코드펜스 금지).

{
  "name": "문자열",
  "introShort": "짧은 소개",
  "narratives": [
    { "title": "긴 서사 제목", "long": "긴 서사 본문", "short": "짧은 요약" }
  ],
  "abilities": [
    { "name": "능력 이름", "description": "능력 설명" }
  ],
  "chosen": ["선택한 능력 3개(이름 또는 인덱스)"]
}

규칙:
- abilities는 정확히 6개
- chosen은 정확히 3개
- 세계관 요약 텍스트(worldText)와 사용자 입력(userInput)을 반영
`
  );
}
