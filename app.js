import {
  initStorage,
  getAllVideos,
  getAllTags,
  getVideo,
  putVideo,
  deleteVideo,
  putTag,
  deleteTag,
  createId,
  nextTagOrder,
  defaultLoop,
} from './storage.js';

const dom = {
  body: document.body,
  libraryScreen: document.getElementById('libraryScreen'),
  playerScreen: document.getElementById('playerScreen'),
  fileInput: document.getElementById('fileInput'),
  openTagEditorButton: document.getElementById('openTagEditorButton'),
  clearFiltersButton: document.getElementById('clearFiltersButton'),
  searchInput: document.getElementById('searchInput'),
  tagFilterSelect: document.getElementById('tagFilterSelect'),
  sortSelect: document.getElementById('sortSelect'),
  librarySummary: document.getElementById('librarySummary'),
  videoGrid: document.getElementById('videoGrid'),
  busyOverlay: document.getElementById('busyOverlay'),
  busyTitle: document.getElementById('busyTitle'),
  busyPercent: document.getElementById('busyPercent'),
  busyBar: document.getElementById('busyBar'),
  busyMessage: document.getElementById('busyMessage'),
  modalOverlay: document.getElementById('modalOverlay'),
  modalCard: document.getElementById('modalCard'),
  playerStage: document.getElementById('playerStage'),
  playerVideo: document.getElementById('playerVideo'),
  showUiButton: document.getElementById('showUiButton'),
  playerUi: document.getElementById('playerUi'),
  backToLibraryButton: document.getElementById('backToLibraryButton'),
  playPauseButton: document.getElementById('playPauseButton'),
  jumpBack3Button: document.getElementById('jumpBack3Button'),
  jumpForward3Button: document.getElementById('jumpForward3Button'),
  jumpBack5Button: document.getElementById('jumpBack5Button'),
  jumpForward5Button: document.getElementById('jumpForward5Button'),
  mirrorButton: document.getElementById('mirrorButton'),
  speedButton: document.getElementById('speedButton'),
  speedValue: document.getElementById('speedValue'),
  markerJumpButton: document.getElementById('markerJumpButton'),
  markerAddButton: document.getElementById('markerAddButton'),
  markerDeleteButton: document.getElementById('markerDeleteButton'),
  loopSetButton: document.getElementById('loopSetButton'),
  loopToggleButton: document.getElementById('loopToggleButton'),
  loopDeleteButton: document.getElementById('loopDeleteButton'),
  hideUiButton: document.getElementById('hideUiButton'),
  progressTrack: document.getElementById('progressTrack'),
  progressRange: document.getElementById('progressRange'),
  bufferRange: document.getElementById('bufferRange'),
  loopRange: document.getElementById('loopRange'),
  markerLayer: document.getElementById('markerLayer'),
  currentTimeLabel: document.getElementById('currentTimeLabel'),
  durationLabel: document.getElementById('durationLabel'),
};

const state = {
  videos: [],
  tags: [],
  currentVideoId: null,
  currentVideo: null,
  currentObjectUrl: '',
  view: 'library',
  layout: 'landscape',
  filters: {
    search: '',
    tagId: 'all',
    sort: 'addedDesc',
  },
  speed: 1,
  mirrored: false,
  uiVisible: true,
  currentMarkerFocus: null,
};

