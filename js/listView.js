import { applyIcons } from './icons.js';

function escapeHtml(text){
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDate(ts){
  if (!ts) return '-';
  const date = new Date(ts);
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function resolveTagMap(tags){
  return new Map(tags.map((tag) => [tag.id, tag]));
}

function matchesSearch(video, tagsMap, query){
  if (!query) return true;
  const target = `${video.displayName || ''} ${video.fileName || ''} ${(video.tags || []).map((id) => tagsMap.get(id)?.name || '').join(' ')}`.toLowerCase();
  return target.includes(query.toLowerCase());
}

function matchesTagFilter(video, selectedTagIds){
  if (!selectedTagIds.length) return true;
  const videoTagIds = new Set(video.tags || []);
  return selectedTagIds.every((id) => videoTagIds.has(id));
}

function sortVideos(videos, sortKey, sortDir){
  const factor = sortDir === 'asc' ? 1 : -1;
  return [...videos].sort((a, b) => {
    if (sortKey === 'displayName') {
      const an = (a.displayName || a.fileName || '').toLowerCase();
      const bn = (b.displayName || b.fileName || '').toLowerCase();
      return an.localeCompare(bn, 'ja') * factor;
    }
    return ((a.addedAt || 0) - (b.addedAt || 0)) * factor;
  });
}

export function renderListView(app){
  const { state } = app;
  const videoList = document.getElementById('file-list');
  const count = document.getElementById('list-count');
  const chipContainer = document.getElementById('tag-filter-chips');

  const tagMap = resolveTagMap(state.tags);
  const filtered = sortVideos(state.videos, state.filters.sortKey, state.filters.sortDir)
    .filter((video) => matchesSearch(video, tagMap, state.filters.search))
    .filter((video) => matchesTagFilter(video, state.filters.tagIds));

  count.textContent = `${filtered.length} 件 / ${state.videos.length} 件`;

  chipContainer.innerHTML = state.tags.length
    ? state.tags.map((tag) => `
      <button type="button" class="chip ${state.filters.tagIds.includes(tag.id) ? 'selected' : ''}" data-tag-filter="${tag.id}">
        <span class="dot" style="color:${tag.color}"></span>
        <span>${escapeHtml(tag.name)}</span>
      </button>
    `).join('')
    : '<div class="helper">タグがまだありません。タグ編集画面から追加できます。</div>';

  videoList.innerHTML = filtered.length
    ? filtered.map((video) => {
        const videoTags = (video.tags || []).map((id) => tagMap.get(id)).filter(Boolean);
        return `
          <article class="file-card" data-video-id="${video.id}">
            <div class="file-meta">
              <div class="file-title">${escapeHtml(video.displayName || video.fileName || '無題')}</div>
              <div class="file-subtitle">${escapeHtml(video.fileName || '')}</div>
              <div class="file-subtitle">追加: ${escapeHtml(formatDate(video.addedAt))}</div>
              <div class="tag-list">
                ${videoTags.length ? videoTags.map((tag) => `<span class="tag-pill"><span class="dot" style="color:${tag.color}"></span>${escapeHtml(tag.name)}</span>`).join('') : '<span class="helper">タグなし</span>'}
              </div>
            </div>
            <div class="card-actions">
              <button type="button" class="small-round accent" data-action="edit-video" data-video-id="${video.id}" aria-label="ファイル名とタグを編集">
                <span class="icon" data-icon="edit"></span>
              </button>
              <button type="button" class="small-round danger" data-action="delete-video" data-video-id="${video.id}" aria-label="ファイルを削除">
                <span class="icon" data-icon="trash"></span>
              </button>
            </div>
          </article>
        `;
      }).join('')
    : `
      <div class="empty-state">
        <strong>表示できるファイルがありません</strong>
        <div>追加ボタンから動画を読み込んでください。</div>
      </div>
    `;

  applyIcons(videoList);
  applyIcons(chipContainer);
}

export function bindListEvents(app){
  const fileInput = document.getElementById('file-input');
  const addBtn = document.getElementById('btn-add-files');
  const openTagsBtn = document.getElementById('btn-open-tags');
  const searchInput = document.getElementById('search-input');
  const sortKey = document.getElementById('sort-key');
  const sortDir = document.getElementById('sort-dir');
  const chipContainer = document.getElementById('tag-filter-chips');
  const videoList = document.getElementById('file-list');

  addBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    if (!fileInput.files?.length) return;
    await app.handleAddFiles(fileInput.files);
    fileInput.value = '';
  });

  openTagsBtn.addEventListener('click', () => app.openTagEditor());

  searchInput.value = app.state.filters.search;
  sortKey.value = app.state.filters.sortKey;
  sortDir.value = app.state.filters.sortDir;

  searchInput.addEventListener('input', () => {
    app.state.filters.search = searchInput.value;
    app.persistUIState();
    app.render();
  });

  sortKey.addEventListener('change', () => {
    app.state.filters.sortKey = sortKey.value;
    app.persistUIState();
    app.render();
  });

  sortDir.addEventListener('change', () => {
    app.state.filters.sortDir = sortDir.value;
    app.persistUIState();
    app.render();
  });

  chipContainer.addEventListener('click', (event) => {
    const button = event.target.closest('[data-tag-filter]');
    if (!button) return;
    const tagId = button.getAttribute('data-tag-filter');
    const selected = new Set(app.state.filters.tagIds);
    if (selected.has(tagId)) selected.delete(tagId);
    else selected.add(tagId);
    app.state.filters.tagIds = [...selected];
    app.persistUIState();
    app.render();
  });

  videoList.addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-action="edit-video"]');
    const remove = event.target.closest('[data-action="delete-video"]');
    const card = event.target.closest('[data-video-id]');
    if (edit) {
      event.stopPropagation();
      const videoId = edit.getAttribute('data-video-id');
      await app.openVideoEditor(videoId);
      return;
    }
    if (remove) {
      event.stopPropagation();
      const videoId = remove.getAttribute('data-video-id');
      await app.deleteVideo(videoId);
      return;
    }
    if (card) {
      const videoId = card.getAttribute('data-video-id');
      await app.openPlayer(videoId);
    }
  });

  videoList.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('[data-video-id]');
    if (!card) return;
    event.preventDefault();
    await app.openPlayer(card.getAttribute('data-video-id'));
  });
}
