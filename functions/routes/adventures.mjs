// (수정된 결과)
// functions/routes/adventures.mjs
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/firebase.mjs';
import { getUserFromReq } from '../lib/auth.mjs';
import { callGemini, pickModels } from '../lib/gemini.mjs';
import { checkAndUpdateCooldown } from '../lib/cooldown.mjs';
import { decryptWithPassword } from '../lib/crypto.mjs';
import { preRollEvent } from '../lib/adventure-events.mjs';

async function getDecryptedKey(uid, password) {
    if (!password) throw new Error('PASSWORD_REQUIRED: 비밀번호가 요청에 포함되지 않았습니다.');
    const userDoc = await db.collection('users').doc(uid).get();
    const encryptedKey = userDoc.exists ? userDoc.data().encryptedKey : null;
    if (!encryptedKey) throw new Error('ENCRYPTED_KEY_NOT_FOUND: 내 정보 탭에서 API 키를 먼저 저장해주세요.');
    
    const decryptedKey = decryptWithPassword(encryptedKey, password);
    if (!decryptedKey) throw new Error('DECRYPTION_FAILED: 비밀번호가 올바르지 않거나 키가 손상되었습니다.');
    return decryptedKey;
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
                return `${index + 1}. ${event.tier} 등급 아이템을 발견하는 이벤트를 포함하세요. 아이템 노드는 반드시 {"name": "...", "description": "...", "grade": "${event.tier}"} 형식의 'item' 키를 가져야 합니다.`;
            case 'ENCOUNTER_ENEMY_EASY':
            case 'ENCOUNTER_ENEMY_NORMAL':
            case 'ENCOUNTER_ENEMY_HARD':
            case 'ENCOUNTER_MINIBOSS':
                return `${index + 1}. '${event.type.split('_').pop()}' 난이도의 적과 조우하는 전투 이벤트를 포함하세요.`;
            case 'TRIGGER_TRAP':
                return `${index + 1}. 캐릭터가 스태미나를 잃는 함정 이벤트를 포함하세요.`;
            default:
                return `${index + 1}. 특별한 사건 없이 탐험이 계속되는 서사 이벤트를 포함하세요.`;
        }
    }).join('\n');

    const historyLog = history.length > 0
        ? `# 이전 선택 기록 (시간순)\n${history.map((choice, i) => `- ${i + 1}: ${choice}`).join('\n')}`
        : '';

    return `
# 역할: 당신은 최고의 TRPG 마스터(GM)입니다.
# 핵심 정보
- 세계관: ${context.world.name}
- 캐릭터: ${context.character.name}
- 탐험 장소: ${site.name} (${site.difficulty})
- 이전 에피소드 요약: ${previousOutcome}
${historyLog}

# 임무
**이전 선택 기록을 바탕으로**, 아래에 미리 정해진 순서대로, 총 3개의 사건이 포함된 '이야기 지도' JSON을 생성하세요.
${eventInstructions}

# JSON 구조 규칙
- 반드시 "startNode"와 3개의 노드를 포함하는 "nodes" 객체를 생성해야 합니다.
- 각 노드는 "type", "situation", "choices"를 포함합니다.
- 마지막 노드는 "isEndpoint": true, "outcome": "..."을 포함해야 합니다.
- 전투 노드는 "enemy": {"name": "...", "description": "..."} 객체를 포함해야 합니다.
- 함정 노드는 "penalty": {"stat": "stamina", "value": -15} 객체를 포함해야 합니다.
- 아이템 발견 노드는 "item": {"name": "...", "description": "...", "grade": "..."} 객체를 포함해야 합니다.
- 설명이나 코드 펜스 없이 순수한 JSON 객체만 출력하세요.
`;
}

// [수정] 함수 이름을 변경하고, adventureRef.update 로직을 제거하여 순수하게 그래프만 생성하도록 수정
async function generateStoryGraph(geminiKey, context, site, previousOutcome, history) {
    const preRolledEvents = [preRollEvent(site.difficulty), preRollEvent(site.difficulty), preRollEvent(site.difficulty)];
    
    const prompt = getAdventureStartPrompt(context, site, previousOutcome, preRolledEvents, history);
    const { json: storyGraph } = await callGemini({ key: geminiKey, model: pickModels().primary, user: prompt });

    if (!storyGraph || !storyGraph.startNode || !storyGraph.nodes) {
        throw new Error('AI_INVALID_STORY_GRAPH');
    }
    
    return storyGraph;
}


export function mountAdventures(app) {
    app.post('/api/adventures/start', async (req, res) => {
        try {
            const user = await getUserFromReq(req);
            if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

            const { characterId, worldId, siteName, password } = req.body;
            if (!characterId || !worldId || !siteName || !password) {
                return res.status(400).json({ ok: false, error: 'REQUIRED_FIELDS' });
            }

            const geminiKey = await getDecryptedKey(user.uid, password);
            const context = await buildAdventureContext(db, characterId, worldId);
            
            const worldSnap = await db.collection('worlds').doc(worldId).get();
            const site = worldSnap.data()?.sites?.find(s => s.name === siteName);
            if (!site) return res.status(404).json({ ok: false, error: 'SITE_NOT_FOUND' });
            
            const existingAdventures = await db.collection('adventures')
                .where('characterId', '==', characterId).where('status', '==', 'ongoing').get();
            const batch = db.batch();
            existingAdventures.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            
            // [수정] 먼저 AI로 이야기 지도를 생성
            const initialGraph = await generateStoryGraph(geminiKey, context, site, "탐험을 시작합니다.", []);

            const now = FieldValue.serverTimestamp();
            const adventureRef = db.collection('adventures').doc();
            
            // [수정] 생성된 지도를 포함하여 'set'으로 새 문서를 생성
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

            const { password } = req.body;
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

            const geminiKey = await getDecryptedKey(user.uid, password);
            const context = { character: adventure.characterState, world: { id: adventure.worldId, name: adventure.site.worldName } };
            
            // [수정] 새로운 그래프를 생성
            const newGraph = await generateStoryGraph(geminiKey, context, adventure.site, lastNode.outcome, adventure.history);
            
            // [수정] 생성된 그래프로 문서를 업데이트
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
            let newCharacterState = { ...adventure.characterState };
            let newItem = null;

            if (newNode.type === 'trap' && newNode.penalty) {
                newCharacterState.stamina = Math.max(0, newCharacterState.stamina + (newNode.penalty.value || 0));
            }
            if (newNode.type === 'item' && newNode.item) {
                newItem = newNode.item;
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
}
