// (수정된 결과)
// functions/lib/adventure-combat-rules.mjs

// --- 기존 규칙 (数値 기반) ---

// 적 난이도별 체력 범위
export const enemyHealthRanges = {
  easy: [60, 80],
  normal: [80, 120],
  hard: [120, 180],
  miniboss: [200, 300],
};

// AI가 사용할 수 있는 상태이상 및 버프/디버프 목록
export const combatEffects = {
  // --- 상태이상 (Debuffs) ---
  poison: { name: '중독', icon: '☠️', type: 'dot', damage: 5, duration: 3, stackable: true, maxStack: 3 },
  bleed: { name: '출혈', icon: '🩸', type: 'dot', damage: 7, duration: 2, stackable: true, maxStack: 3 },
  burn: { name: '화상', icon: '🔥', type: 'dot', damage: 6, duration: 2, stackable: false },
  stun: { name: '기절', icon: '😵', type: 'control', duration: 1, stackable: false },
  def_down: { name: '방어 감소', icon: '🛡️', type: 'stat', stat: 'defense', multiplier: 1.5, duration: 2, stackable: false },
  atk_down: { name: '공격 감소', icon: '⚔️', type: 'stat', stat: 'attack', multiplier: 0.7, duration: 2, stackable: false },
  slow: { name: '둔화', icon: '🐢', type: 'stat', stat: 'speed', value: -10, duration: 3, stackable: true, maxStack: 2 },
  
  // --- 버프 (Buffs) ---
  regeneration: { name: '재생', icon: '🌿', type: 'hot', heal: 8, duration: 3, stackable: true, maxStack: 3 },
  def_up: { name: '방어 증가', icon: '🛡️', type: 'stat', stat: 'defense', multiplier: 0.5, duration: 2, stackable: false },
  atk_up: { name: '공격 증가', icon: '⚔️', type: 'stat', stat: 'attack', multiplier: 1.3, duration: 2, stackable: false },
  haste: { name: '가속', icon: '⚡', type: 'stat', stat: 'speed', value: 15, duration: 3, stackable: false },
  barrier: { name: '보호막', icon: '💠', type: 'shield', amount: 30, duration: 2, stackable: false },
};

// --- 신규 규칙 (텍스트 기반) ---

// 적 난이도별 텍스트 기반 "피해량" 정의
export const damageLevels = {
  player: {
    skill: ['약간의 상처를 입혔다.', '유효한 타격을 주었다.', '치명적인 공격이 들어갔다!'],
    item: ['아이템의 효과는 미미했다.', '아이템이 적의 허점을 만들었다.', '아이템의 힘이 적을 압도했다!'],
  },
  enemy: {
    easy: ['적의 공격은 간신히 피할 수 있었다.', '적에게 공격을 허용했지만, 버틸 만하다.', '꽤 아픈 공격이었다.'],
    normal: ['적의 공격을 막아내기 벅차다.', '강력한 공격에 정신이 혼미해진다.', '위험하다! 강력한 일격에 쓰러질 뻔했다.'],
    hard: ['스치기만 해도 뼈가 울리는 공격이다.', '끔찍한 공격에 시야가 흐려진다.', '방어할 수 없다! 생존을 장담할 수 없는 공격이다.'],
    miniboss: ['존재를 부정당하는 듯한 파괴적인 공격이다.', '모든 것을 포기하고 싶을 정도의 절망적인 공격이다.', '이미 인간의 한계를 초월한 일격이었다.'],
  }
};

// 아이템 등급별 효과 가중치 (텍스트 설명)
export const itemGradeWeights = {
    Common: "평범한 수준의 장비를 갖추고 있습니다.",
    Uncommon: "평균 이상의 쓸만한 장비를 갖추고 있습니다.",
    Rare: "상당히 희귀하고 강력한 장비를 갖추고 있습니다.",
    Epic: "영웅적인 수준의 강력한 장비로 무장했습니다.",
    Legendary: "전설적인 장비들을 착용하여 압도적인 힘을 뿜어냅니다.",
    Mythic: "신화적인 권능이 깃든 장비로, 범접할 수 없는 위용을 자랑합니다.",
    Exotic: "세계의 법칙을 거스르는 불가해한 힘을 지닌 장비를 다룹니다."
};

// --- 공통 규칙 ---

// 도망 성공 확률
export const FLEE_CHANCE = 0.5;
