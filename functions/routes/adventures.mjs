// functions/routes/adventures.mjs
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/firebase.mjs';
import { getUserFromReq } from '../lib/auth.mjs';
import { callGemini, pickModels } from '../lib/gemini.mjs';
import { checkAndUpdateCooldown } from '../lib/cooldown.mjs';
import { getApiKeySecret } from '../lib/secret-manager.mjs';
import { preRollEvent } from '../lib/adventure-events.mjs';
import { randomUUID } from 'crypto';

// 헬퍼 함수: UID로 API 키를 가져옵니다.
async function getApiKeyForUser(uid) {
    const apiKey = await getApiKeySecret(uid);
    if (!apiKey) {
        throw new Error('API_KEY_NOT_FOUND: 내 정보 탭에서 API 키를 먼저 등록해주세요.');
    }
    return apiKey;
}

async function buildAdventureContext(db, characterId, worldIdOverride = null) {
    const charSnap = await db.collection('characters').doc(characterId).get();
    if (!charSnap.exists) throw new Error('CHARACTER_NOT_FOUND');
    const character = charSnap.data();

    const finalWorldId = worldIdOverride || character.worldId;
    const worldSnap = await db.collection('worlds').doc(finalWorldId).get();
    const world = worldSnap.exists ? worldSnap.data() : null;
    if (!world) throw new Error('WORLD_NOT_FOUND');

    return {
        character: {
            name: character.name,
            summary: character.introShort,
            stamina: 100,
            items: character.items?.map(i => i.name) || [],
        },
        world: {
            id: finalWorldId,
            name: world?.name,
            summary: world?.introShort,
        },
    };
}

function getAdventureStartPrompt(context, site, previousOutcome, preRolledEvents, history = []) {
    const eventInstructions = preRolledEvents.map((event, index) => {
        switch (event.type) {
            case 'FIND_ITEM':
                return `${index + 1}. [아이템 발견] 이벤트: ${event.tier} 등급 아이템을 발견합니다.`;
            case 'ENCOUNTER_ENEMY_EASY':
            case 'ENCOUNTER_ENEMY_NORMAL':
            case 'ENCOUNTER_ENEMY_HARD':
            case 'ENCOUNTER_MINIBOSS':
                return `${index + 1}. [전투] 이벤트: '${event.type.split('_').pop()}' 난이도의 적과 조우합니다.`;
            case 'TRIGGER_TRAP':
                return `${index + 1}. [함정] 이벤트: 캐릭터가 스태미나를 잃는 함정을 발동시킵니다.`;
            default:
                return `${index + 1}. [서사] 이벤트: 특별한 사건 없이 탐험이 계속되는 서술형 이벤트를 진행합니다.`;
        }
    }).join('\n');

    const historyLog = history.length > 0
        ? `# 이전 선택 기록 (시간순)\n${history.map((choice, i) => `- ${i + 1}: ${choice}`).join('\n')}`
        : '';

    return `
# 역할: 당신은 상상력이 풍부하고 생생한 묘사를 즐기는 최고의 TRPG 마스터(GM)입니다.
# 핵심 정보
- 세계관: ${context.world.name} (${context.world.summary})
- 캐릭터: ${context.character.name} (${context.character.summary})
- 탐험 장소: ${site.name} (난이도: ${site.difficulty})
- 이전 에피소드 요약: ${previousOutcome}
${historyLog}

# 임무
**이전 선택 기록과 상황을 자연스럽게 연결**하여, 아래에 미리 정해진 순서대로, 총 3개의 사건이 포함된 '이야기 지도' JSON을 생성하세요.
${eventInstructions}

# 서사 규칙
1.  **생생한 묘사**: 모든 'situation'은 최소 3문장 이상으로, 시각, 청각, 후각 등 감각적인 묘사를 풍부하게 사용하여 캐릭터가 실제로 그 장소에 있는 것처럼 느끼게 만드세요. (예: '축축한 이끼 냄새가 코를 찌른다.', '멀리서 물방울 떨어지는 소리가 들려온다.')
2.  **흥미로운 선택지**: 'choices'는 단순한 '간다/안 간다'가 아닌, 캐릭터의 성향이나 능력을 활용할 수 있는 전략적이고 흥미로운 선택지를 2~3개 제공하세요. 각 선택은 뚜렷하게 다른 결과로 이어질 잠재력을 가져야 합니다.
3.  **다양성**: 매번 비슷한 패턴(예: 계속 동굴만 탐험)이 반복되지 않도록, 지형, 날씨, NPC, 유물 등 다양한 요소를 활용하여 사건을 구성하세요.

# JSON 구조 규칙
- 반드시 "startNode"와 3개의 노드를 포함하는 "nodes" 객체를 생성해야 합니다.
- 각 노드는 "type", "situation", "choices"를 포함합니다.
- 마지막 노드는 "isEndpoint": true, "outcome": "..."을 포함해야 합니다.
- **아이템 발견 노드**: 'item' 키를 가져야 합니다. 아이템 객체는 {"id": "임시ID", "name": "...", "description": "...", "grade": "...", "type": "equipable"} 형식을 따라야 합니다. (20% 확률로 type을 "consumable"로 설정)
    - **Common/Uncommon**: 아이템의 실용적인 기능과 외형을 간결하게 설명합니다. (예: "잘 벼려진 강철 단검", "상처를 막는 평범한 붕대")
    - **Rare/Epic**: 아이템에 얽힌 간단한 전설이나 특별한 장식을 덧붙여 설명합니다. (예: "달빛을 받으면 희미하게 빛나는 엘프의 활", "고대 왕국의 문장이 새겨진 방패")
    - **Legendary/Mythic/Exotic**: 아이템에 고유한 이름과 함께, 그 힘이나 역사에 대한 강력한 암시를 포함하여 서술합니다. (예: "이름: '서리이빨', 설명: 만년설의 심장에서 벼려내어 모든 것을 얼리는 냉기를 품은 단검")
- **전투 노드**: "enemy": {"name": "...", "description": "..."} 객체를 포함해야 합니다. 적의 외형과 분위기를 생생하게 묘사하세요.
- **함정 노드**: "penalty": {"stat": "stamina", "value": -15} 객체를 포함해야 합니다. 함정이 어떻게 작동하고 캐릭터가 어떻게 피해를 입는지 묘사하세요.
- 설명이나 코드 펜스 없이 순수한 JSON 객체만 출력하세요.
`;
}

