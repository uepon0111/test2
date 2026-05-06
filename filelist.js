/* =====================================================
   js/filelist.js - File list screen logic
   ===================================================== */

const FileList = (() => {

  /* --- State --- */
  let searchQuery    = '';
  let sortMode       = 'added-desc';
  let activeTagFilter = null; // tag id or null

  /* --- DOM refs --- */
  const grid         = document.getElementById('file-grid');
  const emptyState   = document.getElementById('fl-empty');
  const searchInput  = document.getElementById('search-input');
  const clearBtn     = document.getElementById('btn-search-clear');
  const sortSelect   = document.getElementById('sort-select');
  const tagFilterBar = document.getElementById('tag-filter-bar');
  const fileInput    = document.getElementById('file-input');
  const btnAddFile   = document.getElementById('btn-add-file');

  /* --- Init --- */
  function init() {
    btnAddFile.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileInput);
    searchInput.addEventListener('input', onSearch);
    clearBtn.addEventListener('click', clearSearch);
    sortSelect.addEventListener('change', () => { sortMode = sortSelect.value; render(); });
    render();
  }

  /* --- Search --- */
  function onSearch() {
    searchQuery = searchInput.value.trim().toLowerCase();
    clearBtn.classList.toggle('hidden', searchQuery === '');
    render();
  }

  function clearSearch() {
    searchInput.value = '';
    searchQuery = '';
    clearBtn.classList.add('hidden');
    render();
  }

  /* --- File input handler --- */
  async function handleFileInput(e) {
    const files = Array.from(e.target.files);
    e.target.value = '';
    if (!files.length) return;

    showLoading(`0 / ${files.length} 件 追加中...`);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      await Store.addFile(file, async (id, f) => {
        await dbSaveBlob(id, f, (pct) => {
          const base = (i / files.length) * 100;
          const part = (1 / files.length) * pct;
          updateLoadingProgress(base + part);
        });
      });
      document.getElementById('loading-message').textContent =
        `${i + 1} / ${files.length} 件 追加中...`;
    }
    hideLoading();
    render();
  }

  /* --- Delete file --- */
  async function deleteFile(id) {
    showLoading('削除中...');
    updateLoadingProgress(30);
    await Store.deleteFile(id);
    updateLoadingProgress(100);
    hideLoading();
    render();
  }

  /* --- Rename file (inline edit) --- */
  function startRename(id, cardEl) {
    const nameEl  = cardEl.querySelector('.file-name');
    const current = nameEl.textContent;
    const input   = document.createElement('input');
    input.className = 'file-name-input';
    input.value     = current;
    nameEl.replaceWith(input);
    input.focus(); input.select();

    const finish = async () => {
      const val = input.value.trim() || current;
      await Store.renameFile(id, val);
      render();
    };
    input.addEventListener('blur',  finish);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { input.blur(); }
      if (e.key === 'Escape') { input.value = current; input.blur(); }
    });
  }

  /* --- Filter / sort data --- */
  function getFilteredSorted() {
    let list = Store.getFiles().slice();

    /* Tag filter */
    if (activeTagFilter) {
      list = list.filter(f => f.tagIds.includes(activeTagFilter));
    }

    /* Search */
    if (searchQuery) {
      const tags = Store.getTags();
      list = list.filter(f => {
        if (f.name.toLowerCase().includes(searchQuery)) return true;
        return f.tagIds.some(tid => {
          const t = tags.find(t => t.id === tid);
          return t && t.name.toLowerCase().includes(searchQuery);
        });
      });
    }

    /* Sort */
    switch (sortMode) {
      case 'added-desc': list.sort((a,b) => b.addedAt - a.addedAt); break;
      case 'added-asc':  list.sort((a,b) => a.addedAt - b.addedAt); break;
      case 'name-asc':   list.sort((a,b) => a.name.localeCompare(b.name, 'ja')); break;
      case 'name-desc':  list.sort((a,b) => b.name.localeCompare(a.name, 'ja')); break;
    }
    return list;
  }

  /* --- Render tag filter bar --- */
  function renderTagFilterBar() {
    const tags = Store.getTags();
    tagFilterBar.innerHTML = '';
    if (!tags.length) return;

    tags.forEach(tag => {
      const chip = document.createElement('button');
      chip.className = 'tag-filter-chip';
      chip.textContent = tag.name;
      chip.style.borderColor = tag.color;
      chip.style.color = activeTagFilter === tag.id ? '#fff' : tag.color;
      chip.style.background = activeTagFilter === tag.id ? tag.color : 'transparent';
      chip.addEventListener('click', () => {
        activeTagFilter = (activeTagFilter === tag.id) ? null : tag.id;
        renderTagFilterBar();
        render();
      });
      tagFilterBar.appendChild(chip);
    });
  }

  /* --- Build file card DOM --- */
  function buildCard(file) {
    const tags = Store.getTags();
    const card = document.createElement('div');
    card.className = 'file-card';
    card.setAttribute('role', 'listitem');
    card.dataset.id = file.id;

    /* Prevent card-level click when clicking action buttons */
    card.addEventListener('click', e => {
      if (e.target.closest('.file-actions') ||
          e.target.closest('.file-name-input') ||
          e.target.closest('.file-tags')) return;
      openPlayer(file.id);
    });

    /* --- Top row: thumb + info + actions --- */
    const top = document.createElement('div');
    top.className = 'file-card-top';

    /* Thumb */
    const thumb = document.createElement('div');
    thumb.className = 'file-thumb';
    thumb.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`;

    /* Info */
    const info = document.createElement('div');
    info.className = 'file-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'file-name';
    nameEl.textContent = file.name;
    nameEl.title = file.name;

    const meta = document.createElement('div');
    meta.className = 'file-meta';
    const d = new Date(file.addedAt);
    meta.textContent = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}  ${humanSize(file.size)}`;

    info.appendChild(nameEl);
    info.appendChild(meta);

    /* Actions */
    const actions = document.createElement('div');
    actions.className = 'file-actions';

    /* Rename btn */
    const btnRename = document.createElement('button');
    btnRename.className = 'file-action-btn';
    btnRename.title = '名前を編集';
    btnRename.setAttribute('aria-label', '名前を編集');
    btnRename.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
    btnRename.addEventListener('click', e => { e.stopPropagation(); startRename(file.id, card); });

    /* Tag edit btn */
    const btnTag = document.createElement('button');
    btnTag.className = 'file-action-btn';
    btnTag.title = 'タグを編集';
    btnTag.setAttribute('aria-label', 'タグを編集');
    btnTag.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`;
    btnTag.addEventListener('click', e => { e.stopPropagation(); openFileTagModal(file.id); });

    /* Delete btn */
    const btnDel = document.createElement('button');
    btnDel.className = 'file-action-btn danger';
    btnDel.title = '削除';
    btnDel.setAttribute('aria-label', '削除');
    btnDel.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
    btnDel.addEventListener('click', e => { e.stopPropagation(); deleteFile(file.id); });

    actions.appendChild(btnRename);
    actions.appendChild(btnTag);
    actions.appendChild(btnDel);

    top.appendChild(thumb);
    top.appendChild(info);
    top.appendChild(actions);

    /* --- Tags row --- */
    const tagsRow = document.createElement('div');
    tagsRow.className = 'file-tags';
    file.tagIds.forEach(tid => {
      const t = tags.find(t => t.id === tid);
      if (!t) return;
      const chip = document.createElement('span');
      chip.className = 'file-tag-chip';
      chip.textContent = t.name;
      chip.style.background = t.color;
      tagsRow.appendChild(chip);
    });

    card.appendChild(top);
    if (file.tagIds.length) card.appendChild(tagsRow);
    return card;
  }

  /* --- Main render --- */
  function render() {
    renderTagFilterBar();
    const list = getFilteredSorted();
    grid.innerHTML = '';

    if (!Store.getFiles().length) {
      emptyState.style.display = 'flex';
      return;
    }
    emptyState.style.display = 'none';

    if (!list.length) {
      const msg = document.createElement('div');
      msg.style.cssText = 'color:var(--text3);font-size:14px;padding:32px 16px;text-align:center;grid-column:1/-1;';
      msg.textContent = '該当するファイルが見つかりません';
      grid.appendChild(msg);
      return;
    }

    list.forEach(f => grid.appendChild(buildCard(f)));
  }

  /* --- File tag modal --- */
  let _editingFileId = null;

  function openFileTagModal(fileId) {
    _editingFileId = fileId;
    const file  = Store.getFiles().find(f => f.id === fileId);
    const tags  = Store.getTags();
    const body  = document.getElementById('file-tags-body');
    body.innerHTML = '';

    if (!tags.length) {
      body.innerHTML = '<p style="color:var(--text3);font-size:14px;">タグがありません。先にタグを作成してください。</p>';
    } else {
      tags.forEach(tag => {
        const item = document.createElement('label');
        item.className = 'file-tag-checkbox-item';

        const cb = document.createElement('input');
        cb.type    = 'checkbox';
        cb.checked = file.tagIds.includes(tag.id);
        cb.addEventListener('change', async () => {
          const f = Store.getFiles().find(f => f.id === _editingFileId);
          let ids = f.tagIds.slice();
          if (cb.checked) { if (!ids.includes(tag.id)) ids.push(tag.id); }
          else             { ids = ids.filter(i => i !== tag.id); }
          await Store.setFileTags(_editingFileId, ids);
          render();
        });

        const lbl = document.createElement('span');
        lbl.className = 'file-tag-checkbox-label';

        const dot = document.createElement('span');
        dot.className = 'tag-dot-swatch';
        dot.style.background = tag.color;

        lbl.appendChild(dot);
        lbl.appendChild(document.createTextNode(tag.name));
        item.appendChild(cb);
        item.appendChild(lbl);
        body.appendChild(item);
      });
    }

    document.getElementById('modal-file-tags').classList.remove('hidden');
  }

  document.getElementById('btn-close-file-tags').addEventListener('click', () => {
    document.getElementById('modal-file-tags').classList.add('hidden');
  });
  document.getElementById('modal-file-tags').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
  });

  /* --- Open player --- */
  function openPlayer(fileId) {
    if (window.App) App.openPlayer(fileId);
  }

  return { init, render };
})();
