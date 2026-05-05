import { applyIcons } from './icons.js';
import {
  openDatabase,
  getAllVideos,
  getAllTags,
  getVideo,
  addFiles,
  putVideo,
  updateVideoFields,
  deleteVideo as deleteVideoRecord,
  putTag,
  deleteTag as deleteTagRecord,
} from './db.js';
import { renderListView, bindListEvents } from './listView.js';
import { createPlayerController } from './playerView.js';

function qs(id){
  return document.getElementById(id);
}

function makeDefaultPrefs(){
  return {
    search: '',
    sortKey: 'addedAt',
    sortDir: 'desc',
    tagIds: [],
  };
}

function loadPrefs(){
  try {
    const raw = localStorage.getItem('video-library-prefs');
    if (!raw) return makeDefaultPrefs();
    const parsed = JSON.parse(raw);
    return { ...makeDefaultPrefs(), ...parsed };
  } catch {
    return makeDefaultPrefs();
  }
}

function savePrefs(prefs){
  localStorage.setItem('video-library-prefs', JSON.stringify(prefs));
}

function uniqueTagOrder(tags){
  return [...tags].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((tag, index) => ({ ...tag, order: index }));
}

function normalizeTags(tags){
  return uniqueTagOrder(tags).map((tag, index) => ({ ...tag, order: index }));
}

function createModal(titleText){
  const template = qs('modal-template');
  const fragment = template.content.cloneNode(true);
  document.body.appendChild(fragment);

  const mountedBackdrop = document.body.lastElementChild;
  const mountedModal = mountedBackdrop.querySelector('.modal');
  const mountedTitle = mountedBackdrop.querySelector('.modal-title');
  const mountedBody = mountedBackdrop.querySelector('.modal-body');
  const mountedActions = mountedBackdrop.querySelector('.modal-actions');
  mountedTitle.textContent = titleText;

  function close(){
    mountedBackdrop.remove();
  }

  mountedBackdrop.addEventListener('click', (event) => {
    if (event.target === mountedBackdrop) close();
  });
  mountedModal.querySelector('.modal-close').addEventListener('click', close);

  return { backdrop: mountedBackdrop, modal: mountedModal, body: mountedBody, actions: mountedActions, close };
}

function iconButton(label, iconName, className = 'small-round'){
  return `<button type="button" class="${className}" aria-label="${label}"><span class="icon" data-icon="${iconName}"></span></button>`;
}

