// functions/routes/adventures.mjs
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/firebase.mjs';
import { getUserFromReq } from '../lib/auth.mjs';
import { callGemini, MODEL_POOL } from '../lib/gemini.mjs';
import { checkAndUpdateCooldown } from '../lib/cooldown.mjs';
import { getApiKeySecret } from '../lib/secret-manager.mjs';
import { preRollEvent } from '../lib/adventure-events.mjs';
import { randomUUID } from 'crypto';
import { damageLevels, FLEE_CHANCE } from '../lib/adventure-combat-rules.mjs';

// --- 헬퍼 함수 ---
async function getApiKeyForUser(uid) {
    const apiKey = await getApiKeySecret(uid);
    if (!apiKey) throw new Error('API_KEY_NOT_FOUND: 내 정보 탭에서 API 키를 먼저 등록해주세요.');
    return apiKey;
}

// --- 프롬프트 생성 함수 ---

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
            eventInstruction = `[전투] 이벤트: '${difficulty}' 난이도의 적과 조우하는 상황을 묘사하세요. 이 이벤트의 "choices" 배열에는 반드시 {"text": "전투 시작", "action": "enter_battle"} 객체 하나만 포함해야 합니다.`;
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
- 세계관: ${context.world.name}
- 캐릭터: ${context.character.name} (현재 체력: ${context.characterState.stamina}/100)
- 탐험 장소: ${site.name} (난이도: ${site.difficulty})
${historyLog}

# 임무: 이전 기록을 바탕으로 다음 상황을 자연스럽게 연결하여, 아래 규칙에 따라 JSON 객체 하나를 생성하세요.
- **지정 이벤트**: ${eventInstruction}

# 규칙
1. 'situation'은 최소 3문장 이상으로 감각적인 묘사를 풍부하게 사용하세요.
2. 전투가 아니라면, 'choices'는 2~3개의 흥미로운 선택지를 제공하세요.
3. JSON 구조:
   {
     "type": "이벤트 타입 (item, combat, trap, narrative)",
     "situation": "현재 상황에 대한 상세한 묘사",
     "choices": [ { "text": "선택지 1" }, ... ],
     "enemy": { "name": "...", "description": "...", "difficulty": "..." },
     "item": { "name": "...", "description": "...", "grade": "..." },
     "penalty": { "stat": "stamina", "value": -15 }
   }
   - 'enemy', 'item', 'penalty' 필드는 해당 타입일 때만 포함하세요.
   - 설명이나 코드 펜스 없이 순수 JSON 객체만 출력하세요.`;
}

function getResultPrompt(context, site, history, choice) {
    const historyLog = history.length > 0 ? `# 이전 기록\n${history.map(h => `- ${h}`).join('\n')}` : '';

    return `
# 역할: TRPG 마스터(GM)
# 정보
- 세계관: ${context.world.name}
- 캐릭터: ${context.character.name} (체력: ${context.characterState.stamina}/100)
- 탐험 장소: ${site.name}
${historyLog}
- 캐릭터의 직전 행동: "${choice}"

# 임무: 캐릭터의 직전 행동에 대한 **결과**를 1~2문장의 간결하고 흥미로운 서술로 작성해줘. 다른 말은 붙이지 말고, 결과 서술 텍스트만 출력해줘.`;
}

function getCombatScriptPrompt(character, enemy, world) {
    const skills = (character.abilities || []).filter(a => (character.chosen || []).includes(a.id));
    const items = (character.items || []).filter(i => (character.equipped || []).includes(i.id));

    return `
# 역할: 전투 묘사에 매우 능숙한 TRPG 마스터(GM).
# 정보
- 세계관: ${world.name}
- 캐릭터: ${character.name}
- 적: ${enemy.name} - ${enemy.description}

# 임무: 아래 JSON 구조에 맞춰, 플레이어가 스킬/아이템을 사용했을 때 나올 법한 전투 묘사 대사를 총 60개 생성해줘. 각 묘사는 1~2 문장으로 생생하고 역동적으로 표현해야 해.
{
  "skill_dialogues": {
    ${skills.map(s => `"${s.name}": ["묘사 1", "묘사 2", "묘사 3", "묘사 4", "묘사 5"]`).join(',\n    ') || ''}
  },
  "item_dialogues": {
     ${items.map(i => `"${i.name}": ["묘사 1", "묘사 2", "묘사 3", "묘사 4", "묘사 5"]`).join(',\n    ') || ''}
  },
  "finishers": ["결정타 묘사 1", "결정타 묘사 2", "결정타 묘사 3", "결정타 묘사 4", "결정타 묘사 5"]
}
- 설명이나 코드 펜스 없이 순수 JSON 객체만 출력해야 합니다.`;
}