/**
 * 생성된 이야기 지도의 구조적 무결성을 검증합니다.
 * @param {object} graph - AI가 생성한 storyGraph JSON 객체
 * @returns {boolean} - 그래프가 유효하면 true, 아니면 false
 */
function validateStoryGraph(graph) {
    if (!graph || typeof graph.nodes !== 'object' || !graph.startNode) {
        console.error('Validation Error: Missing basic graph structure (nodes, startNode).');
        return false;
    }

    if (!graph.nodes[graph.startNode]) {
        console.error(`Validation Error: startNode key "${graph.startNode}" does not exist in nodes.`);
        return false;
    }

    for (const key in graph.nodes) {
        const node = graph.nodes[key];
        if (!node || typeof node.situation !== 'string' || node.situation.trim() === '') {
             console.error(`Validation Error: Node "${key}" is missing or has an empty 'situation'.`);
            return false;
        }

        if (node.isEndpoint) {
            if (typeof node.outcome !== 'string' || node.outcome.trim() === '') {
                console.error(`Validation Error: Endpoint node "${key}" is missing or has an empty 'outcome'.`);
                return false;
            }
        } else {
            if (!Array.isArray(node.choices) || node.choices.length === 0) {
                 console.error(`Validation Error: Non-endpoint node "${key}" is missing 'choices'.`);
                return false;
            }
            for (const choice of node.choices) {
                if (!choice.text || !choice.nextNode || !graph.nodes[choice.nextNode]) {
                    console.error(`Validation Error: Node "${key}" has an invalid choice pointing to "${choice.nextNode}".`);
                    return false;
                }
            }
        }
    }

    return true;
}

async function generateStoryGraph(geminiKey, context, site, previousOutcome, history) {
    const preRolledEvents = [preRollEvent(site.difficulty), preRollEvent(site.difficulty), preRollEvent(site.difficulty)];
    const prompt = getAdventureStartPrompt(context, site, previousOutcome, preRolledEvents, history);

    let lastError = null;
    for (let i = 0; i < 3; i++) { // 최대 3번 재시도
        try {
            const { json: storyGraph } = await callGemini({ key: geminiKey, model: pickModels().primary, user: prompt });
            
            if (validateStoryGraph(storyGraph)) {
                return storyGraph; // 검증 성공 시 즉시 반환
            } else {
                lastError = new Error('AI_INVALID_STORY_GRAPH');
                console.warn(`Attempt ${i + 1} failed: Invalid story graph generated. Retrying...`);
            }
        } catch (e) {
            lastError = e;
            console.warn(`Attempt ${i + 1} failed with API error: ${e.message}. Retrying...`);
        }
    }
    
    // 3번 모두 실패하면 최종적으로 에러를 발생시킴
    throw lastError || new Error('AI_GENERATION_FAILED_AFTER_RETRIES');
}

