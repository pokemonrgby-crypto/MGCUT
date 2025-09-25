// (수정된 결과)
// functions/routes/adventures.mjs
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/firebase.mjs';
import { getUserFromReq } from '../lib/auth.mjs' 
import { callGemini, pickModels } from '../lib/gemini.mjs';
import { checkAndUpdateCooldown } from '../lib/cooldown.mjs';
import { decryptWithPassword } from '../lib/crypto.mjs';

// [추가] characters.mjs와 동일한 API 키 복호화 헬퍼 함수
async function getDecryptedKey(uid, password) {
    if (!password) throw new Error('PASSWORD_REQUIRED: 비밀번호가 요청에 포함되지 않았습니다.');
    const userDoc = await db.collection('users').doc(uid).get();
    const encryptedKey = userDoc.exists ? userDoc.data().encryptedKey : null;
    if (!encryptedKey) throw new Error('ENCRYPTED_KEY_NOT_FOUND: 내 정보 탭에서 API 키를 먼저 저장해주세요.');
    
    const decryptedKey = decryptWithPassword(encryptedKey, password);
    if (!decryptedKey) throw new Error('DECRYPTION_FAILED: 비밀번호가 올바르지 않거나 키가 손상되었습니다.');
    return decryptedKey;
}

// 헬퍼: 캐릭터, 세계관 등 핵심 정보를 요약하여 AI에게 전달할 Context를 만듭니다.
async function buildAdventureContext(db, characterId) {
    const charSnap = await db.collection('characters').doc(characterId).get();
    if (!charSnap.exists) throw new Error('CHARACTER_NOT_FOUND');
    const character = charSnap.data();

    const worldSnap = await db.collection('worlds').doc(character.worldId).get();
    const world = worldSnap.exists ? worldSnap.data() : null;

    return {
        character: {
            name: character.name,
            summary: character.introShort,
            worldId: character.worldId, // [추가] worldId 포함
            // 나중 확장을 위해 현재 상태 추가
            stamina: 100,
            items: character.items?.map(i => i.name) || [],
        },
        world: {
            name: world?.name,
            summary: world?.introShort,
        },
    };
}

function getAdventureStartPrompt(context, site, previousSummary = '') {
    const previous = previousSummary ? `\n# 이전 줄거리\n${previousSummary}` : '';
    return `
# 역할: 당신은 최고의 TRPG 마스터(GM)입니다.

# 핵심 정보
- 세계관: ${context.world.name} - ${context.world.summary}
- 캐릭터: ${context.character.name} - ${context.character.summary}
- 탐험 장소: ${site.name} (${site.difficulty}) - ${site.description}
${previous}

# 임무
위 정보를 바탕으로, 흥미진진한 모험의 첫 에피소드(3~4단계 분량)를 '이야기 지도' JSON 형식으로 생성해줘.
- 각 단계(Node)는 "situation"과 "choices" 배열을 포함해야 해.
- 선택지(choice)는 "text"와 다음 노드를 가리키는 "nextNode"를 포함해야 해.
- 에피소드의 마지막 노드는 "isEndpoint": true 와 다음 에피소드를 위한 "outcome" 요약을 포함해야 해.
- 중간에 전투가 필요하다고 판단되면, 노드의 "type"을 "combat"으로 설정하고, 상대할 "enemy" 객체(name, description 포함)를 명시해줘. 전투 노드는 situation이 필요 없어.
- 설명이나 코드 펜스 없이 순수한 JSON 객체만 출력해야 해.
`;
}


export function mountAdventures(app) {
    app.post('/api/adventures/start', async (req, res) => {
        try {
            const user = await getUserFromReq(req);
            if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

            await checkAndUpdateCooldown(db, user.uid, 'startAdventure', 60);

            const { characterId, siteName, password } = req.body;
            if (!characterId || !siteName || !password) {
                return res.status(400).json({ ok: false, error: 'REQUIRED_FIELDS' });
            }

            // [수정] getDecryptedKey 헬퍼 함수 사용
            const geminiKey = await getDecryptedKey(user.uid, password);
            const context = await buildAdventureContext(db, characterId);
            
            const worldSnap = await db.collection('worlds').doc(context.character.worldId).get();
            const site = worldSnap.data()?.sites?.find(s => s.name === siteName);
            if (!site) return res.status(404).json({ ok: false, error: 'SITE_NOT_FOUND' });

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
                worldId: context.character.worldId,
                siteName,
                status: 'ongoing',
                createdAt: now,
                updatedAt: now,
                storyGraph: json,
                currentNodeKey: json.startNode, // [수정] currentNode -> currentNodeKey
                history: [],
            });

            res.json({ ok: true, data: { adventureId: adventureRef.id, storyGraph: json } });

        } catch (e) {
            console.error(e);
            res.status(500).json({ ok: false, error: e.message });
        }
    });
}