const app = {
  db: null,
  state: {
    videos: [],
    tags: [],
    filters: loadPrefs(),
  },
  player: null,
  modal: null,
  loadingCount: 0,
  currentVideoId: null,
  render(){
    renderListView(app);
    applyIcons(document);
  },
  persistUIState(){
    savePrefs(app.state.filters);
  },
  async load(){
    app.db = await openDatabase();
    await app.reloadData();
    bindListEvents(app);
    app.player = createPlayerController(app);
    app.render();
    applyIcons(document);
    window.addEventListener('beforeunload', async () => {
      app.player?.close();
    });
  },
  async reloadData(){
    const [videos, tags] = await Promise.all([getAllVideos(app.db), getAllTags(app.db)]);
    app.state.videos = videos;
    app.state.tags = normalizeTags(tags);
  },
  showLoading(text, percent){
    app.loadingCount += 1;
    let overlay = document.getElementById('global-loading');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'global-loading';
      overlay.className = 'loading-overlay';
      overlay.innerHTML = `
        <div class="loading-card">
          <div class="spinner" aria-hidden="true"></div>
          <div class="loading-text" id="global-loading-text"></div>
          <div class="loading-bar"><div class="loading-bar-fill" id="global-loading-fill"></div></div>
        </div>
      `;
      document.body.appendChild(overlay);
    }
    overlay.classList.remove('hidden');
    qs('global-loading-text').textContent = text || '処理中…';
    qs('global-loading-fill').style.width = `${Math.max(0, Math.min(100, percent || 0))}%`;
  },
  hideLoading(){
    app.loadingCount = Math.max(0, app.loadingCount - 1);
    if (app.loadingCount === 0) {
      document.getElementById('global-loading')?.classList.add('hidden');
    }
  },
  async handleAddFiles(fileList){
    try {
      app.showLoading('ファイルを読み込んでいます…', 0);
      await addFiles(app.db, fileList, ({ fileName, fileIndex, fileCount, percent, phase }) => {
        const stage = phase === 'writing' ? '保存中' : '読み込み中';
        qs('global-loading-text').textContent = `${stage} ${fileIndex + 1}/${fileCount} : ${fileName}`;
        qs('global-loading-fill').style.width = `${percent}%`;
      });
      await app.reloadData();
      app.render();
    } finally {
      app.hideLoading();
    }
  },
  async deleteVideo(videoId){
    const video = await getVideo(app.db, videoId);
    if (!video) return;
    if (!confirm(`「${video.displayName || video.fileName}」を削除しますか？`)) return;
    try {
      app.showLoading('削除中…', 0);
      if (app.currentVideoId === videoId) {
        app.player?.pause();
        app.player?.close();
        app.goList();
      }
      await deleteVideoRecord(app.db, videoId);
      await app.reloadData();
      app.render();
    } finally {
      app.hideLoading();
    }
  },
  async openVideoEditor(videoId){
    const video = await getVideo(app.db, videoId);
    if (!video) return;
    const modal = createModal('ファイル名とタグを編集');
    const tagMap = new Map(app.state.tags.map((tag) => [tag.id, tag]));
    const picked = new Set(video.tags || []);

    modal.body.innerHTML = `
      <div class="form-grid">
        <div class="input-stack">
          <label class="field-label" for="edit-display-name">表示名</label>
          <input id="edit-display-name" type="text" value="${video.displayName || ''}" />
        </div>
        <div class="input-stack">
          <div class="field-label">元のファイル名</div>
          <div class="helper">${video.fileName || ''}</div>
        </div>
        <div class="input-stack">
          <div class="field-label">タグ</div>
          <div id="edit-video-tags" class="video-tag-picker"></div>
        </div>
      </div>
    `;

    const picker = modal.body.querySelector('#edit-video-tags');
    picker.innerHTML = app.state.tags.length
      ? app.state.tags.map((tag) => `
        <label class="check-chip">
          <input type="checkbox" data-tag-id="${tag.id}" ${picked.has(tag.id) ? 'checked' : ''} />
          <span class="swatch" style="background:${tag.color}"></span>
          <span>${tag.name}</span>
        </label>
      `).join('')
      : '<div class="helper">タグがありません。先にタグ編集画面で作成してください。</div>';

    modal.actions.innerHTML = `
      <button type="button" class="small-round" id="cancel-edit">×</button>
      <button type="button" class="square-button accent" style="width:auto; min-width:120px; padding:0 16px; border-radius:16px;" id="save-edit">保存</button>
    `;
    modal.actions.querySelector('#cancel-edit').addEventListener('click', modal.close);
    modal.actions.querySelector('#save-edit').addEventListener('click', async () => {
      const displayName = modal.body.querySelector('#edit-display-name').value.trim() || video.fileName;
      const tagIds = [...modal.body.querySelectorAll('input[data-tag-id]:checked')].map((input) => input.getAttribute('data-tag-id'));
      await putVideo(app.db, { ...video, displayName, tags: tagIds });
      await app.reloadData();
      app.render();
      modal.close();
    });
    applyIcons(modal.body);
    applyIcons(modal.actions);
  },
  async openTagEditor(){
    const modal = createModal('タグ編集');
    let tags = await getAllTags(app.db);
    tags = normalizeTags(tags.length ? tags : []);
    async function saveAll(){
      const rows = [...modal.body.querySelectorAll('.tag-row')];
      const next = rows.map((row, index) => ({
        id: row.dataset.tagId || crypto.randomUUID(),
        name: row.querySelector('[data-role="tag-name"]').value.trim() || 'タグ',
        color: row.querySelector('[data-role="tag-color"]').value || '#4a7bd6',
        order: index,
      })).filter((tag) => tag.name);
      const cleaned = normalizeTags(next);
      const existingIds = new Set(cleaned.map((t) => t.id));

      const videos = app.state.videos.map((video) => ({
        ...video,
        tags: (video.tags || []).filter((id) => existingIds.has(id)),
      }));

      const tx = app.db.transaction(['tags', 'videos'], 'readwrite');
      const tagStore = tx.objectStore('tags');
      const videoStore = tx.objectStore('videos');
      tagStore.clear();
      videoStore.clear();
      for (const tag of cleaned) tagStore.put(tag);
      for (const video of videos) videoStore.put(video);

      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });

      await app.reloadData();
      app.render();
    }

    function renderRows(){
      modal.body.innerHTML = `
        <div class="tag-editor">
          <div class="helper">表示順は上下ボタンで変更できます。色は任意で変更できます。</div>
          <div id="tag-rows"></div>
          <div>
            <button type="button" class="square-button accent" id="add-tag-row" style="width:auto; min-width:140px; padding:0 16px; border-radius:16px;">
              <span class="icon" data-icon="add"></span>
              <span style="margin-left:8px;">タグを追加</span>
            </button>
          </div>
        </div>
      `;
      const rows = modal.body.querySelector('#tag-rows');
      rows.innerHTML = tags.map((tag) => `
        <div class="tag-row" data-tag-id="${tag.id}">
          <div class="tag-order">
            <button type="button" class="small-round" data-action="up" aria-label="上へ移動">↑</button>
            <button type="button" class="small-round" data-action="down" aria-label="下へ移動">↓</button>
          </div>
          <div class="preview">
            <span class="swatch" style="background:${tag.color}"></span>
            <input data-role="tag-name" type="text" value="${tag.name}" />
          </div>
          <input data-role="tag-color" type="color" value="${tag.color}" aria-label="タグの色" />
          <div class="actions">
            <button type="button" class="small-round danger" data-action="remove" aria-label="削除">×</button>
          </div>
        </div>
      `).join('') || '<div class="empty-state"><strong>タグがありません</strong><div>追加ボタンから作成してください。</div></div>';

      modal.body.querySelector('#add-tag-row').addEventListener('click', () => {
        tags.push({
          id: crypto.randomUUID(),
          name: `タグ${tags.length + 1}`,
          color: '#4a7bd6',
          order: tags.length,
        });
        renderRows();
      });

      rows.querySelectorAll('[data-action="up"]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const row = btn.closest('.tag-row');
          const index = tags.findIndex((tag) => tag.id === row.dataset.tagId);
          if (index > 0) {
            [tags[index - 1], tags[index]] = [tags[index], tags[index - 1]];
            tags = normalizeTags(tags);
            renderRows();
          }
        });
      });
      rows.querySelectorAll('[data-action="down"]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const row = btn.closest('.tag-row');
          const index = tags.findIndex((tag) => tag.id === row.dataset.tagId);
          if (index < tags.length - 1) {
            [tags[index + 1], tags[index]] = [tags[index], tags[index + 1]];
            tags = normalizeTags(tags);
            renderRows();
          }
        });
      });
      rows.querySelectorAll('[data-action="remove"]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const row = btn.closest('.tag-row');
          tags = tags.filter((tag) => tag.id !== row.dataset.tagId);
          tags = normalizeTags(tags);
          renderRows();
        });
      });
      rows.querySelectorAll('input[data-role="tag-name"], input[data-role="tag-color"]').forEach((input) => {
        input.addEventListener('input', () => {
          const row = input.closest('.tag-row');
          const tag = tags.find((item) => item.id === row.dataset.tagId);
          if (!tag) return;
          tag.name = row.querySelector('[data-role="tag-name"]').value.trim();
          tag.color = row.querySelector('[data-role="tag-color"]').value;
        });
      });
    }

    renderRows();

    modal.actions.innerHTML = `
      <button type="button" class="square-button" style="width:auto; min-width:120px; padding:0 16px; border-radius:16px;" id="close-tags">閉じる</button>
      <button type="button" class="square-button accent" style="width:auto; min-width:120px; padding:0 16px; border-radius:16px;" id="save-tags">保存</button>
    `;
    modal.actions.querySelector('#close-tags').addEventListener('click', modal.close);
    modal.actions.querySelector('#save-tags').addEventListener('click', async () => {
      await saveAll();
      modal.close();
    });
    applyIcons(modal.body);
  },
  async openPlayer(videoId){
    const video = await getVideo(app.db, videoId);
    if (!video) return;
    app.currentVideoId = videoId;
    document.getElementById('view-list').classList.add('hidden');
    document.getElementById('view-player').classList.remove('hidden');
    await app.player.open(video);
  },
  goList(){
    app.currentVideoId = null;
    app.player?.close();
    document.getElementById('view-player').classList.add('hidden');
    document.getElementById('view-list').classList.remove('hidden');
    app.render();
  },
  showPlayerView(){
    document.getElementById('view-list').classList.add('hidden');
    document.getElementById('view-player').classList.remove('hidden');
  },
  async saveVideo(video){
    await putVideo(app.db, video);
    await app.reloadData();
    if (app.currentVideoId === video.id) {
      app.player?.sync();
    } else {
      app.render();
    }
  },
};

window.app = app;
await app.load();
