// (수정된 결과)
// functions/routes/adventures.mjs
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/firebase.mjs';
import { getUserFromReq } from '../lib/auth.mjs';
import { callGemini, pickModels } from '../lib/gemini.mjs';
import { checkAndUpdateCooldown } from '../lib/cooldown.mjs';
import { decryptWithPassword } from '../lib/crypto.mjs';
import { preRollEvent } from '../lib/adventure-events.mjs'; // [추가] 프리롤 모듈 import

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
            worldId: character.worldId,
            stamina: 100,
            items: character.items?.map(i => i.name) || [],
        },
        world: {
            name: world?.name,
            summary: world?.introShort,
        },
    };
}

// [수정] AI 프롬프트 생성 로직 수정
function getAdventureNodePrompt(context, site, previousOutcome, event) {
    const base = `# 역할: 당신은 최고의 TRPG 마스터(GM)입니다.
# 핵심 정보
- 세계관: ${context.world.name} - ${context.world.summary}
- 캐릭터: ${context.character.name} - ${context.character.summary}
- 탐험 장소: ${site.name} (${site.difficulty}) - ${site.description}
- 이전 상황 요약: ${previousOutcome}
`;

    let eventInstructions = '';
    switch (event.type) {
        case 'FIND_ITEM':
            eventInstructions = `# 지시: "${event.tier}" 등급 아이템을 발견하는 과정을 흥미진진하게 묘사하세요. 아이템의 이름, 설명을 포함한 JSON을 생성해야 합니다.
# 출력 형식:
{ "type": "item", "situation": "...", "choices": [...], "item": { "name": "...", "description": "...", "grade": "${event.tier}" } }`;
            break;
        case 'ENCOUNTER_ENEMY_EASY':
        case 'ENCOUNTER_ENEMY_NORMAL':
        case 'ENCOUNTER_ENEMY_HARD':
        case 'ENCOUNTER_MINIBOSS':
             eventInstructions = `# 지시: 강력한 적(${event.type.split('_').pop()})과 조우하는 긴박한 상황을 묘사하고, 전투를 준비하는 선택지를 제시하세요. 조우한 적의 이름과 특징을 포함해야 합니다.
# 출력 형식:
{ "type": "combat", "situation": "...", "choices": [...], "enemy": { "name": "...", "description": "..." } }`;
            break;
        case 'TRIGGER_TRAP':
            eventInstructions = `# 지시: 캐릭터가 함정에 빠지는 상황을 묘사하세요. 함정의 종류와 그로 인한 페널티(예: 체력 감소)를 암시해야 합니다.
# 출력 형식:
{ "type": "trap", "situation": "...", "choices": [...], "penalty": { "stat": "stamina", "value": -15 } }`;
            break;
        default: // NOTHING
            eventInstructions = `# 지시: 아무런 특별한 사건 없이 탐험이 계속되는 평온하거나 긴장감 있는 상황을 묘사하세요.
# 출력 형식:
{ "type": "narrative", "situation": "...", "choices": [...] }`;
    }
    return `${base}\n${eventInstructions}\n\n규칙: 설명이나 코드 펜스 없이 순수한 JSON 객체만 출력하세요. situation은 200자 내외, choices는 2~3개로 구성하세요.`;
}

