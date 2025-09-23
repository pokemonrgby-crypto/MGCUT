// public/js/tabs/create-character.js
import { api } from '../api.js';
import { withBlocker, ui } from '../ui/frame.js';
import { callClientSideGemini } from '../lib/gemini-client.js';

const rootSel = '[data-view="create-character"]';
let worldsCache = [];
let promptsCache = [];
let characterBasePrompt = '';
let selectedWorld = null;
let selectedPrompt = null;

// 카드 템플릿
function worldCardTemplate(w) { /* 이전과 동일 */ }
function promptCardTemplate(p) { /* 이전과 동일 */ }

// [신규] 서버의 buildWorldText와 유사한 역할을 하는 클라이언트 함수
function buildWorldTextForAI(w){
  const sites=(w?.sites||[]).map(s=>`- ${s.name}: ${s.description}`).join('\n');
  const orgs=(w?.factions||[]).map(o=>`- ${o.name}: ${o.description}`).join('\n');
  const npcs=(w?.npcs||[]).map(n=>`- ${n.name}: ${n.description}`).join('\n');
  const latestEpisode = (w?.episodes||[]).slice(-1).map(e=>`* ${e.title}: ${e.content.replace(/<[^>]+>/g, "").substring(0,200)}...`).join('\n');

  return [
    `세계 이름: ${w?.name||''}`, `세계관 한 줄 소개: ${w?.introShort||''}`, `주요 명소:\n${sites}`,
    `주요 세력/조직:\n${orgs}`, `주요 NPC:\n${npcs}`, `최근 발생한 사건:\n${latestEpisode}`
  ].join('\n\n');
}

export function mount() {
    const root = document.querySelector(rootSel);
    if (!root || root.dataset.mounted === '1') return;
    root.dataset.mounted = '1';

    const step1 = root.querySelector('#cc-step1-world-selection');
    // ... (이전과 동일한 요소 캐싱)
    
    const changeStep = (targetStep) => { /* 이전과 동일 */ };

    // --- 1단계 로직: 세계관 선택 ---
    // ... (이전과 동일)

    // --- 2단계 로직: 프롬프트 선택 ---
    // ... (이전과 동일)

    // --- 3단계 로직: 정보 입력 및 생성 ---
    root.querySelector('#btn-char-create-final').onclick = async () => {
        if (!selectedWorld || !selectedPrompt) return alert('세계관과 프롬프트가 올바르게 선택되지 않았습니다.');
        if (!root.querySelector('#cc-char-name').value.trim()) return alert('캐릭터 이름을 입력해주세요.');
        if (!characterBasePrompt) return alert('캐릭터 기본 프롬프트를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');

        // [수정] AI 호출을 위한 전체 프롬프트 구성
        const worldText = buildWorldTextForAI(selectedWorld);
        const promptText = selectedPrompt.content;
        const userInputText = `캐릭터 이름: ${root.querySelector('#cc-char-name').value.trim()}\n추가 요청: ${root.querySelector('#cc-char-input').value.trim()}`;
        
        const composedUser = [
            `### 세계관 정보`, worldText,
            `### 생성 프롬프트`, promptText,
            `### 사용자 요청`, userInputText,
            `\n\n위 정보를 바탕으로 JSON 스키마에 맞춰 캐릭터를 생성해줘.`,
        ].join('\n\n');

        try {
            await withBlocker(async () => {
                // 1. 클라이언트에서 Gemini AI 호출
                const characterJson = await callClientSideGemini({
                    system: characterBasePrompt,
                    user: composedUser
                });
                
                if (!characterJson) throw new Error('AI가 유효한 JSON을 생성하지 못했습니다. 모델이나 프롬프트를 확인해주세요.');
                
                // 2. 생성된 JSON을 서버에 저장 요청
                const res = await api.saveCharacter({
                    worldId: selectedWorld.id,
                    promptId: selectedPrompt.id,
                    characterData: characterJson
                });

                alert(`캐릭터 생성 성공! (ID: ${res.data.id})`);
                window.location.hash = '#home';
            });
        } catch (e) {
            alert(`생성 실패: ${e.message}`);
            console.error(e);
        }
    };

    // ... (뒤로가기 버튼 및 observer 로직은 이전과 동일)
    
    // [추가] 뷰가 활성화될 때 기본 프롬프트를 미리 로드
    api.getSystemPrompt('character-base')
      .then(res => { characterBasePrompt = res.data.content; })
      .catch(e => console.error('Character base prompt 로딩 실패:', e));
}
