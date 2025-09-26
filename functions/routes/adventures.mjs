// functions/routes/adventures.mjs
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/firebase.mjs';
import { getUserFromReq } from '../lib/auth.mjs';
import { callGemini, MODEL_POOL } from '../lib/gemini.mjs';
import { checkAndUpdateCooldown } from '../lib/cooldown.mjs';
import { getApiKeySecret } from '../lib/secret-manager.mjs';
import { preRollEvent } from '../lib/adventure-events.mjs';
import { randomUUID } from 'crypto';
import { enemyHealthRanges, combatEffects, FLEE_CHANCE } from '../lib/adventure-combat-rules.mjs';

// --- 헬퍼 함수 ---
async function getApiKeyForUser(uid) {
    const apiKey = await getApiKeySecret(uid);
    if (!apiKey) throw new Error('API_KEY_NOT_FOUND: 내 정보 탭에서 API 키를 먼저 등록해주세요.');
    return apiKey;
}

function getRandomInRange(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// --- 프롬프트 생성 함수 ---

/**
 * [수정] 선택지와 그 결과를 한 번에 생성하는 프롬프트
 */
function getNextNodePrompt(context, site, history) {
    const historyLog = history.length > 0 ? `# 이전 기록\n${history.map(h => `- ${h}`).join('\n')}` : '';
    const preRolledEvent = preRollEvent(site.difficulty);
    let eventInstruction = '';

    switch (preRolledEvent.type) {
        case 'FIND_ITEM':
            eventInstruction = `[아이템 발견] 이벤트: ${preRolledEvent.tier} 등급 아이템을 발견하는 상황을 묘사하세요.`;
            break;
        case 'ENCOUNTER_ENEMY_EASY':
        case 'ENCOUNTER_ENEMY_NORMAL':
        case 'ENCOUNTER_ENEMY_HARD':
        case 'ENCOUNTER_MINIBOSS':
            const difficulty = preRolledEvent.type.split('_').pop();
            eventInstruction = `[전투] 이벤트: 현재 세계관 컨셉에 어울리는 '${difficulty}' 난이도의 적(enemy)을 구체적으로 설정하고, 그 적과 조우하는 상황을 묘사하세요. 이 이벤트의 "choices" 배열에는 반드시 {"text": "전투 시작", "result": "전투를 준비합니다.", "action": "enter_battle"} 객체 하나만 포함해야 합니다.`;
            break;
        case 'TRIGGER_TRAP':
            eventInstruction = `[함정] 이벤트: 캐릭터가 스태미나를 잃는 함정을 발동시킵니다.`;
            break;
        default:
            eventInstruction = `[서사] 이벤트: 특별한 사건 없이 탐험이 계속되는 서술형 이벤트를 진행합니다.`;
    }

    return `
# 역할: TRPG 마스터(GM)
# 정보
- 세계관: ${context.world.name} (${context.world.introShort})
- 캐릭터: ${context.character.name} (현재 체력: ${context.characterState.stamina}/100)
- 탐험 장소: ${site.name} (난이도: ${site.difficulty})
${historyLog}

# 임무: 이전 기록을 바탕으로 다음 상황을 자연스럽게 연결하여, 아래 규칙에 따라 JSON 객체 하나를 생성하세요.
- **지정 이벤트**: ${eventInstruction}

# 규칙
1. 'situation'은 최소 3문장 이상으로 감각적인 묘사를 풍부하게 사용하세요.
2. 'choices'는 2~3개의 흥미로운 선택지를 제공하고, 각 선택지에 대한 'result'를 1~2문장으로 작성하세요.
3. JSON 구조:
   {
     "type": "이벤트 타입 (item, combat, trap, narrative)",
     "situation": "현재 상황에 대한 상세한 묘사",
     "choices": [
       { "text": "선택지 1의 내용", "result": "선택지 1을 골랐을 때의 결과 서술" },
       { "text": "선택지 2의 내용", "result": "선택지 2를 골랐을 때의 결과 서술" }
     ],
     "enemy": { "name": "...", "description": "...", "difficulty": "${preRolledEvent.type.split('_').pop()?.toLowerCase() || 'normal'}" },
     "item": { "name": "...", "description": "...", "grade": "..." },
     "penalty": { "stat": "stamina", "value": -15 }
   }
   - 'enemy', 'item', 'penalty' 필드는 해당 타입일 때만 포함하세요.
   - 'action' 필드는 'enter_battle'과 같이 특별한 동작이 필요할 때만 choices 객체에 포함시키세요.
   - 설명이나 코드 펜스 없이 순수 JSON 객체만 출력하세요.`;
}


function getCombatTurnPrompt(combatState, action) {
    // (기존 코드와 동일)
    const { player, enemy, log } = combatState;
    const actionSource = action.type === 'skill' ? player.skills.find(s => s.id === action.id) : player.items.find(i => i.id === action.id);
    const lastLogs = log.slice(-5).join('\n');

    const effectList = Object.entries(combatEffects).map(([key, val]) => `- ${key}: ${val.name} (${val.stackable ? '중첩 가능' : '중첩 불가'})`).join('\n');

    return `
# 역할: 창의적이고 균형감 있는 TRPG 전투 마스터(GM)
# 현재 전투 상황
- 플레이어: ${player.name} (HP: ${player.health}/${player.maxHealth}, 상태: ${player.status.map(s=>s.name).join(', ')||'없음'})
- 적: ${enemy.name} (HP: ${enemy.health}/${enemy.maxHealth}, 상태: ${enemy.status.map(s=>s.name).join(', ')||'없음'})
- 최근 로그: ${lastLogs}
- 플레이어의 행동: "${actionSource.name}" (${actionSource.description}) 사용

# 임무: 플레이어의 행동에 대한 결과를 아래 JSON 형식에 맞춰 생성해줘.
{
  "description": "플레이어의 행동과 그 결과를 1~2 문장의 흥미진진한 묘사로 서술.",
  "effects": [
    {
      "target": "player" | "enemy",
      "type": "damage" | "heal" | "status" | "shield",
      "value": 숫자 (damage는 음수, heal/shield는 양수),
      "effectType": "${Object.keys(combatEffects).join(' | ')}",
      "duration": 숫자 (status 효과의 지속 턴)
    }
  ],
  "enemyActionDescription": "적의 반격 또는 행동에 대한 1문장 묘사.",
  "enemyEffects": [
      { "target": "player", ... }
  ]
}

# 규칙
1.  **결과 생성**: 행동의 이름과 설명, 현재 상황을 종합적으로 고려하여 결과를 창의적으로 생성해줘. (예: '화염구' 스킬을 물의 정령에게 쓰면 데미지가 감소하고 '증기 발생' 같은 특수 효과를 부여)
2.  **효과 적용**:
    * \`effects\`: 플레이어 행동의 직접적인 결과.
    * \`enemyEffects\`: 적의 반격 결과.
    * \`damage\`는 항상 음수, \`heal\`과 \`shield\`는 항상 양수로 표현.
    * \`status\` 타입의 경우, \`effectType\`에 아래 목록 중 하나를 명시하고 \`duration\`을 설정.
3.  **밸런스**: 플레이어가 너무 강력하거나 약해지지 않도록 효과 수치를 적절히 조절. 적의 난이도(${enemy.difficulty})를 고려할 것.
4.  **효과 목록**: ${effectList}
5.  **출력**: 설명이나 코드 펜스 없이 순수 JSON 객체만 출력.
`;
}


function applyEffects(combatState, effects, turnLog, sourceName) {
    if (!Array.isArray(effects)) return;

    for (const effect of effects) {
        const target = effect.target === 'player' ? combatState.player : combatState.enemy;
        if (!target) continue;

        switch (effect.type) {
            case 'damage':
                let finalDamage = Math.abs(effect.value) || 0;
                // 방어 증가 효과 적용
                const defUp = target.status.find(s => s.type === 'def_up' && s.duration > 0);
                if (defUp) {
                    finalDamage = Math.round(finalDamage * defUp.multiplier);
                    turnLog.push(`  L ${target.name}의 방어력 증가 효과로 피해가 ${finalDamage}로 감소했다!`);
                }
                // 보호막 효과 적용
                const barrier = target.status.find(s => s.type === 'barrier' && s.duration > 0 && s.amount > 0);
                if (barrier) {
                    const absorbed = Math.min(barrier.amount, finalDamage);
                    barrier.amount -= absorbed;
                    finalDamage -= absorbed;
                    turnLog.push(`  L ${target.name}의 보호막이 ${absorbed}의 피해를 흡수했다! (남은 보호막: ${barrier.amount})`);
                }
                target.health = Math.max(0, target.health - finalDamage);
                turnLog.push(`  L ${target.name}은(는) ${finalDamage}의 피해를 입었다. (HP: ${target.health})`);
                break;

            case 'heal':
                const healAmount = effect.value || 0;
                target.health = Math.min(target.maxHealth, target.health + healAmount);
                turnLog.push(`  L ${target.name}의 체력이 ${healAmount}만큼 회복되었다. (HP: ${target.health})`);
                break;
            
            case 'shield':
                const shieldAmount = effect.value || 0;
                const existingShield = target.status.find(s => s.type === 'barrier');
                if (existingShield) {
                    existingShield.amount += shieldAmount;
                    existingShield.duration = Math.max(existingShield.duration, effect.duration || 2);
                } else {
                    target.status.push({ ...combatEffects.barrier, amount: shieldAmount, duration: effect.duration || 2 });
                }
                turnLog.push(`  L ${target.name}에게 ${shieldAmount}의 보호막이 생겼다.`);
                break;

            case 'status':
                const effectTemplate = combatEffects[effect.effectType];
                if (!effectTemplate) continue;
                
                const existingEffect = target.status.find(s => s.type === effect.effectType);
                if (existingEffect && effectTemplate.stackable) {
                    if (existingEffect.stack < (effectTemplate.maxStack || 3)) {
                        existingEffect.stack = (existingEffect.stack || 1) + 1;
                        existingEffect.duration = Math.max(existingEffect.duration, effect.duration);
                        turnLog.push(`  L ${target.name}의 ${effectTemplate.name} 효과가 중첩되었다! (x${existingEffect.stack})`);
                    } else {
                         turnLog.push(`  L ${target.name}의 ${effectTemplate.name} 효과가 최대 중첩 상태다.`);
                    }
                } else if (!existingEffect) {
                    target.status.push({ ...effectTemplate, type: effect.effectType, duration: effect.duration, stack: 1 });
                    turnLog.push(`  L ${target.name}은(는) ${effectTemplate.name} 효과에 걸렸다!`);
                }
                break;
        }
    }
}


// --- API 엔드포인트 ---
export function mountAdventures(app) {

    // ... (다른 엔드포인트들은 기존 코드와 동일)
    // 모험 시작
    app.post('/api/adventures/start', async (req, res) => {
        try {
            const user = await getUserFromReq(req);
            if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
            const { characterId, worldId, siteName } = req.body;

            await checkAndUpdateCooldown(db, user.uid, `startAdventure:${characterId}`, 60);

            const geminiKey = await getApiKeyForUser(user.uid);
            const charSnap = await db.collection('characters').doc(characterId).get();
            if (!charSnap.exists) throw new Error('CHARACTER_NOT_FOUND');
            const worldSnap = await db.collection('worlds').doc(worldId).get();
            if (!worldSnap.exists) throw new Error('WORLD_NOT_FOUND');
            
            const worldData = worldSnap.data();
            const site = worldData?.sites?.find(s => s.name === siteName);
            if (!site) return res.status(404).json({ ok: false, error: 'SITE_NOT_FOUND' });

            const batch = db.batch();
            const existingAdventures = await db.collection('adventures').where('characterId', '==', characterId).where('status', '==', 'ongoing').get();
            existingAdventures.forEach(doc => batch.delete(doc.ref));
            await batch.commit();

            const context = { character: charSnap.data(), world: {name: worldData.name, introShort: worldData.introShort }, characterState: { stamina: 100 } };
            const firstNodePrompt = getNextNodePrompt(context, site, ["탐험을 시작했다."]);
            const { json: firstNode } = await callGemini({ key: geminiKey, model: MODEL_POOL[0], user: firstNodePrompt });
            if (!firstNode || !firstNode.situation) throw new Error("Failed to generate initial node.");

            const adventureRef = db.collection('adventures').doc();
            await adventureRef.set({
                ownerUid: user.uid, characterId, worldId, siteName, site,
                status: 'ongoing', createdAt: FieldValue.serverTimestamp(),
                characterState: { stamina: 100 },
                history: ["탐험을 시작했다."],
                currentNode: firstNode,
                modelIndex: 1,
            });

            res.json({ ok: true, data: { adventureId: adventureRef.id } });
        } catch (e) {
            console.error('Adventure start error:', e);
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    /**
     * [수정] 선택지 진행 로직 변경
     * - AI 호출을 한 번으로 줄여서 다음 노드를 미리 생성합니다.
     * - 더 이상 선택에 대한 결과를 생성하기 위해 AI를 호출하지 않습니다.
     */
    app.post('/api/adventures/:id/proceed', async (req, res) => {
        try {
            const user = await getUserFromReq(req);
            if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
            await checkAndUpdateCooldown(db, user.uid, 'proceedAdventure', 10);

            const { choice } = req.body;
            const adventureId = req.params.id;
            const ref = db.collection('adventures').doc(adventureId);
            const snap = await ref.get();
            if (!snap.exists) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
            
            const adventure = snap.data();
            const lastNode = adventure.currentNode;
            
            // 사용자가 선택한 choice 객체를 찾고, 미리 생성된 result를 가져옵니다.
            const chosenOption = lastNode.choices.find(c => c.text === choice);
            if (!chosenOption) throw new Error("Invalid choice selected.");
            const resultText = chosenOption.result;
            
            const newHistoryEntry = `[선택: ${choice}] -> [결과: ${resultText}]`;
            const updatedHistory = [...adventure.history, newHistoryEntry];
            let updatedCharacterState = { ...adventure.characterState };
            
            // 이전 노드의 이벤트 타입에 따라 캐릭터 상태 변경
            let newItem = null;
            if (lastNode.type === 'trap' && lastNode.penalty) {
                updatedCharacterState.stamina = Math.max(0, updatedCharacterState.stamina + (lastNode.penalty.value || 0));
            }
            if (lastNode.type === 'item' && lastNode.item) {
                newItem = { ...lastNode.item, id: randomUUID() };
                await db.collection('characters').doc(adventure.characterId).update({ items: FieldValue.arrayUnion(newItem) });
            }

            // 다음 노드를 생성하기 위해 AI 호출
            const geminiKey = await getApiKeyForUser(user.uid);
            const charSnap = await db.collection('characters').doc(adventure.characterId).get();
            const worldSnap = await db.collection('worlds').doc(adventure.worldId).get();
            const worldData = worldSnap.data();

            const nextNodeContext = { 
                character: charSnap.data(), 
                world: {name: worldData.name, introShort: worldData.introShort }, 
                characterState: updatedCharacterState 
            };

            const nextModel = MODEL_POOL[adventure.modelIndex % MODEL_POOL.length];
            const nextNodePrompt = getNextNodePrompt(nextNodeContext, adventure.site, updatedHistory);
            const { json: nextNode } = await callGemini({ key: geminiKey, model: nextModel, user: nextNodePrompt });
            if (!nextNode || !nextNode.situation) throw new Error("Failed to generate next node.");
            
            // DB 업데이트: 현재 선택 결과(lastResult)와 미리 생성된 다음 노드(currentNode)를 함께 저장
            await ref.update({
                currentNode: nextNode,
                characterState: updatedCharacterState,
                history: updatedHistory,
                lastResult: resultText,
                modelIndex: adventure.modelIndex + 1,
                updatedAt: FieldValue.serverTimestamp(),
            });

            res.json({ ok: true, data: { newItem, newCharacterState: updatedCharacterState, result: resultText } });
        } catch (e) {
            console.error('Adventure proceed error:', e);
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/adventures/:id/next', async(req, res) => {
        try {
            const user = await getUserFromReq(req);
            if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
            const ref = db.collection('adventures').doc(req.params.id);
            await ref.update({ lastResult: FieldValue.delete() });
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ ok: false, error: String(e) });
        }
    });

    // 전투 시작
    app.post('/api/adventures/:id/start-combat', async (req, res) => {
        try {
            const user = await getUserFromReq(req);
            if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
            const { enemy } = req.body;
            const adventureRef = db.collection('adventures').doc(req.params.id);
            const snap = await adventureRef.get();
            if (!snap.exists) return res.status(404).json({ ok: false, error: 'ADVENTURE_NOT_FOUND' });

            const adventure = snap.data();
            const charSnap = await db.collection('characters').doc(adventure.characterId).get();
            const character = charSnap.data();

            const combatSkills = (character.abilities || []).filter(a => (character.chosen || []).includes(a.id));
            const combatItems = (character.items || []).filter(i => (character.equipped || []).includes(i.id));

            const healthRange = enemyHealthRanges[enemy.difficulty] || enemyHealthRanges.normal;
            const enemyMaxHealth = getRandomInRange(healthRange[0], healthRange[1]);

            const combatState = {
                status: 'ongoing',
                player: { 
                    name: character.name, 
                    health: 100, maxHealth: 100,
                    skills: combatSkills, items: combatItems,
                    status: [],
                },
                enemy: { 
                    ...enemy, 
                    health: enemyMaxHealth, maxHealth: enemyMaxHealth,
                    status: [],
                },
                turn: 'player',
                log: [`${enemy.name}(이)가 나타났다!`],
            };

            await adventureRef.update({ combatState, status: 'combat' });
            res.json({ ok: true, data: { combatState } });
        } catch (e) {
            console.error('Error starting combat:', e);
            res.status(500).json({ ok: false, error: e.message });
        }
    });
    
    // 전투 턴 진행
    app.post('/api/adventures/:id/combat-turn', async (req, res) => {
        try {
            const user = await getUserFromReq(req);
            if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
            const { action } = req.body;
            const adventureRef = db.collection('adventures').doc(req.params.id);
            const snap = await adventureRef.get();
            const adventure = snap.data();
            const combatState = adventure?.combatState;

            if (!combatState || combatState.status !== 'ongoing' || combatState.turn !== 'player') {
                return res.status(400).json({ ok: false, error: 'INVALID_TURN' });
            }

            let turnLog = [];
            combatState.turn = 'processing';

            // --- 1. 턴 시작 및 상태 효과 처리 (양측 모두) ---
            [combatState.player, combatState.enemy].forEach(entity => {
                let stillActiveEffects = [];
                for (const effect of entity.status) {
                    if (effect.type === 'dot' || effect.type === 'hot') {
                        const amount = effect.type === 'dot' ? -(effect.damage * (effect.stack || 1)) : (effect.heal * (effect.stack || 1));
                        entity.health += amount;
                        if(amount > 0) turnLog.push(`  L [효과] ${entity.name}은(는) ${effect.name}으로 체력을 ${amount} 회복했다.`);
                        else turnLog.push(`  L [효과] ${entity.name}은(는) ${effect.name}으로 ${-amount}의 피해를 입었다.`);
                    }
                    effect.duration--;
                    if (effect.duration > 0) stillActiveEffects.push(effect);
                    else turnLog.push(`  L [효과] ${entity.name}의 ${effect.name} 효과가 사라졌다.`);
                }
                entity.status = stillActiveEffects;
                entity.health = Math.max(0, Math.min(entity.maxHealth, entity.health));
            });
            if (combatState.player.health <= 0 || combatState.enemy.health <= 0) {
                 // DoT/HoT 처리 후 전투 종료 검사
            }
            
            // --- 2. 플레이어 행동 처리 (AI 호출) ---
            const isStunned = combatState.player.status.some(s => s.type === 'control' && s.duration > 0);
            if(isStunned) {
                turnLog.push(`[플레이어] 기절해서 움직일 수 없다!`);
            } else if (action.type === 'flee') {
                 if (Math.random() < FLEE_CHANCE) {
                    combatState.status = 'fled';
                    turnLog.push('[플레이어] 성공적으로 도망쳤다!');
                 } else {
                    turnLog.push('[플레이어] 도망에 실패했다!');
                 }
            } else {
                const geminiKey = await getApiKeyForUser(user.uid);
                const model = MODEL_POOL[adventure.modelIndex % MODEL_POOL.length];
                const prompt = getCombatTurnPrompt(combatState, action);
                const { json: turnResult } = await callGemini({ key: geminiKey, model, user: prompt });

                if (!turnResult || !turnResult.description) throw new Error("AI turn generation failed.");

                turnLog.push(`[플레이어] ${turnResult.description}`);
                applyEffects(combatState, turnResult.effects, turnLog, "player");

                // 적의 행동도 AI가 결정
                if (combatState.enemy.health > 0) {
                    turnLog.push(`[적] ${turnResult.enemyActionDescription}`);
                    applyEffects(combatState, turnResult.enemyEffects, turnLog, "enemy");
                }
            }

            // --- 3. 전투 종료 판정 ---
            if (combatState.status === 'ongoing') {
                if (combatState.player.health <= 0) combatState.status = 'lost';
                else if (combatState.enemy.health <= 0) combatState.status = 'won';
            }
            if (combatState.status !== 'ongoing') {
                turnLog.push(`--- 전투 종료: ${combatState.status} ---`);
                // 전투 종료 후 모험 상태 업데이트
                await adventureRef.update({ combatState, status: 'ongoing', currentNode: null }); // 전투 노드 클리어
            } else {
                combatState.turn = 'player'; // 턴 넘기기
            }

            combatState.log.push(...turnLog);
            await adventureRef.update({ 
                combatState, 
                modelIndex: (adventure.modelIndex || 0) + 1 
            });
            res.json({ ok: true, data: { combatState, turnLog } });

        } catch(e) {
            console.error('Error processing combat turn:', e);
            // 에러 발생 시 턴을 다시 플레이어에게 돌려줌
            const snap = await db.collection('adventures').doc(req.params.id).get();
            if (snap.exists) {
                const combatState = snap.data().combatState;
                combatState.turn = 'player';
                await snap.ref.update({ combatState });
            }
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // --- 기존 GET 엔드포인트들 ---
    app.get('/api/adventures/:id', async (req, res) => {
        try {
            const user = await getUserFromReq(req);
            if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
            const ref = db.collection('adventures').doc(req.params.id);
            const snap = await ref.get();
            if (!snap.exists || snap.data().ownerUid !== user.uid) return res.status(404).json({ ok: false, error: 'ADVENTURE_NOT_FOUND' });
            res.json({ ok: true, data: { id: snap.id, ...snap.data() } });
        } catch (e) {
            res.status(500).json({ ok: false, error: String(e) });
        }
    });
    
    app.get('/api/characters/:id/adventures/ongoing', async (req, res) => {
        try {
            const user = await getUserFromReq(req);
            if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
            const characterId = req.params.id;
            const qs = await db.collection('adventures')
                .where('characterId', '==', characterId)
                .where('ownerUid', '==', user.uid)
                .where('status', 'in', ['ongoing', 'combat'])
                .limit(1).get();

            if (qs.empty) return res.json({ ok: true, data: null });
            res.json({ ok: true, data: { id: qs.docs[0].id, ...qs.docs[0].data() } });
        } catch (e) {
            res.status(500).json({ ok: false, error: String(e) });
        }
    });
}
