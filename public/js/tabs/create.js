// /public/js/tabs/create.js
import { api, auth } from '../api.js';
import { withBlocker } from '../ui/frame.js';

const rootSel = '[data-view="create"]';

export function mount(){
  renderHub();
  bindForms();
}

function renderHub(){
  const host = document.querySelector(`${rootSel} .grid3`);
  host.innerHTML = `
    <div class="card create-card">
      <div class="icon"><svg class="ico" viewBox="0 0 24 24"><path d="M12 2l4 4-4 4-4-4 4-4zm-7 9h14v9H5z"/></svg></div>
      <div><div class="t">세계관 생성</div><div class="s">하루 1회 (KST 24시 리셋)</div></div>
      <button class="btn secondary" data-open="world">열기</button>
    </div>
    <div class="card create-card">
      <div class="icon"><svg class="ico" viewBox="0 0 24 24"><path d="M12 2a5 5 0 015 5v2h2a3 3 0 110 6h-2v2a5 5 0 11-10 0v-2H5a3 3 0 010-6h2V7a5 5 0 015-5z"/></svg></div>
      <div><div class="t">캐릭터 생성</div><div class="s">세계관 기반 · 프롬프트 선택/직접입력</div></div>
      <button class="btn secondary" data-open="char">열기</button>
    </div>
    <div class="card create-card">
      <div class="icon"><svg class="ico" viewBox="0 0 24 24"><path d="M3 5h18v4H3V5zm0 6h12v4H3v-4zm0 6h18v2H3v-2z"/></svg></div>
      <div><div class="t">프롬프트 업로드</div><div class="s">하루 1개 · 신고/검증 지원</div></div>
      <button class="btn secondary" data-open="prompt">열기</button>
    </div>
  `;
}

function bindForms(){
  // 열기 버튼
  document.querySelectorAll(`${rootSel} [data-open]`).forEach(b=>{
    b.onclick = ()=>{
      const t = b.dataset.open;
      document.querySelectorAll(`${rootSel} [data-form]`).forEach(f=>f.style.display='none');
      document.querySelector(`${rootSel} [data-form="${t}"]`).style.display='';
    };
  });

  // === 세계관 생성 ===
  const btnWorld = document.querySelector(`${rootSel} #btn-world-create`);
  btnWorld.onclick = async ()=>{
    const r = await withBlocker(()=>api.createWorld({}));
    if (!r.ok) return alert(`실패: ${r.error}`);
    const wid = r.data.id;
    alert(`세계관 생성됨: ${wid}\n이미지 업로드 폼으로 이동합니다.`);

    // 이미지 업로드 보이기
    document.querySelector(`${rootSel} #world-upload-wrap`).style.display='';
    document.querySelector(`${rootSel} #world-id-upload`).value = wid;
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
        await api.updateWorldCover(wid, url); // api.js에 추가
      });
      alert('업로드 완료');
    }catch(e){ alert(`업로드 실패: ${e.message||e}`); }
  };

  // === 캐릭터 생성 ===
  const btnChar = document.querySelector(`${rootSel} #btn-char-create`);
  btnChar.onclick = async ()=>{
    const worldId = val('#char-world');
    const promptId = val('#char-prompt') || null;
    const customPrompt = val('#char-custom') || null;
    const userInput = val('#char-input');
    if ((!promptId && !customPrompt) || (promptId && customPrompt)) return alert('프롬프트는 하나만 선택/입력해줘');

    const r = await withBlocker(()=>api.createCharacter({ worldId, promptId, customPrompt, userInput }));
    if (!r.ok) return alert(`실패: ${r.error}`);
    alert(`캐릭터 생성됨: ${r.data.id}`);
  };

  // === 프롬프트 업로드 ===
  const btnPrompt = document.querySelector(`${rootSel} #btn-prompt-upload`);
  btnPrompt.onclick = async ()=>{
    const title = val('#p-title'); const content = val('#p-content');
    if (!title || !content) return alert('제목/내용이 필요해');
    const r = await withBlocker(()=>api.uploadPrompt({ title, content }));
    if (!r.ok) return alert(`실패: ${r.error}`);
    alert(`업로드됨: ${r.data.id}`);
  };
}

function val(sel){ return document.querySelector(`${rootSel} ${sel}`).value.trim(); }