function getCombatScriptPrompt(character, enemy, world) {
    const skills = (character.abilities || []).filter(a => (character.chosen || []).includes(a.id));
    const items = (character.items || []).filter(i => (character.equipped || []).includes(i.id));

    return `
# 역할: 당신은 전투 묘사에 매우 능숙한 TRPG 마스터(GM)입니다.
# 정보
- 세계관: ${world.name} - ${world.summary}
- 플레이어 캐릭터: ${character.name} - ${character.summary}
- 적: ${enemy.name} - ${enemy.description}

# 임무
위 정보를 바탕으로, 플레이어가 아래의 스킬/아이템을 사용했을 때 나올 법한 전투 묘사 대사를 **총 60개** 생성해줘.
각 묘사는 <서술>, <대사>, <강조> 등의 태그를 활용하여 1~2 문장으로 매우 생생하고 역동적으로 표현해야 합니다.
결과는 반드시 아래 JSON 형식에 맞춰, 설명이나 코드 펜스 없이 순수 JSON 객체만 출력해야 합니다.

{
  "skill_dialogues": {
    ${skills.map(s => `"${s.name}": ["${s.name} 사용 시 묘사 1", "${s.name} 사용 시 묘사 2", ... (총 5개)]`).join(',\n    ') || ''}
  },
  "item_dialogues": {
     ${items.map(i => `"${i.name}": ["${i.name} 사용 시 묘사 1", "${i.name} 사용 시 묘사 2", ... (총 5개)]`).join(',\n    ') || ''}
  },
  "finishers": [
    "결정타 묘사 1 (예: <서술>마지막 일격이 적의 심장을 꿰뚫었다.</서술>)",
    "결정타 묘사 2",
    "결정타 묘사 3",
    "결정타 묘사 4",
    "결정타 묘사 5"
  ]
}
`;
}


