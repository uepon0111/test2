/* =====================================================
   js/tagEditor.js - Tag editor modal logic
   ===================================================== */

const TagEditor = (() => {

  const modal     = document.getElementById('modal-tag-editor');
  const listEl    = document.getElementById('tag-editor-list');
  const btnOpen   = document.getElementById('btn-open-tag-editor');
  const btnClose  = document.getElementById('btn-close-tag-editor');
  const nameInput = document.getElementById('new-tag-name');
  const colorInput= document.getElementById('new-tag-color');
  const btnAdd    = document.getElementById('btn-add-tag');

  /* Drag state */
  let dragSrc = null;

  function init() {
    btnOpen.addEventListener('click', open);
    btnClose.addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    btnAdd.addEventListener('click', addTag);
    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') addTag(); });
  }

  function open() {
    renderList();
    modal.classList.remove('hidden');
  }

  function close() {
    modal.classList.add('hidden');
    if (window.FileList) FileList.render();
  }

  function renderList() {
    const tags = Store.getTags();
    listEl.innerHTML = '';

    if (!tags.length) {
      listEl.innerHTML = '<p style="color:var(--text3);font-size:13px;padding:4px 0;">タグがまだありません</p>';
      return;
    }

    tags.forEach(tag => {
      const item = buildTagItem(tag);
      listEl.appendChild(item);
    });
  }

  function buildTagItem(tag) {
    const item = document.createElement('div');
    item.className = 'tag-editor-item';
    item.dataset.id = tag.id;
    item.draggable  = true;

    /* Drag handle */
    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.setAttribute('aria-hidden', 'true');
    handle.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;

    /* Color swatch */
    const swatch = document.createElement('div');
    swatch.className = 'tag-color-swatch';
    swatch.style.background = tag.color;

    const colorPicker = document.createElement('input');
    colorPicker.type  = 'color';
    colorPicker.value = tag.color;
    colorPicker.setAttribute('aria-label', 'タグの色');
    colorPicker.addEventListener('input', () => {
      swatch.style.background = colorPicker.value;
    });
    colorPicker.addEventListener('change', async () => {
      await Store.updateTag(tag.id, { color: colorPicker.value });
    });
    swatch.appendChild(colorPicker);

    /* Name input */
    const nameEl = document.createElement('input');
    nameEl.type      = 'text';
    nameEl.className = 'tag-editor-name-input';
    nameEl.value     = tag.name;
    nameEl.maxLength = 30;
    nameEl.addEventListener('change', async () => {
      const v = nameEl.value.trim();
      if (v) await Store.updateTag(tag.id, { name: v });
      else nameEl.value = tag.name;
    });

    /* Delete */
    const btnDel = document.createElement('button');
    btnDel.className = 'tag-del-btn';
    btnDel.setAttribute('aria-label', 'タグを削除');
    btnDel.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    btnDel.addEventListener('click', async () => {
      await Store.deleteTag(tag.id);
      renderList();
    });

    item.appendChild(handle);
    item.appendChild(swatch);
    item.appendChild(nameEl);
    item.appendChild(btnDel);

    /* --- Drag-and-drop reorder --- */
    item.addEventListener('dragstart', e => {
      dragSrc = item;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      listEl.querySelectorAll('.tag-editor-item').forEach(i => i.classList.remove('drag-over'));
      saveNewOrder();
    });
    item.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      listEl.querySelectorAll('.tag-editor-item').forEach(i => i.classList.remove('drag-over'));
      if (item !== dragSrc) item.classList.add('drag-over');
    });
    item.addEventListener('drop', e => {
      e.preventDefault();
      if (dragSrc && dragSrc !== item) {
        const items = Array.from(listEl.querySelectorAll('.tag-editor-item'));
        const srcIdx = items.indexOf(dragSrc);
        const dstIdx = items.indexOf(item);
        if (dstIdx > srcIdx) item.after(dragSrc);
        else item.before(dragSrc);
      }
    });

    /* Touch drag for mobile */
    setupTouchDrag(item);

    return item;
  }

  async function saveNewOrder() {
    const newOrder = Array.from(listEl.querySelectorAll('.tag-editor-item')).map(el => el.dataset.id);
    await Store.reorderTags(newOrder);
  }

  /* --- Touch drag (mobile reorder) --- */
  function setupTouchDrag(item) {
    let startY = 0, startTop = 0, clone = null;

    const handle = item.querySelector('.drag-handle');
    handle.addEventListener('touchstart', e => {
      e.preventDefault();
      const touch = e.touches[0];
      startY   = touch.clientY;
      const rect = item.getBoundingClientRect();
      startTop = rect.top;

      clone = item.cloneNode(true);
      clone.style.cssText = `
        position:fixed; left:${rect.left}px; top:${rect.top}px;
        width:${rect.width}px; opacity:.75; z-index:9999; pointer-events:none;
        background:var(--accent-bg); border-color:var(--accent);
        transition:none;
      `;
      document.body.appendChild(clone);
      item.style.opacity = '.3';
    }, { passive: false });

    handle.addEventListener('touchmove', e => {
      e.preventDefault();
      if (!clone) return;
      const touch = e.touches[0];
      const dy = touch.clientY - startY;
      clone.style.top = (startTop + dy) + 'px';

      /* Find target element */
      const cloneRect = clone.getBoundingClientRect();
      const cloneCY   = cloneRect.top + cloneRect.height / 2;
      const siblings  = Array.from(listEl.querySelectorAll('.tag-editor-item')).filter(el => el !== item);

      siblings.forEach(sib => sib.classList.remove('drag-over'));
      let target = null;
      for (const sib of siblings) {
        const r = sib.getBoundingClientRect();
        if (cloneCY >= r.top && cloneCY <= r.bottom) { target = sib; break; }
      }
      if (target) target.classList.add('drag-over');
    }, { passive: false });

    handle.addEventListener('touchend', async () => {
      if (!clone) return;
      clone.remove(); clone = null;
      item.style.opacity = '';
      listEl.querySelectorAll('.tag-editor-item').forEach(sib => {
        if (sib !== item && sib.classList.contains('drag-over')) {
          sib.classList.remove('drag-over');
          const items = Array.from(listEl.querySelectorAll('.tag-editor-item'));
          if (items.indexOf(sib) > items.indexOf(item)) sib.after(item);
          else sib.before(item);
        }
      });
      await saveNewOrder();
    });
  }

  /* --- Add tag --- */
  async function addTag() {
    const name = nameInput.value.trim();
    if (!name) return;
    await Store.addTag(name, colorInput.value);
    nameInput.value = '';
    colorInput.value = '#3b82f6';
    renderList();
  }

  return { init };
})();
