// functions/lib/adventure-combat-rules.mjs

// 적 난이도별 체력 범위
export const enemyHealthRanges = {
  easy: [60, 80],
  normal: [80, 120],
  hard: [120, 180],
  miniboss: [200, 300],
};

// 스킬 타입별 데미지/회복량 기본 범위
export const skillPowerRanges = {
  attack: [15, 25],
  heal: [20, 30],
  defense: [0.3, 0.5], // 30% ~ 50% 데미지 감소
  special: [10, 20], // 상태이상 등 특수 스킬의 기본 데미지
};

// 상태 이상 효과 정의
export const statusEffects = {
  poison: { name: '중독', icon: '☠️', duration: 3, damage: 5 }, // 매 턴 시작 시 5의 고정 데미지
  def_down: { name: '방어 감소', icon: '🛡️', duration: 2, multiplier: 1.5 }, // 받는 데미지 1.5배
  stun: { name: '기절', icon: '😵', duration: 1 }, // 1턴 동안 행동 불가
};

// 도망 성공 확률 (기본 50%)
export const FLEE_CHANCE = 0.5;