export function mountAdventures(app) {
    app.post('/api/adventures/start', async (req, res) => {
        try {
            const user = await getUserFromReq(req);
            if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

            const { characterId, worldId, siteName } = req.body;
            if (!characterId || !worldId || !siteName) {
                return res.status(400).json({ ok: false, error: 'REQUIRED_FIELDS' });
            }

            const geminiKey = await getApiKeyForUser(user.uid);
            const context = await buildAdventureContext(db, characterId, worldId);
            
            const worldSnap = await db.collection('worlds').doc(worldId).get();
            const site = worldSnap.data()?.sites?.find(s => s.name === siteName);
            if (!site) return res.status(404).json({ ok: false, error: 'SITE_NOT_FOUND' });
            
            const existingAdventures = await db.collection('adventures')
                .where('characterId', '==', characterId).where('status', '==', 'ongoing').get();
            const batch = db.batch();
            existingAdventures.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            
            const initialGraph = await generateStoryGraph(geminiKey, context, site, "탐험을 시작합니다.", []);

            const now = FieldValue.serverTimestamp();
            const adventureRef = db.collection('adventures').doc();
            
            await adventureRef.set({
                ownerUid: user.uid, characterId, worldId, siteName, site,
                status: 'ongoing', createdAt: now, updatedAt: now,
                characterState: context.character, 
                history: [], 
                storyGraph: initialGraph,
                currentNodeKey: initialGraph.startNode
            });

            res.json({ ok: true, data: { adventureId: adventureRef.id, storyGraph: initialGraph, characterState: context.character } });

        } catch (e) {
            console.error(e);
            res.status(500).json({ ok: false, error: e.message });
        }
    });
    
    app.post('/api/adventures/:id/continue', async (req, res) => {
        try {
            const user = await getUserFromReq(req);
            if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

            const adventureId = req.params.id;

            const adventureRef = db.collection('adventures').doc(adventureId);
            const snap = await adventureRef.get();
            if (!snap.exists || snap.data().ownerUid !== user.uid) {
                return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
            }

            const adventure = snap.data();
            const lastNode = adventure.storyGraph.nodes[adventure.currentNodeKey];

            if (adventure.characterState.stamina <= 0) {
                await adventureRef.update({ status: 'finished' });
                return res.json({ ok: false, error: 'STAMINA_DEPLETED' });
            }

            const geminiKey = await getApiKeyForUser(user.uid);
            const context = { character: adventure.characterState, world: { id: adventure.worldId, name: adventure.site.worldName } };
            
            const newGraph = await generateStoryGraph(geminiKey, context, adventure.site, lastNode.outcome, adventure.history);
            
            await adventureRef.update({
                storyGraph: newGraph,
                currentNodeKey: newGraph.startNode,
                updatedAt: FieldValue.serverTimestamp(),
            });

            res.json({ ok: true, data: { storyGraph: newGraph } });

        } catch (e) {
            console.error(e);
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.get('/api/adventures/:id', async (req, res) => {
        try {
            const user = await getUserFromReq(req);
            if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
            
            const ref = db.collection('adventures').doc(req.params.id);
            const snap = await ref.get();

            if (!snap.exists || snap.data().ownerUid !== user.uid) {
                return res.status(404).json({ ok: false, error: 'ADVENTURE_NOT_FOUND' });
            }
            
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
                .where('status', '==', 'ongoing')
                .limit(1).get();
            if (qs.empty) return res.json({ ok: true, data: null });
            res.json({ ok: true, data: { id: qs.docs[0].id, ...qs.docs[0].data() } });
        } catch (e) {
            res.status(500).json({ ok: false, error: String(e) });
        }
    });

app.get('/api/characters/:id/adventures', async (req, res) => {
    try {
        const user = await getUserFromReq(req);
        if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

        const characterId = req.params.id;
        
        // 해당 캐릭터가 소유자인지 확인하는 로직 (선택적이지만 보안상 권장)
        const charSnap = await db.collection('characters').doc(characterId).get();
        if (!charSnap.exists || charSnap.data().ownerUid !== user.uid) {
            return res.status(403).json({ ok: false, error: 'NOT_OWNER' });
        }

        const qs = await db.collection('adventures')
            .where('characterId', '==', characterId)
            .where('ownerUid', '==', user.uid)
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();

        const adventures = qs.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ ok: true, data: adventures });

    } catch (e) {
        console.error(`Error fetching all adventures for character ${req.params.id}:`, e);
        res.status(500).json({ ok: false, error: String(e) });
    }
});


    
    app.post('/api/adventures/:id/proceed', async (req, res) => {
        try {
            const user = await getUserFromReq(req);
            if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
            await checkAndUpdateCooldown(db, user.uid, 'proceedAdventure', 5);

            const { nextNodeKey, choiceText } = req.body;
            const adventureId = req.params.id;
            const ref = db.collection('adventures').doc(adventureId);
            const snap = await ref.get();
            if (!snap.exists || snap.data().ownerUid !== user.uid) {
                return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
            }
            
            const adventure = snap.data();
            const newNode = adventure.storyGraph.nodes[nextNodeKey];

            if (!newNode) {
                console.error(`Node not found for key: ${nextNodeKey} in adventure ${adventureId}`);
                return res.status(404).json({ ok: false, error: 'STORY_NODE_NOT_FOUND' });
            }

            let newCharacterState = { ...adventure.characterState };
            let newItem = null;

            if (newNode.type === 'trap' && newNode.penalty) {
                newCharacterState.stamina = Math.max(0, newCharacterState.stamina + (newNode.penalty.value || 0));
            }
            if (newNode.type === 'item' && newNode.item) {
                // [수정] 아이템에 고유 ID 부여
                newItem = { ...newNode.item, id: randomUUID() };
                await db.collection('characters').doc(adventure.characterId).update({
                    items: FieldValue.arrayUnion(newItem)
                });
            }

            await ref.update({
                currentNodeKey: nextNodeKey,
                characterState: newCharacterState,
                history: FieldValue.arrayUnion(choiceText),
                updatedAt: FieldValue.serverTimestamp(),
            });

            res.json({ ok: true, data: { newNode, newCharacterState, newItem } });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });


    app.post('/api/adventures/:id/start-combat', async (req, res) => {
        try {
            const user = await getUserFromReq(req);
            if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

            const adventureId = req.params.id;
            const { enemy } = req.body;
            if (!enemy) return res.status(400).json({ ok: false, error: 'ENEMY_DATA_REQUIRED' });

            const adventureRef = db.collection('adventures').doc(adventureId);
            const snap = await adventureRef.get();
            if (!snap.exists || snap.data().ownerUid !== user.uid) {
                return res.status(404).json({ ok: false, error: 'ADVENTURE_NOT_FOUND' });
            }
            const adventure = snap.data();

            // 1. 캐릭터 정보에서 전투에 사용할 스킬, 아이템 스냅샷 생성
            const charSnap = await db.collection('characters').doc(adventure.characterId).get();
            const character = charSnap.data();
            const worldSnap = await db.collection('worlds').doc(adventure.worldId).get();
            const world = worldSnap.data();

            const combatSkills = (character.abilities || []).filter(a => (character.chosen || []).includes(a.id));
            const combatItems = (character.items || []).filter(i => (character.equipped || []).includes(i.id));

            // 2. AI를 호출하여 전투 스크립트 생성
            const geminiKey = await getApiKeyForUser(user.uid);
            const scriptPrompt = getCombatScriptPrompt(character, enemy, world);
            const { json: combatScript } = await callGemini({ key: geminiKey, model: pickModels().primary, user: scriptPrompt });

            if (!combatScript || !combatScript.finishers) {
                throw new Error("AI failed to generate combat script.");
            }

            // 3. 전투 상태(combatState) 객체 생성 및 저장
            const combatState = {
                status: 'ongoing',
                player: {
                    name: character.name,
                    healthState: '온전함', // 텍스트 기반 체력
                    skills: combatSkills,
                    items: combatItems,
                },
                enemy: {
                    ...enemy,
                    healthState: '온전함',
                },
                turn: 'player',
                log: ['전투가 시작되었다!'],
                script: combatScript,
            };

            await adventureRef.update({ combatState });
            res.json({ ok: true, data: { combatState } });

        } catch (e) {
            console.error('Error starting combat:', e);
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // [신규] 전투 턴 진행 API
    app.post('/api/adventures/:id/combat-turn', async (req, res) => {
        try {
            const user = await getUserFromReq(req);
            if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

            const adventureId = req.params.id;
            const { action } = req.body; // { type: 'skill' | 'item' | 'flee', id: '...' }
            
            const adventureRef = db.collection('adventures').doc(adventureId);
            const snap = await adventureRef.get();
            const combatState = snap.data()?.combatState;

            if (!combatState || combatState.status !== 'ongoing' || combatState.turn !== 'player') {
                return res.status(400).json({ ok: false, error: 'INVALID_TURN' });
            }

            let turnLog = [];
            let isBattleOver = false;

            // --- 플레이어 턴 ---
            if (action.type === 'flee') {
                if (Math.random() < FLEE_CHANCE) {
                    combatState.status = 'fled';
                    turnLog.push('성공적으로 도망쳤다!');
                    isBattleOver = true;
                } else {
                    turnLog.push('도망에 실패했다! 빈틈을 보이고 말았다.');
                }
            } else {
                // 스킬 또는 아이템 사용
                const isSkill = action.type === 'skill';
                const source = isSkill ? combatState.player.skills.find(s => s.id === action.id) : combatState.player.items.find(i => i.id === action.id);
                if (!source) return res.status(404).json({ ok: false, error: 'ACTION_SOURCE_NOT_FOUND' });
                
                // 1. 대사 선택
                const dialogues = isSkill ? combatState.script.skill_dialogues[source.name] : combatState.script.item_dialogues[source.name];
                turnLog.push(dialogues[Math.floor(Math.random() * dialogues.length)]);

                // 2. 피해량 텍스트 선택
                const damageRoll = Math.random(); // 0 ~ 1
                let damageIndex = 1; // 보통
                if (damageRoll < 0.2) damageIndex = 0; // 최소
                else if (damageRoll > 0.8) damageIndex = 2; // 최대
                
                const damageText = isSkill ? damageLevels.player.skill[damageIndex] : damageLevels.player.item[damageIndex];
                turnLog.push(damageText);
                
                // TODO: 실제 healthState 변경 로직 추가 (예: '온전함' -> '약간 다침')
            }

            // --- 적 턴 (전투가 끝나지 않았다면) ---
            if (!isBattleOver) {
                 const enemyDifficulty = combatState.enemy.difficulty || 'normal';
                 const enemyDamageRoll = Math.random();
                 let enemyDamageIndex = 1;
                 if (enemyDamageRoll < 0.2) enemyDamageIndex = 0;
                 else if (enemyDamageRoll > 0.8) enemyDamageIndex = 2;

                 const enemyAttackText = damageLevels.enemy[enemyDifficulty][enemyDamageIndex];
                 turnLog.push(`적의 차례: ${enemyAttackText}`);
                 
                 // TODO: 플레이어 healthState 변경 로직 추가
            }
            
            combatState.log.push(...turnLog);
            await adventureRef.update({ combatState });
            res.json({ ok: true, data: { combatState } });

        } catch(e) {
            console.error('Error processing combat turn:', e);
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    
}
