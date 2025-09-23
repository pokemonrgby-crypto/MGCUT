// public/js/tabs/episode-detail.js
import { api } from '../api.js';

const rootSel = '[data-view="episode-detail"]';

function parseRichText(text) {
  if (!text) return '';
  return text
    .replace(/<대사>/g, '<div class="dialogue">')
    .replace(/<\/대사>/g, '</div>')
    .replace(/<서술>/g, '<div class="narrative">')
    .replace(/<\/서술>/g, '</div>')
    .replace(/<강조>/g, '<strong class="emphasis">')
    .replace(/<\/강조>/g, '</strong>');
}

export async function mount(worldId, episodeTitle) {
  const root = document.querySelector(rootSel);
  if (!root || !worldId || !episodeTitle) return;

  root.innerHTML = '<div class="spinner"></div>';

  try {
    const worldRes = await api.getWorld(worldId);
    const world = worldRes.data;
    const episode = world.episodes?.find(e => e.title === episodeTitle);

    if (!episode) {
      throw new Error('해당 에피소드를 찾을 수 없습니다.');
    }

    root.innerHTML = `
      <div class="episode-detail-view">
        <button class="btn secondary" onclick="window.history.back()" style="margin: 16px 16px 0;">‹ 뒤로가기</button>
        <div class="section-h">${episode.title}</div>
        <div class="card pad" style="margin: 0 16px;">
          <div class="desc episode-content">${parseRichText(episode.content)}</div>
        </div>
      </div>
    `;
  } catch (e) {
    root.innerHTML = `<div class="card pad err" style="margin: 16px;">오류: ${e.message}</div>`;
  }
}
