// /public/js/tabs/world_manage.js
// 세계관 관리 탭: 메인/명소 이미지 업로드, 명소/NPC/세력 추가·삭제, AI 보완 생성

import { db } from '../api/firebase.js';
import { storage, uploadAndGetUrl } from '../api/firebase.js';
import { func } from '../api/firebase.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-functions.js';
import {
  collection, doc, getDoc, getDocs, updateDoc, setDoc, arrayUnion, arrayRemove, query, orderBy
} from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js';

// [선택] 관리자 가드 훅 (초기엔 항상 true로 두고, 나중에 ensureAdmin() 연동 가능)
async function ensureManagePermission() { return true; }

// Firestore 컬렉션 명 통일
const WORLDS = 'worlds';

function esc(s){return String(s??'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}

async function fetchWorldList(){
  const qs = await getDocs(query(collection(db, WORLDS), orderBy('name','asc')));
  return qs.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function fetchWorld(id){
  const snap = await getDoc(doc(db, WORLDS, id));
  return snap.exists() ? { id, ...snap.data() } : null;
}

async function saveWorldPatch(id, patch){
  await updateDoc(doc(db, WORLDS, id), patch);
}

async function pushArray(id, key, value){
  const ref = doc(db, WORLDS, id);
  await updateDoc(ref, { [key]: arrayUnion(value) });
}
async function removeArray(id, key, value){
  const ref = doc(db, WORLDS, id);
  await updateDoc(ref, { [key]: arrayRemove(value) });
}

function renderList(items=[], key='name', idKey='id'){
  return (items||[]).map(it=>`
    <div class="wm-item">
      <div class="wm-item-main">
        <div class="wm-item-title">${esc(it[key]||'(no name)')}</div>
        ${it.img ? `<img class="wm-thumb" src="${esc(it.img)}" alt="">` : ''}
      </div>
      <div class="wm-item-sub">${esc(JSON.stringify(it))}</div>
    </div>
  `).join('');
}

export async function showWorldManage(root){
  if (!(await ensureManagePermission())) {
    root.innerHTML = `<div class="note">권한이 없습니다.</div>`;
    return;
  }

  // 레이아웃
  root.innerHTML = `
    <section class="wm-top">
      <label>세계관 선택
        <select id="wm-worlds"></select>
      </label>
      <button id="wm-reload">새로고침</button>
    </section>

    <section class="wm-sections tabs">
      <nav class="wm-nav">
        <button data-tab="overview" class="on">개요</button>
        <button data-tab="sites">명소</button>
        <button data-tab="npcs">NPC</button>
        <button data-tab="factions">세력</button>
        <button data-tab="images">이미지</button>
      </nav>

      <div class="wm-tab" data-tab="overview">
        <div class="grid2">
          <div>
            <h3>세계관 메타</h3>
            <label>이름 <input id="wm-name" placeholder="세계관 이름"></label>
            <label>소개 <textarea id="wm-intro" rows="3" placeholder="짧은 소개"></textarea></label>
            <label>상세설명 <textarea id="wm-lore" rows="6" placeholder="긴 설명"></textarea></label>
            <button id="wm-ai-fill-meta">AI로 채우기</button>
            <button id="wm-save-meta">저장</button>
          </div>
          <div>
            <h3>현재 데이터 미리보기</h3>
            <pre id="wm-preview" class="wm-pre"></pre>
          </div>
        </div>
      </div>

      <div class="wm-tab" data-tab="sites" hidden>
        <div class="grid2">
          <div>
            <h3>명소 추가</h3>
            <label>ID <input id="wm-site-id" placeholder="site-unique-id"></label>
            <label>이름 <input id="wm-site-name" placeholder="예: 낙양성"></label>
            <label>설명 <textarea id="wm-site-desc" rows="3"></textarea></label>
            <label>유형 <input id="wm-site-type" placeholder="city / dungeon ..."></label>
            <label>태그 <input id="wm-site-tags" placeholder="쉼표로 구분"></label>
            <div class="upload">
              <label>이미지 <input type="file" id="wm-site-img"></label>
            </div>
            <button id="wm-ai-fill-site">AI로 채우기</button>
            <button id="wm-add-site">명소 추가</button>
          </div>
          <div>
            <h3>명소 목록</h3>
            <div id="wm-sites-list"></div>
          </div>
        </div>
      </div>

      <div class="wm-tab" data-tab="npcs" hidden>
        <div class="grid2">
          <div>
            <h3>NPC 추가</h3>
            <label>ID <input id="wm-npc-id"></label>
            <label>이름 <input id="wm-npc-name"></label>
            <label>설명 <textarea id="wm-npc-desc" rows="3"></textarea></label>
            <label>역할 <input id="wm-npc-role" placeholder="상인 / 길드접수원 ..."></label>
            <label>태그 <input id="wm-npc-tags" placeholder="쉼표로 구분"></label>
            <button id="wm-ai-fill-npc">AI로 채우기</button>
            <button id="wm-add-npc">NPC 추가</button>
          </div>
          <div>
            <h3>NPC 목록</h3>
            <div id="wm-npcs-list"></div>
          </div>
        </div>
      </div>

      <div class="wm-tab" data-tab="factions" hidden>
        <div class="grid2">
          <div>
            <h3>세력 추가</h3>
            <label>ID <input id="wm-fac-id"></label>
            <label>이름 <input id="wm-fac-name"></label>
            <label>설명 <textarea id="wm-fac-desc" rows="3"></textarea></label>
            <label>성향 <input id="wm-fac-align" placeholder="정파 / 사파 / 중립 ..."></label>
            <label>태그 <input id="wm-fac-tags" placeholder="쉼표로 구분"></label>
            <button id="wm-ai-fill-fac">AI로 채우기</button>
            <button id="wm-add-fac">세력 추가</button>
          </div>
          <div>
            <h3>세력 목록</h3>
            <div id="wm-facs-list"></div>
          </div>
        </div>
      </div>

      <div class="wm-tab" data-tab="images" hidden>
        <div class="grid2">
          <div>
            <h3>메인 이미지</h3>
            <div class="upload">
              <label>파일 선택 <input type="file" id="wm-main-img"></label>
            </div>
            <button id="wm-upload-main">업로드 & 적용</button>
          </div>
          <div>
            <h3>현재 메인 이미지</h3>
            <img id="wm-main-preview" class="wm-main" alt="">
          </div>
        </div>
      </div>
    </section>
  `;

  // 탭 전환
  root.querySelectorAll('.wm-nav button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      root.querySelectorAll('.wm-nav button').forEach(b=>b.classList.remove('on'));
      btn.classList.add('on');
      const tab = btn.dataset.tab;
      root.querySelectorAll('.wm-tab').forEach(p=>{
        p.hidden = (p.dataset.tab !== tab);
      });
    });
  });

  const $worlds = root.querySelector('#wm-worlds');
  const $reload = root.querySelector('#wm-reload');
  const $preview = root.querySelector('#wm-preview');

  const $name = root.querySelector('#wm-name');
  const $intro = root.querySelector('#wm-intro');
  const $lore = root.querySelector('#wm-lore');

  const $mainImg = root.querySelector('#wm-main-img');
  const $mainPreview = root.querySelector('#wm-main-preview');

  const $siteId = root.querySelector('#wm-site-id');
  const $siteName = root.querySelector('#wm-site-name');
  const $siteDesc = root.querySelector('#wm-site-desc');
  const $siteType = root.querySelector('#wm-site-type');
  const $siteTags = root.querySelector('#wm-site-tags');
  const $siteImg = root.querySelector('#wm-site-img');
  const $sitesList = root.querySelector('#wm-sites-list');

  const $npcId = root.querySelector('#wm-npc-id');
  const $npcName = root.querySelector('#wm-npc-name');
  const $npcDesc = root.querySelector('#wm-npc-desc');
  const $npcRole = root.querySelector('#wm-npc-role');
  const $npcTags = root.querySelector('#wm-npc-tags');
  const $npcsList = root.querySelector('#wm-npcs-list');

  const $facId = root.querySelector('#wm-fac-id');
  const $facName = root.querySelector('#wm-fac-name');
  const $facDesc = root.querySelector('#wm-fac-desc');
  const $facAlign = root.querySelector('#wm-fac-align');
  const $facTags = root.querySelector('#wm-fac-tags');
  const $facsList = root.querySelector('#wm-facs-list');

  const callGen = httpsCallable(func, 'genWorldPiecesV1');

  let worldMap = [];
  let currentWorldId = null;
  let currentWorld = null;

  async function loadWorlds(){
    worldMap = await fetchWorldList();
    $worlds.innerHTML = worldMap.map(w=>`<option value="${esc(w.id)}">${esc(w.name || w.id)}</option>`).join('');
    if (worldMap.length) {
      currentWorldId = worldMap[0].id;
      $worlds.value = currentWorldId;
      await loadWorld();
    }
  }

  async function loadWorld(){
    currentWorld = await fetchWorld(currentWorldId);
    $name.value = currentWorld?.name || '';
    $intro.value = currentWorld?.intro || '';
    $lore.value = currentWorld?.detail?.lore || '';
    $mainPreview.src = currentWorld?.img || '';
    $preview.textContent = JSON.stringify(currentWorld, null, 2);

    // 목록
    $sitesList.innerHTML = renderList(currentWorld?.detail?.sites||[], 'name', 'id');
    $npcsList.innerHTML = renderList(currentWorld?.detail?.npcs||[], 'name', 'id');
    $facsList.innerHTML = renderList(currentWorld?.detail?.factions||[], 'name', 'id');
  }

  $worlds.addEventListener('change', async ()=>{
    currentWorldId = $worlds.value;
    await loadWorld();
  });
  $reload.addEventListener('click', loadWorlds);

  // === 개요 저장 ===
  root.querySelector('#wm-save-meta').addEventListener('click', async ()=>{
    const patch = {
      name: $name.value.trim(),
      intro: $intro.value.trim(),
      detail: {
        ...(currentWorld?.detail||{}),
        lore: $lore.value.trim(),
      }
    };
    await saveWorldPatch(currentWorldId, patch);
    await loadWorld();
    alert('저장됨');
  });

  // === AI로 메타 채우기 ===
  root.querySelector('#wm-ai-fill-meta').addEventListener('click', async ()=>{
    const seed = {
      name: $name.value.trim() || currentWorld?.name || '',
      intro: $intro.value.trim() || currentWorld?.intro || '',
      lore: $lore.value.trim() || currentWorld?.detail?.lore || '',
    };
    const res = await callGen({ worldId: currentWorldId, type: 'meta', seed });
    const out = res?.data || {};
    if (out.name) $name.value = out.name;
    if (out.intro) $intro.value = out.intro;
    if (out.lore) $lore.value = out.lore;
    alert('AI 제안이 적용되었습니다. 필요시 수정 후 [저장]을 눌러주세요.');
  });

  // === 메인 이미지 업로드 ===
  root.querySelector('#wm-upload-main').addEventListener('click', async ()=>{
    const f = $mainImg.files?.[0];
    if (!f) return alert('파일을 선택해줘!');
    const path = `worlds/${currentWorldId}/main_${Date.now()}.png`;
    const url = await uploadAndGetUrl(f, path);
    await saveWorldPatch(currentWorldId, { img: url });
    await loadWorld();
    alert('메인 이미지가 적용되었습니다.');
  });

  // === 명소 AI 채우기 ===
  root.querySelector('#wm-ai-fill-site').addEventListener('click', async ()=>{
    const seed = {
      id: $siteId.value.trim(), name: $siteName.value.trim(),
      description: $siteDesc.value.trim(), type: $siteType.value.trim(),
      tags: ($siteTags.value||'').split(',').map(s=>s.trim()).filter(Boolean)
    };
    const res = await callGen({ worldId: currentWorldId, type: 'site', seed });
    const out = res?.data || {};
    if (out.id) $siteId.value = out.id;
    if (out.name) $siteName.value = out.name;
    if (out.description) $siteDesc.value = out.description;
    if (out.type) $siteType.value = out.type;
    if (Array.isArray(out.tags)) $siteTags.value = out.tags.join(', ');
    alert('AI 제안이 적용되었습니다.');
  });

  // === 명소 추가 ===
  root.querySelector('#wm-add-site').addEventListener('click', async ()=>{
    const site = {
      id: $siteId.value.trim(),
      name: $siteName.value.trim(),
      description: $siteDesc.value.trim(),
      type: $siteType.value.trim(),
      tags: ($siteTags.value||'').split(',').map(s=>s.trim()).filter(Boolean),
      img: ''
    };
    // 이미지가 있으면 업로드
    const f = $siteImg.files?.[0];
    if (f) {
      const path = `worlds/${currentWorldId}/sites/${site.id || ('site_'+Date.now())}.png`;
      site.img = await uploadAndGetUrl(f, path);
    }
    const sites = [...(currentWorld?.detail?.sites||[])];
    // 동일 id 있으면 치환
    const ix = sites.findIndex(s=>s.id===site.id);
    if (ix >= 0) sites[ix] = site; else sites.push(site);
    await saveWorldPatch(currentWorldId, { detail: { ...(currentWorld?.detail||{}), sites } });
    await loadWorld();
    alert('명소가 추가/갱신되었습니다.');
  });

  // === NPC AI 채우기 / 추가 ===
  root.querySelector('#wm-ai-fill-npc').addEventListener('click', async ()=>{
    const seed = {
      id: $npcId.value.trim(), name: $npcName.value.trim(),
      description: $npcDesc.value.trim(), role: $npcRole.value.trim(),
      tags: ($npcTags.value||'').split(',').map(s=>s.trim()).filter(Boolean)
    };
    const res = await callGen({ worldId: currentWorldId, type: 'npc', seed });
    const out = res?.data || {};
    if (out.id) $npcId.value = out.id;
    if (out.name) $npcName.value = out.name;
    if (out.description) $npcDesc.value = out.description;
    if (out.role) $npcRole.value = out.role;
    if (Array.isArray(out.tags)) $npcTags.value = out.tags.join(', ');
    alert('AI 제안이 적용되었습니다.');
  });

  root.querySelector('#wm-add-npc').addEventListener('click', async ()=>{
    const npc = {
      id: $npcId.value.trim(),
      name: $npcName.value.trim(),
      description: $npcDesc.value.trim(),
      role: $npcRole.value.trim(),
      tags: ($npcTags.value||'').split(',').map(s=>s.trim()).filter(Boolean)
    };
    const list = [...(currentWorld?.detail?.npcs||[])];
    const ix = list.findIndex(s=>s.id===npc.id);
    if (ix >= 0) list[ix] = npc; else list.push(npc);
    await saveWorldPatch(currentWorldId, { detail: { ...(currentWorld?.detail||{}), npcs: list } });
    await loadWorld();
    alert('NPC가 추가/갱신되었습니다.');
  });

  // === 세력 AI 채우기 / 추가 ===
  root.querySelector('#wm-ai-fill-fac').addEventListener('click', async ()=>{
    const seed = {
      id: $facId.value.trim(), name: $facName.value.trim(),
      description: $facDesc.value.trim(), alignment: $facAlign.value.trim(),
      tags: ($facTags.value||'').split(',').map(s=>s.trim()).filter(Boolean)
    };
    const res = await callGen({ worldId: currentWorldId, type: 'faction', seed });
    const out = res?.data || {};
    if (out.id) $facId.value = out.id;
    if (out.name) $facName.value = out.name;
    if (out.description) $facDesc.value = out.description;
    if (out.alignment) $facAlign.value = out.alignment;
    if (Array.isArray(out.tags)) $facTags.value = out.tags.join(', ');
    alert('AI 제안이 적용되었습니다.');
  });

  root.querySelector('#wm-add-fac').addEventListener('click', async ()=>{
    const fac = {
      id: $facId.value.trim(),
      name: $facName.value.trim(),
      description: $facDesc.value.trim(),
      alignment: $facAlign.value.trim(),
      tags: ($facTags.value||'').split(',').map(s=>s.trim()).filter(Boolean)
    };
    const list = [...(currentWorld?.detail?.factions||[])];
    const ix = list.findIndex(s=>s.id===fac.id);
    if (ix >= 0) list[ix] = fac; else list.push(fac);
    await saveWorldPatch(currentWorldId, { detail: { ...(currentWorld?.detail||{}), factions: list } });
    await loadWorld();
    alert('세력이 추가/갱신되었습니다.');
  });

  // 초기 로드
  await loadWorlds();
}
