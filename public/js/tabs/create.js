import { api } from '../api.js';
import { withBlocker } from '../ui/frame.js';

const rootSel = '[data-view="create"]';

export function mount(){
  const root = document.querySelector(rootSel);
  if (root.dataset.mounted === '1') return;
  root.dataset.mounted = '1';

  renderHub();
  bindForms();
}

function renderHub(){
  const host = document.querySelector(`${rootSel} .grid3`);
  host.innerHTML = `
    <div class="card create-card" data-open="world">
      <div class="icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L4.5 5L12 8l7.5-3L12 2zm-7.49 13.5c.66 2.45 2.19 4.45 4.99 5.5V10.5l-5-2v5.5zM12 10.5v10.5c2.8-.95 4.33-3.05 4.99-5.5V8.5l-5 2zM19.5 5.5v5l-5 2V7l5-2z"/></svg></div>
      <div><div class="t">세계관 생성</div><div class="s">하루 1회 (KST 0시 초기화)</div></div>
    </div>
    <div class="card create-card" data-open="char">
      <div class="icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 6c1.1 0 2 .9 2 2s-.9 2-2 2s-2-.9-2-2s.9-2 2-2m0 9c2.7 0 5.8 1.29 6 2v1H6v-1c.2-.71 3.3-2 6-2m0-11C9.79 4 8 5.79 8 8s1.79 4 4 4s4-1.79 4-4s-1.79-4-4-4zm0 9c-2.67 0-8 1.34-8 4v3h16v-3c0-2.66-5.33-4-8-4z"/></svg></div>
      <div><div class="t">캐릭터 생성</div><div class="s">세계관 기반 · 프롬프트 선택/직접입력</div></div>
    </div>
    <div class="card create-card" data-open="prompt">
      <div class="icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 5h18v2H3V5zm0 4h18v2H3V9zm0 4h18v2H3v-2zm0 4h18v2H3v-2z"/></svg></div>
      <div><div class="t">프롬프트 업로드</div><div class="s">공유용 캐릭터 생성 프롬프트</div></div>
    </div>
  `;

  // 카드 클릭 시 폼 열기
  document.querySelectorAll(`${rootSel} [data-open]`).forEach(b=>{
    b.onclick = ()=>{
      const t = b.dataset.open;
      document.querySelectorAll(`${rootSel} [data-form]`).forEach(f=>f.style.display='none');
      document.querySelector(`${rootSel} [data-form="${t}"]`).style.display='';
    };
  });
}

function bindForms(){
  // === 세계관 생성 ===
  const btnWorld = document.querySelector(`${rootSel} #btn-world-create`);
  btnWorld.onclick = async ()=>{
    try {
      const r = await withBlocker(()=>api.createWorld({}));
      const wid = r.id; // API 응답 구조에 맞게 수정
      alert(`세계관이 생성되었습니다: ${wid}\n이제 표지 이미지를 업로드 해주세요.`);

      // 이미지 업로드 폼 보이기
      document.querySelector(`${rootSel} #world-upload-wrap`).style.display='';
      document.querySelector(`${rootSel} #world-id-upload`).value = wid;
    } catch(e) { alert(`실패: ${e.message}`); }
  };

  // 세계관 커버 업로드 (Storage)
  const fileInput = document.querySelector(`${rootSel} #world-cover`);
  const btnUpload = document.querySelector(`${rootSel} #btn-world-upload`);
  btnUpload.onclick = async ()=>{
    const file = fileInput.files?.[0];
    const wid = document.querySelector(`${rootSel} #world-id-upload`).value.trim();
    if (!file || !wid) return alert('worldId와 파일을 확인해줘');
    try{
      await withBlocker(async ()=>{
        const { getStorage, ref, uploadBytes, getDownloadURL } = await import('https://www.gstatic.com/firebasejs/10.12.3/firebase-storage.js');
        const storage = getStorage();
        const path = `worlds/${wid}/cover.${(file.name.split('.').pop()||'png')}`;
        const r = ref(storage, path);
        await uploadBytes(r, file);
        const url = await getDownloadURL(r);
        await api.updateWorldCover(wid, url);
      });
      alert('업로드 완료! 홈 탭에서 확인하세요.');
    }catch(e){ alert(`업로드 실패: ${e.message||e}`); }
  };

  // === 캐릭터 생성 ===
  const btnChar = document.querySelector(`${rootSel} #btn-char-create`);
  btnChar.onclick = async ()=>{
    const worldId = val('#char-world');
    const promptId = val('#char-prompt') || null;
    const customPrompt = val('#char-custom') || null;
    const userInput = val('#char-input');
    if (!worldId) return alert('World ID를 입력해야 해');
    if ((!promptId && !customPrompt) || (promptId && customPrompt)) return alert('프롬프트는 하나만 선택/입력해줘');

    try {
      const r = await withBlocker(()=>api.createCharacter({ worldId, promptId, customPrompt, userInput }));
      alert(`캐릭터 생성됨: ${r.data.id}`);
    } catch(e) { alert(`실패: ${e.message}`); }
  };

  // === 프롬프트 업로드 ===
  const btnPrompt = document.querySelector(`${rootSel} #btn-prompt-upload`);
  btnPrompt.onclick = async ()=>{
    const title = val('#p-title'); const content = val('#p-content');
    if (!title || !content) return alert('제목/내용이 필요해');
    try {
      const r = await withBlocker(()=>api.uploadPrompt({ title, content }));
      alert(`업로드됨: ${r.data.id}`);
    } catch(e) { alert(`실패: ${e.message}`); }
  };
}

function val(sel){ return document.querySelector(`${rootSel} ${sel}`).value.trim(); }
