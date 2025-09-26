// functions/lib/adventure-combat-rules.mjs

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

// 도망 성공 확률
export const FLEE_CHANCE = 0.5;
