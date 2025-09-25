// functions/lib/adventure-events.mjs

const ITEM_TIERS = {
  C: { name: 'Common', weight: 1000 },
  U: { name: 'Uncommon', weight: 400 },
  R: { name: 'Rare', weight: 150 },
  E: { name: 'Epic', weight: 50 },
  L: { name: 'Legendary', weight: 15 },
  M: { name: 'Mythic', weight: 4 },
  X: { name: 'Exotic', weight: 1 },
};

const probabilityTables = {
  easy: {
    events: { FIND_ITEM: 40, ENCOUNTER_ENEMY_EASY: 20, NOTHING: 40 },
    itemFindRate: 0.8,
    itemTiers: { C: 80, U: 15, R: 5, E: 0, L: 0, M: 0, X: 0 },
  },
  normal: {
    events: { FIND_ITEM: 35, ENCOUNTER_ENEMY_NORMAL: 35, TRIGGER_TRAP: 10, NOTHING: 20 },
    itemFindRate: 0.85,
    itemTiers: { C: 60, U: 25, R: 12, E: 3, L: 0, M: 0, X: 0 },
  },
  hard: {
    events: { FIND_ITEM: 30, ENCOUNTER_ENEMY_NORMAL: 40, ENCOUNTER_ENEMY_HARD: 10, TRIGGER_TRAP: 15, NOTHING: 5 },
    itemFindRate: 0.9,
    itemTiers: { C: 40, U: 30, R: 20, E: 8, L: 2, M: 0, X: 0 },
  },
  extreme: {
    events: { FIND_ITEM: 25, ENCOUNTER_ENEMY_HARD: 50, ENCOUNTER_MINIBOSS: 10, TRIGGER_TRAP: 15 },
    itemFindRate: 0.95,
    itemTiers: { C: 20, U: 30, R: 30, E: 15, L: 4, M: 1, X: 0 },
  },
  impossible: {
    events: { FIND_ITEM: 20, ENCOUNTER_ENEMY_HARD: 40, ENCOUNTER_MINIBOSS: 25, TRIGGER_TRAP: 15 },
    itemFindRate: 1.0,
    itemTiers: { C: 10, U: 25, R: 35, E: 20, L: 7, M: 2, X: 1 },
  },
};

function weightedRandom(table) {
  let totalWeight = 0;
  for (const key in table) {
    totalWeight += table[key];
  }
  let random = Math.random() * totalWeight;
  for (const key in table) {
    if (random < table[key]) {
      return key;
    }
    random -= table[key];
  }
  return Object.keys(table)[0];
}

export function preRollEvent(difficulty = 'normal') {
  const table = probabilityTables[difficulty] || probabilityTables.normal;
  const eventType = weightedRandom(table.events);

  if (eventType === 'FIND_ITEM') {
    if (Math.random() < table.itemFindRate) {
      const itemTierKey = weightedRandom(table.itemTiers);
      const itemTierName = ITEM_TIERS[itemTierKey]?.name || 'Common';
      return { type: 'FIND_ITEM', tier: itemTierName };
    }
    return { type: 'NOTHING', reason: 'item_find_fail' };
  }

  return { type: eventType };
}
