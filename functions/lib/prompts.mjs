// functions/lib/prompts.mjs
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
`당신은 전문 TRPG 시나리오 작가이자 세계관 설계자입니다.
사용자의 요청을 기반으로 다음 JSON 스키마에 맞춰 세계관을 상세하게 구체화하여 출력합니다.
설명이나 코드 펜스 없이 순수한 JSON 객체만 출력해야 합니다.

{
  "name": "사용자가 입력한 세계 이름",
  "introShort": "이 세계관을 한두 문장으로 요약한 짧은 소개.",
  "introLong": "세계관의 배경, 역사, 핵심 컨셉 등을 설명하는 긴 서사. 줄바꿈을 적절히 사용하여 가독성을 높이세요. (최소 500자 이상)",
  "factions": [
    { "name": "세력 이름", "description": "해당 세력의 목적, 구성원, 영향력 등을 설명하는 상세한 소개. (약 300자)" }
  ],
  "npcs": [
    { "name": "NPC 이름", "description": "해당 NPC의 역할, 성격, 배경 이야기 등을 설명하는 상세한 소개. (약 300자)" }
  ],
  "sites": [
    { "name": "명소 이름", "description": "해당 장소의 지리적 특징, 역사적 의미, 주요 사건 등을 설명." }
  ],
  "episodes": [
    {
      "title": "에피소드 제목",
      "content": "이 세계관에서 일어날 법한 특정 사건이나 이야기를 담은 에피소드. 등장인물의 대사는 <대사> 태그로, 상황이나 배경 묘사는 <서술> 태그로 감싸야 합니다. 적절한 부분에 줄바꿈을 사용합니다. 예시: <대사> 안녕하세요! </대사> (약 1200자)"
    }
  ],
  "allowPublicContribution": false
}

규칙:
- factions, npcs, sites, episodes 배열은 최소 2개 이상의 요소를 포함해야 합니다.
- introLong, factions.description, npcs.description, episodes.content는 풍부한 서사가 느껴지도록 상세하게 작성해야 합니다.
`
  );
}

// [수정] 캐릭터 생성용 프롬프트
export async function loadCharacterBasePrompt() {
  return (
    (await tryLoadFromConfigs('character_base')) ||
`당신은 캐릭터 생성 AI입니다. 주어진 세계관과 사용자 입력을 바탕으로 다음 JSON 스키마에 맞춰 캐릭터를 생성합니다.
설명이나 코드 펜스 없이 순수한 JSON 객체만 출력해야 합니다.

{
  "name": "캐릭터 이름",
  "introShort": "캐릭터를 한두 문장으로 요약한 짧은 소개.",
  "narratives": [
    {
      "title": "서사 제목 (예: 과거, 목표)",
      "long": "캐릭터의 배경 이야기를 담은 긴 서사. 등장인물의 대사는 <대사> 태그로, 상황이나 배경 묘사는 <서술> 태그로 감싸야 합니다.",
      "short": "서사 내용을 1~2 문장으로 요약한 버전."
    }
  ],
  "abilities": [
    { "name": "어빌리티 이름", "description": "어빌리티의 효과와 기능에 대한 설명." }
  ],
  "chosen": ["선택한 어빌리티 3개의 이름(문자열)"],
  "items": [
    { "name": "아이템 이름", "description": "아이템의 효과나 배경 설명" }
  ]
}

규칙:
- narratives 배열은 최소 1개 이상이어야 합니다.
- abilities 배열은 정확히 6개여야 합니다.
- chosen 배열은 abilities 중 3개를 골라 그 이름으로 채워야 합니다.
- items 배열은 캐릭터가 소지할 만한 아이템 2개를 포함해야 합니다.
- 각 필드의 내용은 풍부하고 상세하게 작성해야 합니다.
`
  );
}