const iconSvg = {
  upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a1 1 0 0 1 .7.3l4 4a1 1 0 1 1-1.4 1.4L13 7.4V15a1 1 0 1 1-2 0V7.4L8.7 8.7a1 1 0 0 1-1.4-1.4l4-4A1 1 0 0 1 12 3Zm-7 13a1 1 0 0 1 1 1v2h12v-2a1 1 0 1 1 2 0v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z"/></svg>',
  tags: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12.2V5a2 2 0 0 1 2-2h7.2a2 2 0 0 1 1.4.6l7.8 7.8a2 2 0 0 1 0 2.8l-7.2 7.2a2 2 0 0 1-2.8 0L3.6 13.6A2 2 0 0 1 3 12.2Zm5-5.7A1.3 1.3 0 1 0 8 9a1.3 1.3 0 0 0 0-2.5Z"/></svg>',
  clear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.7 5.3a1 1 0 0 1 0 1.4L13.4 12l5.3 5.3a1 1 0 1 1-1.4 1.4L12 13.4l-5.3 5.3a1 1 0 1 1-1.4-1.4L10.6 12 5.3 6.7a1 1 0 0 1 1.4-1.4L12 10.6l5.3-5.3a1 1 0 0 1 1.4 0Z"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4a6 6 0 1 0 3.8 10.6l4.3 4.3a1 1 0 0 0 1.4-1.4l-4.3-4.3A6 6 0 0 0 10 4Zm-4 6a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.7 5.3a1 1 0 0 1 0 1.4L10.4 12l5.3 5.3a1 1 0 1 1-1.4 1.4l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.4 0Z"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.6v12.8a1 1 0 0 0 1.5.9l10.3-6.4a1 1 0 0 0 0-1.8L9.5 4.7A1 1 0 0 0 8 5.6Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5a1 1 0 0 1 1 1v12a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Zm10 0a1 1 0 0 1 1 1v12a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Z"/></svg>',
  rewind3: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11.5 6.2a1 1 0 0 1 0 1.4L7.1 12l4.4 4.4a1 1 0 1 1-1.4 1.4L4.9 12l5.2-5.2a1 1 0 0 1 1.4 0ZM19 6.2a1 1 0 0 1 0 1.4L14.6 12l4.4 4.4a1 1 0 1 1-1.4 1.4L12.4 12l5.2-5.2a1 1 0 0 1 1.4 0Z"/></svg>',
  forward3: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.5 6.2a1 1 0 0 0 0 1.4l4.4 4.4-4.4 4.4a1 1 0 1 0 1.4 1.4l5.2-5.2-5.2-5.2a1 1 0 0 0-1.4 0ZM5 6.2a1 1 0 0 0 0 1.4L9.4 12 5 16.4a1 1 0 1 0 1.4 1.4l5.2-5.2-5.2-5.2a1 1 0 0 0-1.4 0Z"/></svg>',
  rewind5: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11.4 6.1a1 1 0 0 1 0 1.4L7 12l4.4 4.5a1 1 0 1 1-1.4 1.4L4.2 12l5.8-5.9a1 1 0 0 1 1.4 0ZM19 6.1a1 1 0 0 1 0 1.4L14.6 12l4.4 4.5a1 1 0 1 1-1.4 1.4L12 12l5.6-5.9a1 1 0 0 1 1.4 0Z"/></svg>',
  forward5: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.6 6.1a1 1 0 0 0 0 1.4L17 12l-4.4 4.5a1 1 0 1 0 1.4 1.4L19.8 12 14 6.1a1 1 0 0 0-1.4 0ZM5 6.1a1 1 0 0 0 0 1.4L9.4 12 5 16.5a1 1 0 1 0 1.4 1.4L12 12 6.4 6.1a1 1 0 0 0-1.4 0Z"/></svg>',
  mirror: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a1 1 0 0 1 1 1v14a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1Zm-3.8 3.5c.6-.2 1.2.1 1.4.7l.9 2.6.9-2.6a1 1 0 1 1 1.9.7l-1.7 4.9a1 1 0 0 1-1.9 0L7.3 8.9a1 1 0 0 1 .7-1.4Zm7.6 0c.7-.2 1.4.2 1.6.9l1.2 4.2 1.2-4.2a1 1 0 1 1 1.9.5l-1.9 6.6a1 1 0 0 1-1.9 0l-1.9-6.6a1 1 0 0 1 .2-1.4Z"/></svg>',
  speed: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5a8 8 0 1 0 8 8 1 1 0 1 0-2 0 6 6 0 1 1-6-6 1 1 0 1 0 0-2Zm1 3a1 1 0 0 1 1 1v3.6l2.3 2.3a1 1 0 0 1-1.4 1.4l-2.6-2.6a1 1 0 0 1-.3-.7V9a1 1 0 0 1 1-1Z"/></svg>',
  markerAdd: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a1 1 0 0 1 1 1v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6V4a1 1 0 0 1 1-1Z"/></svg>',
  markerJump: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6.5a1 1 0 0 1 1.4 0L11 10.1l3.6-3.6A1 1 0 0 1 16 8l-4 4a1 1 0 0 1-1.4 0l-4-4A1 1 0 0 1 6 6.5Zm0 7a1 1 0 0 1 1.4 0L11 17.1l3.6-3.6A1 1 0 0 1 16 15l-4 4a1 1 0 0 1-1.4 0l-4-4A1 1 0 0 1 6 13.5Z"/></svg>',
  markerDelete: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.3 6.9a1 1 0 0 1 1.4 0L12 9.2l2.3-2.3a1 1 0 1 1 1.4 1.4L13.4 10.6l2.3 2.3a1 1 0 1 1-1.4 1.4L12 12l-2.3 2.3a1 1 0 0 1-1.4-1.4l2.3-2.3-2.3-2.3a1 1 0 0 1 0-1.4Z"/></svg>',
  loopSet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 6h8.4l-1.3-1.3A1 1 0 1 1 15.5 3l3.1 3.1a1 1 0 0 1 0 1.4L15.5 10.6A1 1 0 1 1 14.1 9.2L15.4 8H7a4 4 0 0 0-4 4 1 1 0 1 1-2 0 6 6 0 0 1 6-6Zm10 12H8.6l1.3 1.3A1 1 0 0 1 8.5 21l-3.1-3.1a1 1 0 0 1 0-1.4L8.5 13.4a1 1 0 1 1 1.4 1.4L8.6 16H17a4 4 0 0 0 4-4 1 1 0 1 1 2 0 6 6 0 0 1-6 6Z"/></svg>',
  loopToggle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5h9.1l-1.2-1.2A1 1 0 1 1 15.7 2l3 3a1 1 0 0 1 0 1.4l-3 3a1 1 0 1 1-1.4-1.4L15.5 7H6.4A4.4 4.4 0 0 0 2 11.4a1 1 0 1 1-2 0A6.4 6.4 0 0 1 6.4 5Zm11.2 14H8.5l1.2 1.2A1 1 0 1 1 8.3 22l-3-3a1 1 0 0 1 0-1.4l3-3a1 1 0 1 1 1.4 1.4L8.5 17h9.1a4.4 4.4 0 0 0 4.4-4.4 1 1 0 1 1 2 0A6.4 6.4 0 0 1 17.6 19Z"/></svg>',
  loopDelete: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.3 7.3a1 1 0 0 1 1.4 0L12 9.6l2.3-2.3a1 1 0 1 1 1.4 1.4L13.4 11l2.3 2.3a1 1 0 1 1-1.4 1.4L12 12.4l-2.3 2.3a1 1 0 0 1-1.4-1.4L10.6 11 8.3 8.7a1 1 0 0 1 0-1.4Z"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5c5.5 0 9.9 4.4 11 6.6a1 1 0 0 1 0 .8C21.9 14.6 17.5 19 12 19S2.1 14.6 1 12.4a1 1 0 0 1 0-.8C2.1 9.4 6.5 5 12 5Zm0 2C7.8 7 4 10.1 2.8 12 4 13.9 7.8 17 12 17s8-3.1 9.2-5C20 10.1 16.2 7 12 7Zm0 1.8A3.2 3.2 0 1 1 8.8 12 3.2 3.2 0 0 1 12 8.8Zm0 2A1.2 1.2 0 1 0 13.2 12 1.2 1.2 0 0 0 12 10.8Z"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.7 2.3a1 1 0 0 1 1.4 0l15 15a1 1 0 0 1-1.4 1.4l-2.1-2.1C14.8 17.3 13.4 17.7 12 17.7c-5.5 0-9.9-4.4-11-6.6a1 1 0 0 1 0-.8c.9-1.7 2.7-3.7 5-5.1L3.7 3.7a1 1 0 0 1 0-1.4Zm3.8 3.8L9.7 8.3A4 4 0 0 1 14.7 13.3l1.9 1.9C18.9 13.9 20.4 12.4 21.2 12c-1.2-1.9-5-5-9.2-5a9.1 9.1 0 0 0-4.5 1.1ZM12 9.4A2.6 2.6 0 0 0 9.4 12c0 .4.1.8.3 1.1l3.4 3.4c.3.2.7.3 1.1.3a2.6 2.6 0 0 0 2.6-2.6c0-.4-.1-.8-.3-1.1l-3.4-3.4c-.3-.2-.7-.3-1.1-.3Z"/></svg>',
};

function renderIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    const name = el.getAttribute('data-icon');
    el.innerHTML = iconSvg[name] || '';
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function escapeText(value) {
  return String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function getTagMap() {
  return new Map(state.tags.map((tag) => [tag.id, tag]));
}

function getTagLabelList(tagIds = []) {
  const tagMap = getTagMap();
  return tagIds.map((id) => tagMap.get(id)).filter(Boolean);
}

function normalizeVideo(video) {
  return {
    markers: [],
    tags: [],
    loop: defaultLoop(),
    addedAt: Date.now(),
    updatedAt: Date.now(),
    displayName: video.name || '無題の動画',
    originalName: video.name || '無題の動画',
    mime: video.type || 'video/mp4',
    ...video,
  };
}

function ensureSortCompatibility(video) {
  return {
    ...video,
    tags: Array.isArray(video.tags) ? video.tags : [],
    markers: Array.isArray(video.markers) ? video.markers : [],
    loop: video.loop || defaultLoop(),
  };
}

function sortedVideos(videos) {
  const list = [...videos].map(ensureSortCompatibility);
  const sort = state.filters.sort;
  if (sort === 'nameAsc' || sort === 'nameDesc') {
    list.sort((a, b) => {
      const left = String(a.displayName || '').localeCompare(String(b.displayName || ''), 'ja');
      if (left !== 0) return sort === 'nameAsc' ? left : -left;
      const tie = (a.addedAt || 0) - (b.addedAt || 0);
      return sort === 'nameAsc' ? tie : -tie;
    });
    return list;
  }
  list.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
  if (sort === 'addedDesc') list.reverse();
  return list;
}

function matchesSearch(video) {
  const q = state.filters.search.trim().toLowerCase();
  if (!q) return true;
  const tagMap = getTagMap();
  const haystack = [
    video.displayName,
    video.originalName,
    ...(Array.isArray(video.tags) ? video.tags : []).map((id) => tagMap.get(id)?.name || ''),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

function matchesTagFilter(video) {
  if (state.filters.tagId === 'all') return true;
  return Array.isArray(video.tags) && video.tags.includes(state.filters.tagId);
}

function getFilteredVideos() {
  return sortedVideos(state.videos).filter((video) => matchesTagFilter(video) && matchesSearch(video));
}

function setBusy(visible, title = '処理中', message = '準備中', percent = 0) {
  if (visible) {
    dom.busyOverlay.hidden = false;
    dom.busyTitle.textContent = title;
    dom.busyMessage.textContent = message;
    dom.busyPercent.textContent = `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
    dom.busyBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  } else {
    dom.busyOverlay.hidden = true;
  }
}

function openModal(contentNode, { width = null } = {}) {
  dom.modalCard.innerHTML = '';
  dom.modalCard.appendChild(contentNode);
  if (width) dom.modalCard.style.width = width;
  dom.modalOverlay.hidden = false;
}

function closeModal() {
  dom.modalOverlay.hidden = true;
  dom.modalCard.innerHTML = '';
  dom.modalCard.style.width = '';
}

function modalShell(title, description, bodyNode, actionsNode) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-section';
  wrap.innerHTML = `
    <div class="modal-head">
      <div>
        <h2 id="modalTitle">${escapeText(title)}</h2>
        ${description ? `<p>${escapeText(description)}</p>` : ''}
      </div>
      <button class="icon-button circular modal-close" type="button" aria-label="閉じる"><span class="icon" data-icon="clear"></span></button>
    </div>
  `;
  const closeBtn = wrap.querySelector('.modal-close');
  closeBtn.addEventListener('click', closeModal);
  wrap.appendChild(bodyNode);
  if (actionsNode) wrap.appendChild(actionsNode);
  renderIcons(wrap);
  return wrap;
}

function buildActions(buttons) {
  const row = document.createElement('div');
  row.className = 'modal-actions';
  for (const btn of buttons) row.appendChild(btn);
  return row;
}

function createTextButton(label, onClick, options = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `icon-button ${options.circular ? 'circular' : ''}`.trim();
  if (options.danger) btn.style.borderColor = 'rgba(217,65,65,0.45)';
  if (options.transparent) {
    btn.style.background = 'transparent';
    btn.style.boxShadow = 'none';
  }
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

async function refreshData({ preserveView = true } = {}) {
  const [videos, tags] = await Promise.all([getAllVideos(), getAllTags()]);
  state.videos = videos.map(ensureSortCompatibility);
  state.tags = tags;
  if (!preserveView && state.view === 'player' && !state.currentVideoId) {
    setView('library');
  }
  renderAll();
}

function renderTagOptions() {
  const current = dom.tagFilterSelect.value || state.filters.tagId;
  const options = [`<option value="all">すべてのタグ</option>`];
  for (const tag of state.tags) {
    const style = tag.color ? ` style="background:${tag.color};color:${pickReadableTextColor(tag.color)}"` : '';
    options.push(`<option value="${escapeText(tag.id)}"${style}>${escapeText(tag.name || '無題タグ')}</option>`);
  }
  dom.tagFilterSelect.innerHTML = options.join('');
  dom.tagFilterSelect.value = state.tags.some((tag) => tag.id === current) ? current : 'all';
}

function pickReadableTextColor(hexColor) {
  const cleaned = String(hexColor || '').replace('#', '');
  if (cleaned.length !== 6) return '#1e293b';
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
  return luminance > 160 ? '#0f172a' : '#ffffff';
}

function renderSummary() {
  const list = getFilteredVideos();
  dom.librarySummary.textContent = `${list.length} 件表示 / ${state.videos.length} 件登録`;
}

function renderLibrary() {
  const tagMap = getTagMap();
  const videos = getFilteredVideos();
  renderSummary();
  if (videos.length === 0) {
    dom.videoGrid.innerHTML = `
      <div class="empty-state">
        <div>
          <div style="font-weight:800;font-size:1.02rem;margin-bottom:8px;">動画がありません</div>
          <div>上部の追加ボタンから動画を登録してください。</div>
        </div>
      </div>
    `;
    return;
  }

  dom.videoGrid.innerHTML = videos.map((video) => {
    const tags = (video.tags || []).map((id) => tagMap.get(id)).filter(Boolean);
    const chips = tags.map((tag) => {
      const textColor = pickReadableTextColor(tag.color || '#ffffff');
      const border = tag.color ? `border-color:${tag.color}` : '';
      const bg = tag.color ? `background:${tag.color}` : 'background:#e9eef7';
      return `<span class="tag-chip" style="${bg};color:${textColor};${border}"><span class="tag-dot"></span>${escapeText(tag.name)}</span>`;
    }).join('');

    const meta = `${formatBytes(video.size)} ・ 追加 ${formatDate(video.addedAt)}`;

    return `
      <article class="video-card" data-video-id="${escapeText(video.id)}" tabindex="0" role="button" aria-label="${escapeText(video.displayName)}を再生">
        <div class="video-card-top">
          <div class="video-name">${escapeText(video.displayName || video.originalName || '無題の動画')}</div>
          <div class="video-origin">元の名前: ${escapeText(video.originalName || '')}</div>
          <div class="video-meta">${escapeText(meta)}</div>
        </div>
        <div class="tag-row">${chips || '<span class="small-muted">タグなし</span>'}</div>
        <div class="card-actions">
          <button class="icon-button card-play" type="button" data-action="play" data-id="${escapeText(video.id)}"><span class="icon" data-icon="play"></span><span class="button-text">再生</span></button>
          <button class="icon-button card-rename" type="button" data-action="rename" data-id="${escapeText(video.id)}"><span class="icon" data-icon="tags"></span><span class="button-text">名前</span></button>
          <button class="icon-button card-tags" type="button" data-action="edit-tags" data-id="${escapeText(video.id)}"><span class="icon" data-icon="tags"></span><span class="button-text">タグ</span></button>
          <button class="icon-button card-delete" type="button" data-action="delete" data-id="${escapeText(video.id)}"><span class="icon" data-icon="clear"></span><span class="button-text">削除</span></button>
        </div>
      </article>
    `;
  }).join('');

  renderIcons(dom.videoGrid);
}

function renderAll() {
  renderTagOptions();
  renderLibrary();
  if (state.view === 'player') renderPlayerUi();
}

function setView(view) {
  state.view = view;
  dom.libraryScreen.hidden = view !== 'library';
  dom.playerScreen.hidden = view !== 'player';
  dom.body.style.overflow = view === 'player' ? 'hidden' : 'hidden';
  dom.body.classList.toggle('player-active', view === 'player');
  if (view === 'player') {
    dom.body.classList.add('player-mode');
  } else {
    dom.body.classList.remove('player-mode');
  }
}

function updateOrientation() {
  state.layout = window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape';
  dom.body.dataset.orientation = state.layout;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatDate(timestamp) {
  if (!timestamp) return '日時不明';
  const d = new Date(timestamp);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

async function importFiles(fileList) {
  const files = Array.from(fileList || []).filter((file) => file.type.startsWith('video/'));
  if (files.length === 0) return;

  setBusy(true, 'ファイル読み込み中', '動画を登録しています', 0);
  try {
    const total = files.length;
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const progressPrefix = `${index + 1} / ${total}`;
      dom.busyTitle.textContent = `読み込み中 ${progressPrefix}`;
      dom.busyMessage.textContent = file.name;

      const buffer = await readFileBuffer(file, (fraction) => {
        const overall = ((index + fraction) / total) * 100;
        setBusy(true, `読み込み中 ${progressPrefix}`, file.name, overall);
      });

      const video = normalizeVideo({
        id: createId('video'),
        blob: new Blob([buffer], { type: file.type }),
        mime: file.type,
        size: file.size,
        displayName: file.name,
        originalName: file.name,
        addedAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
        markers: [],
        loop: defaultLoop(),
      });

      await putVideo(video);
      state.videos.push(video);
      renderAll();
    }
  } finally {
    setBusy(false);
    dom.fileInput.value = '';
    await refreshData();
  }
}

function readFileBuffer(file, onProgress) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable && typeof onProgress === 'function') {
        onProgress(event.loaded / event.total);
      }
    };
    reader.onload = () => onProgress?.(1);
    reader.onerror = () => reject(reader.error || new Error('ファイルの読み込みに失敗しました'));
    reader.onloadend = () => {
      if (reader.error) return;
      resolve(reader.result);
    };
    reader.readAsArrayBuffer(file);
  });
}

async function removeVideo(videoId) {
  const video = state.videos.find((item) => item.id === videoId);
  if (!video) return;
  const confirmed = await confirmModal('動画を削除', `${video.displayName || video.originalName} を削除します。`, '削除すると元に戻せません。');
  if (!confirmed) return;

  setBusy(true, '削除中', '動画データを削除しています', 30);
  try {
    if (state.currentVideoId === videoId) {
      closePlayer({ keepView: false });
    }
    await deleteVideo(videoId);
    state.videos = state.videos.filter((item) => item.id !== videoId);
    if (state.currentObjectUrl) {
      URL.revokeObjectURL(state.currentObjectUrl);
      state.currentObjectUrl = '';
    }
    renderAll();
    dom.busyTitle.textContent = '削除完了';
    dom.busyMessage.textContent = 'キャッシュを解放しました';
    dom.busyPercent.textContent = '100%';
    dom.busyBar.style.width = '100%';
    await delay(180);
  } finally {
    setBusy(false);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function openRenameModal(videoId) {
  const video = state.videos.find((item) => item.id === videoId);
  if (!video) return;

  const body = document.createElement('div');
  body.className = 'modal-section';
  body.innerHTML = `
    <div class="modal-field">
      <label>表示名</label>
      <input id="renameInput" type="text" value="${escapeText(video.displayName || '')}" maxlength="180">
    </div>
    <div class="notice-inline">元のファイル名は保持されます。表示名だけを変更します。</div>
  `;
  const input = body.querySelector('#renameInput');
  const okButton = document.createElement('button');
  okButton.className = 'icon-button';
  okButton.type = 'button';
  okButton.textContent = '保存';
  okButton.addEventListener('click', async () => {
    const nextName = input.value.trim();
    if (!nextName) return;
    const next = { ...video, displayName: nextName, updatedAt: Date.now() };
    await putVideo(next);
    syncVideo(next);
    closeModal();
    renderAll();
  });

  const cancelButton = document.createElement('button');
  cancelButton.className = 'icon-button';
  cancelButton.type = 'button';
  cancelButton.textContent = 'キャンセル';
  cancelButton.addEventListener('click', closeModal);

  const modal = modalShell('表示名を編集', '一覧に表示される名前を変更します。', body, buildActions([cancelButton, okButton]));
  openModal(modal);
  input.focus();
  input.select();
}

async function openFileTagModal(videoId) {
  const video = state.videos.find((item) => item.id === videoId);
  if (!video) return;

  const body = document.createElement('div');
  body.className = 'modal-section';
  body.innerHTML = `
    <div class="help-line">複数選択できます。新しいタグもここから追加できます。</div>
    <div class="modal-field">
      <label>タグを選択</label>
      <div id="tagChoiceGrid" class="choice-grid"></div>
    </div>
    <div class="modal-field">
      <label>新しいタグを作成</label>
      <div class="choice-grid" style="grid-template-columns:minmax(0,1fr) 120px auto;">
        <input id="newTagName" type="text" placeholder="タグ名">
        <input id="newTagColor" type="color" value="#8b5cf6" style="height:46px;padding:4px 8px;">
        <button id="newTagAddButton" class="icon-button" type="button">追加</button>
      </div>
    </div>
  `;

  const grid = body.querySelector('#tagChoiceGrid');
  const renderTagChoices = () => {
    grid.innerHTML = state.tags.map((tag) => {
      const checked = Array.isArray(video.tags) && video.tags.includes(tag.id) ? 'checked' : '';
      const textColor = pickReadableTextColor(tag.color || '#ffffff');
      const bg = tag.color || '#ffffff';
      return `
        <label class="choice-chip" style="background:${bg};color:${textColor};">
          <input type="checkbox" data-tag-id="${escapeText(tag.id)}" ${checked}>
          <span class="tag-dot"></span>
          <span>${escapeText(tag.name)}</span>
        </label>
      `;
    }).join('') || '<div class="notice-inline">まだタグがありません。新しいタグを作成してください。</div>';
    renderIcons(grid);
  };

  renderTagChoices();

  body.querySelector('#newTagAddButton').addEventListener('click', async () => {
    const nameInput = body.querySelector('#newTagName');
    const colorInput = body.querySelector('#newTagColor');
    const name = nameInput.value.trim();
    if (!name) return;
    const newTag = {
      id: createId('tag'),
      name,
      color: colorInput.value || '#8b5cf6',
      order: await nextTagOrder(),
      updatedAt: Date.now(),
    };
    await putTag(newTag);
    state.tags = await getAllTags();
    video.tags = Array.from(new Set([...(video.tags || []), newTag.id]));
    video.updatedAt = Date.now();
    await putVideo(video);
    syncVideo(video);
    renderTagChoices();
    nameInput.value = '';
    renderAll();
  });

  const saveButton = document.createElement('button');
  saveButton.className = 'icon-button';
  saveButton.type = 'button';
  saveButton.textContent = '保存';
  saveButton.addEventListener('click', async () => {
    const selected = Array.from(body.querySelectorAll('input[type="checkbox"][data-tag-id]'))
      .filter((input) => input.checked)
      .map((input) => input.dataset.tagId);
    video.tags = selected;
    video.updatedAt = Date.now();
    await putVideo(video);
    syncVideo(video);
    closeModal();
    renderAll();
  });

  const cancelButton = document.createElement('button');
  cancelButton.className = 'icon-button';
  cancelButton.type = 'button';
  cancelButton.textContent = 'キャンセル';
  cancelButton.addEventListener('click', closeModal);

  const modal = modalShell('ファイルのタグ編集', video.displayName || video.originalName || '無題', body, buildActions([cancelButton, saveButton]));
  openModal(modal, { width: 'min(92vw, 760px)' });
}

function syncVideo(updated) {
  state.videos = state.videos.map((item) => (item.id === updated.id ? ensureSortCompatibility(updated) : item));
  if (state.currentVideoId === updated.id) state.currentVideo = ensureSortCompatibility(updated);
}

async function openTagEditorModal() {
  const body = document.createElement('div');
  body.className = 'modal-section';
  body.innerHTML = `
    <div class="help-line">タグの表示順序、名前、色を編集できます。削除すると、関連する動画からも外れます。</div>
    <div class="tag-editor-list" id="tagEditorList"></div>
    <div class="modal-field">
      <label>新しいタグ</label>
      <div class="choice-grid" style="grid-template-columns:minmax(0,1fr) 120px auto;">
        <input id="globalTagName" type="text" placeholder="タグ名">
        <input id="globalTagColor" type="color" value="#3b82f6" style="height:46px;padding:4px 8px;">
        <button id="globalTagAddButton" class="icon-button" type="button">追加</button>
      </div>
    </div>
  `;

  const list = body.querySelector('#tagEditorList');
  const renderRows = (tags) => {
    list.innerHTML = tags.map((tag, index) => `
      <div class="tag-editor-row" data-tag-id="${escapeText(tag.id)}">
        <div class="tag-swatch" style="background:${escapeText(tag.color || '#94a3b8')}"></div>
        <input type="text" class="tag-name-input" value="${escapeText(tag.name || '')}" maxlength="80" aria-label="タグ名">
        <input type="color" class="tag-color-input" value="${escapeText(tag.color || '#94a3b8')}" aria-label="タグ色">
        <div class="tag-editor-actions">
          <button type="button" class="icon-button circular move-up" ${index === 0 ? 'disabled' : ''} title="上へ"><span class="icon" data-icon="marker-jump"></span></button>
          <button type="button" class="icon-button circular move-down" ${index === tags.length - 1 ? 'disabled' : ''} title="下へ"><span class="icon" data-icon="forward3"></span></button>
          <button type="button" class="icon-button circular delete-tag" title="削除"><span class="icon" data-icon="clear"></span></button>
        </div>
      </div>
    `).join('') || '<div class="notice-inline">タグがありません。新しいタグを追加してください。</div>';
    renderIcons(list);
  };

  let tags = [...state.tags].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  renderRows(tags);

  list.addEventListener('click', async (event) => {
    const row = event.target.closest('.tag-editor-row');
    if (!row) return;
    const tagId = row.dataset.tagId;
    const tagIndex = tags.findIndex((tag) => tag.id === tagId);
    if (tagIndex < 0) return;

    if (event.target.closest('.move-up')) {
      if (tagIndex === 0) return;
      [tags[tagIndex - 1], tags[tagIndex]] = [tags[tagIndex], tags[tagIndex - 1]];
      tags = tags.map((tag, index) => ({ ...tag, order: index }));
      await persistTagOrder(tags);
      renderRows(tags);
      return;
    }

    if (event.target.closest('.move-down')) {
      if (tagIndex === tags.length - 1) return;
      [tags[tagIndex + 1], tags[tagIndex]] = [tags[tagIndex], tags[tagIndex + 1]];
      tags = tags.map((tag, index) => ({ ...tag, order: index }));
      await persistTagOrder(tags);
      renderRows(tags);
      return;
    }

    if (event.target.closest('.delete-tag')) {
      const confirmed = await confirmModal('タグ削除', `${tags[tagIndex].name} を削除します。`, 'このタグはすべての動画から外れます。');
      if (!confirmed) return;
      await deleteTag(tags[tagIndex].id);
      state.tags = await getAllTags();
      state.videos = await getAllVideos();
      tags = [...state.tags].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      renderRows(tags);
      renderAll();
    }
  });

  list.addEventListener('input', (event) => {
    const row = event.target.closest('.tag-editor-row');
    if (!row) return;
    const tag = tags.find((item) => item.id === row.dataset.tagId);
    if (!tag) return;
    if (event.target.classList.contains('tag-name-input')) {
      tag.name = event.target.value;
    }
    if (event.target.classList.contains('tag-color-input')) {
      tag.color = event.target.value;
      row.querySelector('.tag-swatch').style.background = tag.color;
    }
  });

  body.querySelector('#globalTagAddButton').addEventListener('click', async () => {
    const nameInput = body.querySelector('#globalTagName');
    const colorInput = body.querySelector('#globalTagColor');
    const name = nameInput.value.trim();
    if (!name) return;
    const tag = {
      id: createId('tag'),
      name,
      color: colorInput.value || '#3b82f6',
      order: await nextTagOrder(),
      updatedAt: Date.now(),
    };
    await putTag(tag);
    state.tags = await getAllTags();
    tags = [...state.tags].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    renderRows(tags);
    nameInput.value = '';
    renderAll();
  });

  const saveButton = document.createElement('button');
  saveButton.className = 'icon-button';
  saveButton.type = 'button';
  saveButton.textContent = '保存';
  saveButton.addEventListener('click', async () => {
    tags = tags.map((tag, index) => ({
      ...tag,
      order: index,
      updatedAt: Date.now(),
      name: String(tag.name || '').trim() || '無題タグ',
      color: tag.color || '#94a3b8',
    }));
    await persistTagOrder(tags);
    state.tags = await getAllTags();
    closeModal();
    renderAll();
  });

  const cancelButton = document.createElement('button');
  cancelButton.className = 'icon-button';
  cancelButton.type = 'button';
  cancelButton.textContent = '閉じる';
  cancelButton.addEventListener('click', closeModal);

  const modal = modalShell('タグ編集', '順序と見た目を整えます。', body, buildActions([cancelButton, saveButton]));
  openModal(modal, { width: 'min(92vw, 860px)' });
}

async function persistTagOrder(tags) {
  for (const tag of tags) {
    await putTag(tag);
  }
  state.tags = await getAllTags();
  renderAll();
}

async function confirmModal(title, description, note) {
  return new Promise((resolve) => {
    const body = document.createElement('div');
    body.className = 'modal-section';
    body.innerHTML = `
      <div class="notice-inline">${escapeText(description)}</div>
      ${note ? `<div class="small-muted">${escapeText(note)}</div>` : ''}
    `;
    const cancelButton = document.createElement('button');
    cancelButton.className = 'icon-button';
    cancelButton.type = 'button';
    cancelButton.textContent = 'キャンセル';
    cancelButton.addEventListener('click', () => {
      closeModal();
      resolve(false);
    });

    const okButton = document.createElement('button');
    okButton.className = 'icon-button';
    okButton.type = 'button';
    okButton.style.borderColor = 'rgba(217,65,65,0.45)';
    okButton.textContent = '削除';
    okButton.addEventListener('click', () => {
      closeModal();
      resolve(true);
    });

    const modal = modalShell(title, '', body, buildActions([cancelButton, okButton]));
    openModal(modal, { width: 'min(92vw, 480px)' });
  });
}

async function openVideo(videoId) {
  const video = await getVideo(videoId);
  if (!video) return;
  state.currentVideoId = videoId;
  state.currentVideo = ensureSortCompatibility(video);
  setView('player');
  state.uiVisible = true;
  updatePlayerUiVisibility();
  await loadVideoIntoPlayer(state.currentVideo);
}

async function loadVideoIntoPlayer(video) {
  cleanupObjectUrl();
  state.currentObjectUrl = URL.createObjectURL(video.blob);
  dom.playerVideo.src = state.currentObjectUrl;
  dom.playerVideo.playbackRate = state.speed;
  dom.playerVideo.style.transform = state.mirrored ? 'scaleX(-1)' : 'scaleX(1)';
  dom.playerVideo.loop = false;
  dom.playerVideo.load();
  renderPlayerUi();
  requestAnimationFrame(() => {
    dom.playerVideo.play().catch(() => {});
  });
}

function cleanupObjectUrl() {
  if (state.currentObjectUrl) {
    URL.revokeObjectURL(state.currentObjectUrl);
    state.currentObjectUrl = '';
  }
}

function closePlayer({ keepView = false } = {}) {
  dom.playerVideo.pause();
  cleanupObjectUrl();
  state.currentVideoId = null;
  state.currentVideo = null;
  state.mirrored = false;
  state.speed = 1;
  dom.playerVideo.removeAttribute('src');
  dom.playerVideo.load();
  dom.body.classList.remove('player-mode');
  state.uiVisible = true;
  updatePlayerUiVisibility();
  if (!keepView) setView('library');
}

function updatePlayButton() {
  const playing = !dom.playerVideo.paused && !dom.playerVideo.ended;
  dom.playPauseButton.innerHTML = `<span class="icon" data-icon="${playing ? 'pause' : 'play'}"></span>`;
  renderIcons(dom.playPauseButton);
}

function renderPlayerUi() {
  if (!state.currentVideo) return;
  const video = state.currentVideo;
  dom.speedValue.textContent = `${state.speed.toFixed(2)}x`;
  dom.playerVideo.playbackRate = state.speed;
  dom.playerVideo.style.transform = state.mirrored ? 'scaleX(-1)' : 'scaleX(1)';
  updatePlayButton();
  updateProgressUi();
  updateLoopUi();
  updateMarkerLayer();
}

function updatePlayerUiVisibility() {
  dom.playerUi.hidden = !state.uiVisible;
  dom.showUiButton.hidden = state.uiVisible;
}

function updateProgressUi() {
  const video = dom.playerVideo;
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  const percent = duration > 0 ? (current / duration) * 100 : 0;
  dom.currentTimeLabel.textContent = formatTime(current);
  dom.durationLabel.textContent = formatTime(duration);
  dom.progressRange.style.width = `${clamp(percent, 0, 100)}%`;
  const bufferedEnd = (() => {
    try {
      if (!video.buffered || video.buffered.length === 0) return 0;
      return video.buffered.end(video.buffered.length - 1);
    } catch {
      return 0;
    }
  })();
  const bufferedPercent = duration > 0 ? (bufferedEnd / duration) * 100 : 0;
  dom.bufferRange.style.width = `${clamp(bufferedPercent, 0, 100)}%`;
  if (state.currentVideo?.loop?.start != null && state.currentVideo?.loop?.end != null) {
    const start = clamp((state.currentVideo.loop.start / duration) * 100, 0, 100);
    const end = clamp((state.currentVideo.loop.end / duration) * 100, 0, 100);
    dom.loopRange.hidden = false;
    dom.loopRange.style.left = `${Math.min(start, end)}%`;
    dom.loopRange.style.width = `${Math.max(0, Math.abs(end - start))}%`;
  } else {
    dom.loopRange.hidden = true;
  }
}

function updateLoopUi() {
  const loop = state.currentVideo?.loop || defaultLoop();
  const hasLoop = Number.isFinite(loop.start) && Number.isFinite(loop.end);
  dom.loopToggleButton.style.opacity = hasLoop ? '1' : '0.45';
  dom.loopDeleteButton.style.opacity = hasLoop ? '1' : '0.45';
}

function updateMarkerLayer() {
  const video = state.currentVideo;
  if (!video) return;
  const duration = Number.isFinite(dom.playerVideo.duration) ? dom.playerVideo.duration : 0;
  if (duration <= 0) {
    dom.markerLayer.innerHTML = '';
    return;
  }
  const markers = Array.isArray(video.markers) ? [...video.markers].sort((a, b) => a - b) : [];
  dom.markerLayer.innerHTML = markers.map((marker) => {
    const left = clamp((marker / duration) * 100, 0, 100);
    return `<span class="marker-pin" style="left:${left}%" title="${formatTime(marker)}"></span>`;
  }).join('');
}

async function saveCurrentVideo() {
  if (!state.currentVideo) return;
  state.currentVideo.updatedAt = Date.now();
  await putVideo(state.currentVideo);
  syncVideo(state.currentVideo);
  renderLibrary();
}

function seek(seconds) {
  if (!dom.playerVideo.duration) return;
  dom.playerVideo.currentTime = clamp(seconds, 0, dom.playerVideo.duration || 0);
  updateProgressUi();
}

function getNearestMarkerBeforeCurrent() {
  const markers = Array.isArray(state.currentVideo?.markers) ? [...state.currentVideo.markers].sort((a, b) => a - b) : [];
  const current = dom.playerVideo.currentTime || 0;
  const before = markers.filter((marker) => marker < current - 0.05);
  if (before.length === 0) return null;
  return before[before.length - 1];
}

async function addMarker() {
  if (!state.currentVideo || !Number.isFinite(dom.playerVideo.currentTime)) return;
  const time = roundToHundredth(dom.playerVideo.currentTime);
  state.currentVideo.markers = Array.isArray(state.currentVideo.markers) ? state.currentVideo.markers : [];
  state.currentVideo.markers.push(time);
  state.currentVideo.markers.sort((a, b) => a - b);
  state.currentVideo.markers = dedupeSorted(state.currentVideo.markers);
  await saveCurrentVideo();
  updateMarkerLayer();
}

async function jumpToMarker() {
  if (!state.currentVideo) return;
  const marker = getNearestMarkerBeforeCurrent();
  seek(marker ?? 0);
}

async function deleteMarker() {
  if (!state.currentVideo) return;
  const marker = getNearestMarkerBeforeCurrent();
  if (marker == null) return;
  state.currentVideo.markers = state.currentVideo.markers.filter((value) => value !== marker);
  await saveCurrentVideo();
  updateMarkerLayer();
}

function roundToHundredth(value) {
  return Math.round(value * 100) / 100;
}

function dedupeSorted(values) {
  const result = [];
  for (const value of values) {
    if (result.length === 0 || Math.abs(result[result.length - 1] - value) > 0.01) result.push(value);
  }
  return result;
}

async function setLoopPoint() {
  if (!state.currentVideo) return;
  const time = roundToHundredth(dom.playerVideo.currentTime || 0);
  if (!state.currentVideo.loop || (state.currentVideo.loop.start != null && state.currentVideo.loop.end != null)) {
    state.currentVideo.loop = { start: time, end: null, enabled: false };
  } else if (state.currentVideo.loop.start == null) {
    state.currentVideo.loop.start = time;
  } else if (state.currentVideo.loop.end == null) {
    const start = state.currentVideo.loop.start;
    const [left, right] = start <= time ? [start, time] : [time, start];
    state.currentVideo.loop = { start: left, end: right, enabled: false };
  }
  await saveCurrentVideo();
  updateLoopUi();
  updateProgressUi();
}

async function toggleLoop() {
  if (!state.currentVideo?.loop || state.currentVideo.loop.start == null || state.currentVideo.loop.end == null) return;
  state.currentVideo.loop.enabled = !state.currentVideo.loop.enabled;
  await saveCurrentVideo();
  updateLoopUi();
}

async function deleteLoop() {
  if (!state.currentVideo?.loop || state.currentVideo.loop.start == null || state.currentVideo.loop.end == null) return;
  state.currentVideo.loop = defaultLoop();
  await saveCurrentVideo();
  updateLoopUi();
  updateProgressUi();
}

function changeSpeed(delta) {
  state.speed = clamp(roundToHundredth(state.speed + delta), 0.25, 4.0);
  dom.playerVideo.playbackRate = state.speed;
  dom.speedValue.textContent = `${state.speed.toFixed(2)}x`;
}

function toggleMirror() {
  state.mirrored = !state.mirrored;
  dom.playerVideo.style.transform = state.mirrored ? 'scaleX(-1)' : 'scaleX(1)';
}

function togglePlayback() {
  if (dom.playerVideo.paused) {
    dom.playerVideo.play().catch(() => {});
  } else {
    dom.playerVideo.pause();
  }
  updatePlayButton();
}

function attachPlayerRestrictions() {
  dom.playerStage.addEventListener('contextmenu', (event) => event.preventDefault());
  dom.playerStage.addEventListener('dragstart', (event) => event.preventDefault());
}

function setupProgressSeeking() {
  const seekFromPointer = (event) => {
    if (!dom.playerVideo.duration) return;
    const rect = dom.progressTrack.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, rect.width);
    const percent = rect.width > 0 ? x / rect.width : 0;
    seek(percent * dom.playerVideo.duration);
  };

  dom.progressTrack.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    seekFromPointer(event);
  });
}

function updateLoopOnTick() {
  if (!state.currentVideo?.loop || !state.currentVideo.loop.enabled) return;
  const { start, end } = state.currentVideo.loop;
  if (start == null || end == null) return;
  if (dom.playerVideo.currentTime >= end - 0.03) {
    dom.playerVideo.currentTime = start;
    dom.playerVideo.play().catch(() => {});
  }
}

function registerEvents() {
  dom.fileInput.addEventListener('change', (event) => importFiles(event.target.files));
  dom.openTagEditorButton.addEventListener('click', openTagEditorModal);
  dom.clearFiltersButton.addEventListener('click', () => {
    state.filters = { search: '', tagId: 'all', sort: 'addedDesc' };
    dom.searchInput.value = '';
    dom.tagFilterSelect.value = 'all';
    dom.sortSelect.value = 'addedDesc';
    renderAll();
  });

  dom.searchInput.addEventListener('input', (event) => {
    state.filters.search = event.target.value;
    renderSummary();
    renderLibrary();
  });
  dom.tagFilterSelect.addEventListener('change', (event) => {
    state.filters.tagId = event.target.value;
    renderAll();
  });
  dom.sortSelect.addEventListener('change', (event) => {
    state.filters.sort = event.target.value;
    renderAll();
  });

  dom.videoGrid.addEventListener('click', (event) => {
    const card = event.target.closest('.video-card');
    if (!card) return;
    const action = event.target.closest('[data-action]')?.dataset.action;
    const id = event.target.closest('[data-id]')?.dataset.id || card.dataset.videoId;
    if (action === 'delete') return removeVideo(id);
    if (action === 'rename') return openRenameModal(id);
    if (action === 'edit-tags') return openFileTagModal(id);
    return openVideo(id);
  });

  dom.videoGrid.addEventListener('keydown', (event) => {
    const card = event.target.closest('.video-card');
    if (!card) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openVideo(card.dataset.videoId);
    }
  });

  dom.backToLibraryButton.addEventListener('click', () => {
    closePlayer();
    setView('library');
    renderAll();
  });
  dom.playPauseButton.addEventListener('click', togglePlayback);
  dom.jumpBack3Button.addEventListener('click', () => seek((dom.playerVideo.currentTime || 0) - 3));
  dom.jumpForward3Button.addEventListener('click', () => seek((dom.playerVideo.currentTime || 0) + 3));
  dom.jumpBack5Button.addEventListener('click', () => seek((dom.playerVideo.currentTime || 0) - 5));
  dom.jumpForward5Button.addEventListener('click', () => seek((dom.playerVideo.currentTime || 0) + 5));
  dom.mirrorButton.addEventListener('click', toggleMirror);
  dom.speedButton.addEventListener('click', (event) => {
    if (event.shiftKey || event.altKey) changeSpeed(-0.05);
    else changeSpeed(0.05);
  });
  dom.markerJumpButton.addEventListener('click', jumpToMarker);
  dom.markerAddButton.addEventListener('click', addMarker);
  dom.markerDeleteButton.addEventListener('click', deleteMarker);
  dom.loopSetButton.addEventListener('click', setLoopPoint);
  dom.loopToggleButton.addEventListener('click', toggleLoop);
  dom.loopDeleteButton.addEventListener('click', deleteLoop);
  dom.hideUiButton.addEventListener('click', () => {
    state.uiVisible = false;
    updatePlayerUiVisibility();
  });
  dom.showUiButton.addEventListener('click', () => {
    state.uiVisible = true;
    updatePlayerUiVisibility();
  });

  dom.playerVideo.addEventListener('play', updatePlayButton);
  dom.playerVideo.addEventListener('pause', updatePlayButton);
  dom.playerVideo.addEventListener('loadedmetadata', () => {
    updateProgressUi();
    updateMarkerLayer();
  });
  dom.playerVideo.addEventListener('timeupdate', () => {
    updateProgressUi();
    updateLoopOnTick();
  });
  dom.playerVideo.addEventListener('progress', updateProgressUi);
  dom.playerVideo.addEventListener('seeked', updateProgressUi);
  dom.playerVideo.addEventListener('ended', updatePlayButton);
  dom.playerVideo.addEventListener('contextmenu', (event) => event.preventDefault());

  setupProgressSeeking();
  attachPlayerRestrictions();
  document.addEventListener('keydown', (event) => {
    if (dom.modalOverlay.hidden === false && event.key === 'Escape') {
      closeModal();
      return;
    }
    if (state.view === 'player') {
      if (event.key === 'Escape') {
        closePlayer();
        setView('library');
        renderAll();
      }
      if (event.code === 'Space') {
        event.preventDefault();
        togglePlayback();
      }
      if (event.key === 'ArrowLeft') seek((dom.playerVideo.currentTime || 0) - (event.shiftKey ? 5 : 3));
      if (event.key === 'ArrowRight') seek((dom.playerVideo.currentTime || 0) + (event.shiftKey ? 5 : 3));
    }
  });

  window.addEventListener('resize', updateOrientation);
  window.addEventListener('orientationchange', updateOrientation);
}


async function boot() {
  renderIcons(document);
  updateOrientation();
  registerEvents();
  await initStorage();
  await refreshData();
  setView('library');
  updatePlayerUiVisibility();
}

boot().catch((error) => {
  console.error(error);
  dom.librarySummary.textContent = '初期化に失敗しました。';
});
