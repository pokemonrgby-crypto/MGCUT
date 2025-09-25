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

// [수정] AI가 더 나은 품질의 JSON을 출력하도록 프롬프트에 예시 추가
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
- 각 노드(Node)는 "situation", "choices" 배열, "type" (narrative, combat, trap 등)을 포함해야 합니다.
- 선택지(choice)는 "text"와 다음 노드를 가리키는 "nextNode"를 포함해야 합니다.
- 에피소드의 마지막 노드는 "isEndpoint": true 와 다음 에피소드를 위한 "outcome" 요약을 포함해야 합니다.

# 좋은 출력의 예시 (이 구조를 반드시 따르세요):
{
  "startNode": "forest_entry",
  "nodes": {
    "forest_entry": {
      "type": "narrative",
      "situation": "울창한 고대 숲의 입구에 도착했습니다. 안쪽에서는 기이한 동물의 울음소리가 들려옵니다.",
      "choices": [
        { "text": "소리를 따라 조심스럽게 들어간다.", "nextNode": "encounter_beast" },
        { "text": "안전하게 우회로를 찾는다.", "nextNode": "find_hidden_path" }
      ]
    },
    "encounter_beast": {
      "type": "combat",
      "situation": "소리의 근원지에 다가가자, 굶주린 '그림자 늑대'가 당신을 발견하고 이빨을 드러냅니다!",
      "enemy": { "name": "그림자 늑대", "description": "숲의 그림자에 몸을 숨기는 교활한 육식 동물입니다." },
      "choices": [
        { "text": "전투를 준비한다.", "nextNode": "battle_result" }
      ]
    },
    "find_hidden_path": {
        "type": "narrative",
        "situation": "숲을 헤매던 중, 이끼 낀 고대 유적으로 이어지는 숨겨진 길을 발견했습니다.",
        "isEndpoint": true,
        "outcome": "당신은 위험한 짐승을 피해 고대 유적에 도착했습니다.",
        "choices": []
    }
  }
}

# 규칙
- 설명이나 코드 펜스 없이 순수한 JSON 객체만 출력해야 합니다.
- situation 텍스트는 간결하고 흥미롭게 작성하세요.
`;
}

export function mountAdventures(app) {
    app.post('/api/adventures/start', async (req, res) => {
        try {
            const user = await getUserFromReq(req);
            if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

            await checkAndUpdateCooldown(db, user.uid, 'startAdventure', 60);

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
                console.error("AI Generation Error: Invalid Story Graph", json);
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
                newCharacterState.stamina = Math.max(0, newCharacterState.stamina + (newNode.penalty.value || 0));
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
