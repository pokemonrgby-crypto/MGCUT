// public/js/tabs/character-narrative.js
const esc = s => String(s ?? '').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function parseRichText(text) {
  if (!text) return '';
  return text.replace(/\n/g, '<br>')
    .replace(/<대사>/g, '<div class="dialogue">')
    .replace(/<\/대사>/g, '</div>')
    .replace(/<서술>/g, '<div class="narrative">')
    .replace(/<\/서술>/g, '</div>')
    .replace(/<강조>/g, '<strong class="emphasis">')
    .replace(/<\/강조>/g, '</strong>')
    .replace(/<생각>/g, '<div class="thought">')
    .replace(/<\/생각>/g, '</div>')
    .replace(/<시스템>/g, '<div class="system">')
    .replace(/<\/시스템>/g, '</div>');
}

function storyCard(s, index) {
  const content = esc(s?.long || '').replace(/\n/g, ' ');
  return `<div class="story-card" data-story-index="${index}" style="cursor:pointer;">
    <div class="story-title small">${esc(s?.title || '서사')}</div>
    <div class="story-content multiline-ellipsis">${content}</div>
  </div>`;
}

export function render(container, characterData) {
  const narratives = characterData.narratives || [];
  if (narratives.length > 0) {
    container.innerHTML = `
      <div class="story-cards v-list">
        ${narratives.map((n, i) => storyCard(n, i)).join('')}
      </div>`;
  } else {
    container.innerHTML = `<div class="small" style="opacity:.8">아직 서사가 없어요.</div>`;
  }

  container.addEventListener('click', (e) => {
    const card = e.target.closest('.story-card');
    if (!card) return;
    
    const storyIndex = parseInt(card.dataset.storyIndex, 10);
    const story = narratives[storyIndex];
    if (!story) return;

    const modal = document.createElement('div');
    modal.className = 'modal-layer';
    modal.innerHTML = `
      <div class="modal-card">
        <button class="modal-close" aria-label="닫기">×</button>
        <div class="modal-body">
          <h3>${esc(story.title)}</h3>
          <div>${parseRichText(esc(story.long))}</div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (ev) => {
      if (ev.target === modal || ev.target.classList.contains('modal-close')) {
        modal.remove();
      }
    });
  });
}