// --- API 엔드포인트 ---
export function mountAdventures(app) {

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
            const site = worldSnap.data()?.sites?.find(s => s.name === siteName);
            if (!site) return res.status(404).json({ ok: false, error: 'SITE_NOT_FOUND' });

            const batch = db.batch();
            const existingAdventures = await db.collection('adventures').where('characterId', '==', characterId).where('status', '==', 'ongoing').get();
            existingAdventures.forEach(doc => batch.delete(doc.ref));
            await batch.commit();

            const context = { character: charSnap.data(), world: worldSnap.data(), characterState: { stamina: 100 } };
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
                modelIndex: 1, // 다음 호출에 사용할 모델 인덱스
            });

            res.json({ ok: true, data: { adventureId: adventureRef.id } });
        } catch (e) {
            console.error('Adventure start error:', e);
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // 선택지 진행 (결과 생성 + 다음 상황 생성)
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
            const geminiKey = await getApiKeyForUser(user.uid);
            
            const charSnap = await db.collection('characters').doc(adventure.characterId).get();
            const worldSnap = await db.collection('worlds').doc(adventure.worldId).get();
            const context = { character: charSnap.data(), world: worldSnap.data(), characterState: adventure.characterState };

            // 1. 결과 생성 (모델 순환)
            const resultModel = MODEL_POOL[adventure.modelIndex % MODEL_POOL.length];
            const resultPrompt = getResultPrompt(context, adventure.site, adventure.history, choice);
            const { text: resultText } = await callGemini({ key: geminiKey, model: resultModel, user: resultPrompt, responseMimeType: "text/plain" });

            // 2. 다음 상황 생성 (모델 순환)
            const nextNodeModel = MODEL_POOL[(adventure.modelIndex + 1) % MODEL_POOL.length];
            const newHistoryEntry = `[선택: ${choice}] -> [결과: ${resultText}]`;
            const updatedHistory = [...adventure.history, newHistoryEntry];
            let updatedCharacterState = { ...adventure.characterState };
            
            // 3. 상태 업데이트 (아이템, 페널티 등)
            let newItem = null;
            const lastNode = adventure.currentNode;
            if (lastNode.type === 'trap' && lastNode.penalty) {
                updatedCharacterState.stamina = Math.max(0, updatedCharacterState.stamina + (lastNode.penalty.value || 0));
            }
            if (lastNode.type === 'item' && lastNode.item) {
                newItem = { ...lastNode.item, id: randomUUID() };
                await db.collection('characters').doc(adventure.characterId).update({ items: FieldValue.arrayUnion(newItem) });
            }

            // 업데이트된 상태로 다음 노드 생성 요청
            const nextNodeContext = { ...context, characterState: updatedCharacterState };
            const nextNodePrompt = getNextNodePrompt(nextNodeContext, adventure.site, updatedHistory);
            const { json: nextNode } = await callGemini({ key: geminiKey, model: nextNodeModel, user: nextNodePrompt });
            if (!nextNode || !nextNode.situation) throw new Error("Failed to generate next node.");
            
            // 4. DB 업데이트
            await ref.update({
                currentNode: nextNode,
                characterState: updatedCharacterState,
                history: updatedHistory,
                lastResult: resultText, // 결과를 임시 저장
                modelIndex: adventure.modelIndex + 2, // 2개의 모델을 사용했으므로 +2
                updatedAt: FieldValue.serverTimestamp(),
            });

            res.json({ ok: true, data: { newItem, newCharacterState: updatedCharacterState, result: resultText } });
        } catch (e) {
            console.error('Adventure proceed error:', e);
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // "다음으로" 버튼 클릭 시, 임시 결과(lastResult)를 지우는 역할
    app.post('/api/adventures/:id/next', async(req, res) => {
        try {
            const user = await getUserFromReq(req);
            if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
            const ref = db.collection('adventures').doc(req.params.id);
            await ref.update({ lastResult: FieldValue.delete() }); // null 대신 delete 사용
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
            const worldSnap = await db.collection('worlds').doc(adventure.worldId).get();
            const character = charSnap.data();
            const world = worldSnap.data();

            const combatSkills = (character.abilities || []).filter(a => (character.chosen || []).includes(a.id));
            const combatItems = (character.items || []).filter(i => (character.equipped || []).includes(i.id));

            const geminiKey = await getApiKeyForUser(user.uid);
            const scriptModel = MODEL_POOL[adventure.modelIndex % MODEL_POOL.length];
            const scriptPrompt = getCombatScriptPrompt(character, enemy, world);
            const { json: combatScript } = await callGemini({ key: geminiKey, model: scriptModel, user: scriptPrompt });
            if (!combatScript || !combatScript.finishers) throw new Error("AI failed to generate combat script.");

            const combatState = {
                status: 'ongoing',
                player: { 
                    name: character.name, 
                    health: 100,
                    maxHealth: 100,
                    skills: combatSkills, 
                    items: combatItems 
                },
                enemy: { 
                    ...enemy, 
                    health: 100,
                    maxHealth: 100,
                },
                turn: 'player',
                log: [`${enemy.name}과의 전투가 시작되었다!`],
                script: combatScript,
            };

            await adventureRef.update({ combatState, modelIndex: adventure.modelIndex + 1 });
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
            const combatState = snap.data()?.combatState;

            if (!combatState || combatState.status !== 'ongoing' || combatState.turn !== 'player') {
                return res.status(400).json({ ok: false, error: 'INVALID_TURN' });
            }

            let turnLog = [];
            
            // --- 플레이어 턴 ---
            if (action.type === 'flee') {
                if (Math.random() < FLEE_CHANCE) {
                    combatState.status = 'fled';
                    turnLog.push('성공적으로 도망쳤습니다!');
                    combatState.log.push(...turnLog);
                    await adventureRef.update({ combatState });
                    return res.json({ ok: true, data: { combatState } });
                } else {
                    turnLog.push('도망에 실패했습니다! 빈틈을 보이고 말았습니다.');
                }
            } else {
                const isSkill = action.type === 'skill';
                const source = isSkill ? combatState.player.skills.find(s => s.id === action.id) : combatState.player.items.find(i => i.id === action.id);
                if (!source) return res.status(404).json({ ok: false, error: 'ACTION_SOURCE_NOT_FOUND' });
                
                const dialogues = (isSkill ? combatState.script.skill_dialogues[source.name] : combatState.script.item_dialogues[source.name]) || ["정해진 묘사가 없어, 임기응변으로 대처했다."];
                turnLog.push(`[${combatState.player.name}]의 행동: ${dialogues[Math.floor(Math.random() * dialogues.length)]}`);
                
                // 데미지/회복 로직 (예시)
                let damage = 0;
                let heal = 0;
                // '회복', '흡수', '치유' 등의 키워드가 있으면 회복 스킬로 간주
                const isHealSkill = /회복|흡수|치유|생명|활력/.test(source.name) || /회복|흡수|치유|생명|활력/.test(source.description);

                if(isHealSkill && isSkill) {
                    heal = Math.floor(Math.random() * 20) + 10; // 10 ~ 29 회복
                    combatState.player.health = Math.min(combatState.player.maxHealth, combatState.player.health + heal);
                    turnLog.push(`생명력이 ${heal}만큼 회복되었습니다! (현재 HP: ${combatState.player.health})`);

                    // 흡혈류 스킬 (데미지도 줌)
                    if(/흡수|흡혈/.test(source.name) || /흡수|흡혈/.test(source.description)) {
                        damage = Math.floor(Math.random() * 15) + 5; // 5 ~ 19 데미지
                    }
                } else {
                     damage = Math.floor(Math.random() * 25) + 10; // 10 ~ 34 데미지
                }

                if (damage > 0) {
                    combatState.enemy.health = Math.max(0, combatState.enemy.health - damage);
                    turnLog.push(`적에게 ${damage}의 피해를 입혔습니다! (적 HP: ${combatState.enemy.health})`);
                }

                if (combatState.enemy.health <= 0) {
                    combatState.status = 'won';
                    turnLog.push(...[
                        combatState.script.finishers[Math.floor(Math.random() * combatState.script.finishers.length)],
                        `전투에서 승리했습니다!`
                    ]);
                    combatState.log.push(...turnLog);
                    await adventureRef.update({ combatState });
                    return res.json({ ok: true, data: { combatState } });
                }
            }

            // --- 적 턴 ---
            const enemyDifficulty = combatState.enemy.difficulty || 'normal';
            const damageRanges = { easy: 15, normal: 20, hard: 25, miniboss: 35 };
            const enemyBaseDamage = damageRanges[enemyDifficulty] || 20;
            const enemyDamage = Math.floor(Math.random() * enemyBaseDamage) + 5; // 5 ~ (base+4) 데미지

            combatState.player.health = Math.max(0, combatState.player.health - enemyDamage);
            turnLog.push(`[${combatState.enemy.name}]의 반격! ${enemyDamage}의 피해를 받았습니다. (현재 HP: ${combatState.player.health})`);

            if (combatState.player.health <= 0) {
                combatState.status = 'lost';
                turnLog.push('치명상을 입고 정신을 잃었습니다... 전투 패배.');
                combatState.log.push(...turnLog);
                await adventureRef.update({ combatState });
                return res.json({ ok: true, data: { combatState } });
            }
            
            combatState.log.push(...turnLog);
            await adventureRef.update({ combatState });
            res.json({ ok: true, data: { combatState } });
        } catch(e) {
            console.error('Error processing combat turn:', e);
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
            const qs = await db.collection('adventures').where('characterId', '==', characterId).where('ownerUid', '==', user.uid).where('status', '==', 'ongoing').limit(1).get();
            if (qs.empty) return res.json({ ok: true, data: null });
            res.json({ ok: true, data: { id: qs.docs[0].id, ...qs.docs[0].data() } });
        } catch (e) {
            res.status(500).json({ ok: false, error: String(e) });
        }
    });
}
