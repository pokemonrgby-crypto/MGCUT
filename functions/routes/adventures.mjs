// (수정된 결과)
// functions/routes/adventures.mjs
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/firebase.mjs';
import { getUserFromReq } from '../lib/auth.mjs';
import { callGemini, pickModels } from '../lib/gemini.mjs';
import { checkAndUpdateCooldown } from '../lib/cooldown.mjs';
import { decryptWithPassword } from '../lib/crypto.mjs';

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

    // [수정] 다른 세계관 탐험을 위해 worldId를 직접 지정할 수 있도록 변경
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

// [수정] AI 프롬프트의 생성 분량을 '최대 3개'로 제한
function getAdventureStartPrompt(context, site, previousSummary = '') {
    const previous = previousSummary ? `\n# 이전 줄거리\n${previousSummary}` : '';
    return `
# 역할: 당신은 최고의 TRPG 마스터(GM)입니다.

# 핵심 정보
- 세계관: ${context.world.name} - ${context.world.summary}
- 캐릭터: ${context.character.name} - ${context.character.summary}
- 탐험 장소: ${site.name} (${site.difficulty}) - ${site.description}
- 캐릭터 현재 상태: 스태미나 ${context.character.stamina}
${previous}

# 임무
위 정보를 바탕으로, 흥미진진한 모험 에피소드를 '이야기 지도' JSON 형식으로 생성해줘.
- 에피소드는 **최대 3개의 노드**를 포함해야 합니다.
- 각 단계(Node)는 "situation", "choices" 배열, "type" (narrative, combat, trap 등)을 포함해야 해.
- 선택지(choice)는 "text"와 다음 노드를 가리키는 "nextNode"를 포함해야 해.
- 에피소드의 마지막 노드는 "isEndpoint": true 와 다음 에피소드를 위한 "outcome" 요약을 포함해야 해.
- 전투가 필요하다면, 노드의 "type"을 "combat"으로 설정하고, "enemy" 객체(name, description 포함)를 명시해줘.
- 함정이 필요하다면, 노드의 "type"을 "trap"으로 설정하고, "penalty": {"stat": "stamina", "value": -15} 와 같이 피해량을 명시해줘.
- 설명이나 코드 펜스 없이 순수한 JSON 객체만 출력해야 해.
`;
}


export function mountAdventures(app) {
    app.post('/api/adventures/start', async (req, res) => {
        try {
            const user = await getUserFromReq(req);
            if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

            await checkAndUpdateCooldown(db, user.uid, 'startAdventure', 60);

            // [수정] worldId를 요청 본문에서 받도록 변경
            const { characterId, worldId, siteName, password } = req.body;
            if (!characterId || !worldId || !siteName || !password) {
                return res.status(400).json({ ok: false, error: 'REQUIRED_FIELDS' });
            }

            const geminiKey = await getDecryptedKey(user.uid, password);
            // [수정] 컨텍스트 생성 시 worldId 전달
            const context = await buildAdventureContext(db, characterId, worldId);
            
            const worldSnap = await db.collection('worlds').doc(worldId).get();
            const site = worldSnap.data()?.sites?.find(s => s.name === siteName);
            if (!site) return res.status(404).json({ ok: false, error: 'SITE_NOT_FOUND' });
            
            const existingAdventures = await db.collection('adventures')
                .where('characterId', '==', characterId)
                .where('status', '==', 'ongoing')
                .get();
            const batch = db.batch();
            existingAdventures.forEach(doc => batch.delete(doc.ref));
            await batch.commit();

            const prompt = getAdventureStartPrompt(context, site);
            const { primary } = pickModels();
            const { json } = await callGemini({ key: geminiKey, model: primary, user: prompt });

            if (!json || !json.startNode || !json.nodes) {
                throw new Error('AI_INVALID_STORY_GRAPH');
            }

            const now = FieldValue.serverTimestamp();
            const adventureRef = await db.collection('adventures').add({
                ownerUid: user.uid,
                characterId,
                worldId: context.world.id,
                siteName,
                status: 'ongoing',
                createdAt: now,
                updatedAt: now,
                storyGraph: json,
                currentNodeKey: json.startNode,
                characterState: context.character,
                history: [],
            });

            res.json({ ok: true, data: { adventureId: adventureRef.id, storyGraph: json, characterState: context.character } });

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
                .limit(1)
                .get();
            
            if (qs.empty) {
                return res.json({ ok: true, data: null });
            }
            
            const adventure = { id: qs.docs[0].id, ...qs.docs[0].data() };
            res.json({ ok: true, data: adventure });

        } catch (e) {
            console.error('Error fetching ongoing adventure:', e);
            res.status(500).json({ ok: false, error: String(e) });
        }
    });
    
    app.post('/api/adventures/:id/proceed', async (req, res) => {
        try {
            const user = await getUserFromReq(req);
            if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
            
            const { nextNodeKey } = req.body;
            const adventureId = req.params.id;
            
            const ref = db.collection('adventures').doc(adventureId);
            const snap = await ref.get();
            
            if (!snap.exists || snap.data().ownerUid !== user.uid) {
                return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
            }
            
            const adventure = snap.data();
            const newNode = adventure.storyGraph.nodes[nextNodeKey];
            let newCharacterState = { ...adventure.characterState };

            if (newNode.type === 'trap' && newNode.penalty) {
                newCharacterState.stamina += newNode.penalty.value || 0;
            }

            await ref.update({
                currentNodeKey: nextNodeKey,
                characterState: newCharacterState,
                updatedAt: FieldValue.serverTimestamp(),
            });

            res.json({ ok: true, data: { newNode, newCharacterState } });
        } catch (e) {
            console.error('Error proceeding adventure:', e);
            res.status(500).json({ ok: false, error: String(e) });
        }
    });
}