export function mountAdventures(app) {
    // [수정] 모험 시작 API 로직 변경
    app.post('/api/adventures/start', async (req, res) => {
        try {
            const user = await getUserFromReq(req);
            if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

            await checkAndUpdateCooldown(db, user.uid, 'startAdventure', 60);

            const { characterId, siteName, password } = req.body;
            if (!characterId || !siteName || !password) {
                return res.status(400).json({ ok: false, error: 'REQUIRED_FIELDS' });
            }

            const geminiKey = await getDecryptedKey(user.uid, password);
            const context = await buildAdventureContext(db, characterId);
            
            const worldSnap = await db.collection('worlds').doc(context.character.worldId).get();
            const site = worldSnap.data()?.sites?.find(s => s.name === siteName);
            if (!site) return res.status(404).json({ ok: false, error: 'SITE_NOT_FOUND' });

            // [수정] 첫 이벤트는 프리롤 없이 시작 묘사로 고정
            const firstNodePrompt = `
# 역할: 당신은 최고의 TRPG 마스터(GM)입니다.
# 핵심 정보
- 세계관: ${context.world.name}
- 캐릭터: ${context.character.name}
- 탐험 장소: ${site.name} (${site.difficulty}) - ${site.description}
# 임무: 캐릭터가 막 탐험을 시작하는 첫 상황을 묘사하고, 앞으로 나아갈 2~3개의 선택지를 포함한 JSON 노드를 생성해줘.
# 출력 형식: { "type": "narrative", "situation": "...", "choices": [...] }
규칙: 설명이나 코드 펜스 없이 순수한 JSON 객체만 출력하세요.`;

            const { json: firstNode } = await callGemini({ key: geminiKey, model: pickModels().primary, user: firstNodePrompt });

            if (!firstNode || !firstNode.situation) {
                throw new Error('AI_INVALID_START_NODE');
            }

            const now = FieldValue.serverTimestamp();
            const adventureData = {
                ownerUid: user.uid, characterId, worldId: context.character.worldId, siteName,
                status: 'ongoing', createdAt: now, updatedAt: now,
                currentNode: firstNode, // 현재 노드 정보 저장
                history: [{ situation: '모험 시작', outcome: '탐험을 시작했다.' }],
                characterState: context.character,
                site, // [추가] 명소 정보 저장
            };
            const adventureRef = await db.collection('adventures').add(adventureData);

            res.json({ ok: true, data: { adventureId: adventureRef.id, node: firstNode } });

        } catch (e) {
            console.error(e);
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    // [신규] 모험 진행 API
    app.post('/api/adventures/proceed', async (req, res) => {
        try {
            const user = await getUserFromReq(req);
            if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

            const { adventureId, choiceText, password } = req.body;
            if (!adventureId || !choiceText || !password) {
                return res.status(400).json({ ok: false, error: 'REQUIRED_FIELDS' });
            }

            const geminiKey = await getDecryptedKey(user.uid, password);

            const adventureRef = db.collection('adventures').doc(adventureId);
            const adventureSnap = await adventureRef.get();
            if (!adventureSnap.exists || adventureSnap.data().ownerUid !== user.uid) {
                return res.status(404).json({ ok: false, error: 'ADVENTURE_NOT_FOUND' });
            }

            const adventure = adventureSnap.data();
            if (adventure.status !== 'ongoing') {
                return res.status(400).json({ ok: false, error: 'ADVENTURE_NOT_ONGOING' });
            }

            // 1. 프리롤로 다음 이벤트 결정
            const event = preRollEvent(adventure.site.difficulty);

            // 2. AI에게 다음 노드 생성 요청
            const context = { character: adventure.characterState, world: { name: adventure.site.worldName, summary: '' } }; // 간소화
            const previousOutcome = `"${adventure.currentNode.situation}" 상황에서 "${choiceText}"를 선택했다.`;
            const prompt = getAdventureNodePrompt(context, adventure.site, previousOutcome, event);
            const { json: nextNode } = await callGemini({ key: geminiKey, model: pickModels().primary, user: prompt });

            if (!nextNode || !nextNode.situation) {
                 throw new Error('AI_INVALID_NODE_GENERATION');
            }

            // 3. 어드벤처 상태 업데이트 (DB)
            const updatedHistory = [...adventure.history, { situation: adventure.currentNode.situation, outcome: choiceText }];
            await adventureRef.update({
                currentNode: nextNode,
                history: updatedHistory,
                updatedAt: FieldValue.serverTimestamp(),
            });

            res.json({ ok: true, data: { node: nextNode } });
        } catch (e) {
            console.error(e);
            res.status(500).json({ ok: false, error: e.message });
        }
    });


    // [추가] 특정 캐릭터의 모험 기록을 조회하는 엔드포인트
    app.get('/api/characters/:id/adventures', async (req, res) => {
        try {
            const user = await getUserFromReq(req);
            if (!user) return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });

            const characterId = req.params.id;
            const qs = await db.collection('adventures')
                .where('characterId', '==', characterId)
                .orderBy('createdAt', 'desc')
                .limit(50)
                .get();
            
            const adventures = qs.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            res.json({ ok: true, data: adventures });

        } catch (e) {
            console.error('Error fetching character adventures:', e);
            res.status(500).json({ ok: false, error: String(e) });
        }
    });
}
