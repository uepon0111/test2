/* =====================================================
   js/store.js - Application state management
   ===================================================== */

/*
  State shape:
  {
    files: [{ id, name, addedAt, size, tagIds: [] }],
    tags:  [{ id, name, color, order }],
    playerData: {
      [fileId]: {
        markers: [seconds, ...],
        loop: { start: s|null, end: s|null } | null
      }
    }
  }
*/

const Store = (() => {

  let state = {
    files: [],
    tags: [],
    playerData: {}
  };

  /* ---------- Persistence ---------- */

  async function load() {
    const files      = await dbGet('files');
    const tags       = await dbGet('tags');
    const playerData = await dbGet('playerData');
    if (files)      state.files      = files;
    if (tags)       state.tags       = tags;
    if (playerData) state.playerData = playerData;
  }

  async function saveFiles()      { await dbSet('files',      state.files); }
  async function saveTags()       { await dbSet('tags',       state.tags); }
  async function savePlayerData() { await dbSet('playerData', state.playerData); }

  /* ---------- Files ---------- */

  function getFiles() { return state.files; }

  async function addFile(file, blobSaveCallback) {
    const id = genId();
    const meta = {
      id,
      name:    file.name,
      addedAt: Date.now(),
      size:    file.size,
      tagIds:  []
    };
    state.files.push(meta);
    await saveFiles();
    if (blobSaveCallback) await blobSaveCallback(id, file);
    return id;
  }

  async function deleteFile(id) {
    state.files = state.files.filter(f => f.id !== id);
    delete state.playerData[id];
    await saveFiles();
    await savePlayerData();
    await dbDeleteBlob(id);
  }

  async function renameFile(id, newName) {
    const f = state.files.find(f => f.id === id);
    if (f) { f.name = newName; await saveFiles(); }
  }

  async function setFileTags(id, tagIds) {
    const f = state.files.find(f => f.id === id);
    if (f) { f.tagIds = tagIds; await saveFiles(); }
  }

  /* ---------- Tags ---------- */

  function getTags() { return state.tags; }

  async function addTag(name, color) {
    const tag = { id: genId(), name, color, order: state.tags.length };
    state.tags.push(tag);
    await saveTags();
    return tag;
  }

  async function updateTag(id, changes) {
    const t = state.tags.find(t => t.id === id);
    if (t) { Object.assign(t, changes); await saveTags(); }
  }

  async function deleteTag(id) {
    state.tags = state.tags.filter(t => t.id !== id);
    state.files.forEach(f => {
      f.tagIds = f.tagIds.filter(tid => tid !== id);
    });
    await saveTags();
    await saveFiles();
  }

  async function reorderTags(newOrder) {
    /* newOrder: array of tag ids in desired sequence */
    newOrder.forEach((id, idx) => {
      const t = state.tags.find(t => t.id === id);
      if (t) t.order = idx;
    });
    state.tags.sort((a, b) => a.order - b.order);
    await saveTags();
  }

  /* ---------- Player data (markers, loop) ---------- */

  function getPlayerData(fileId) {
    if (!state.playerData[fileId]) {
      state.playerData[fileId] = { markers: [], loop: null };
    }
    return state.playerData[fileId];
  }

  async function addMarker(fileId, seconds) {
    const pd = getPlayerData(fileId);
    if (!pd.markers.includes(seconds)) {
      pd.markers.push(seconds);
      pd.markers.sort((a, b) => a - b);
      await savePlayerData();
    }
  }

  async function deleteNearestMarkerBefore(fileId, currentTime) {
    const pd = getPlayerData(fileId);
    /* Find nearest marker <= currentTime */
    const before = pd.markers.filter(m => m <= currentTime);
    if (before.length === 0) return;
    const nearest = before[before.length - 1];
    pd.markers = pd.markers.filter(m => m !== nearest);
    await savePlayerData();
    return nearest;
  }

  async function setLoopStart(fileId, seconds) {
    const pd = getPlayerData(fileId);
    if (!pd.loop) pd.loop = { start: null, end: null };
    pd.loop.start = seconds;
    pd.loop.end   = null; /* reset end when setting new start */
    await savePlayerData();
  }

  async function setLoopEnd(fileId, seconds) {
    const pd = getPlayerData(fileId);
    if (!pd.loop) pd.loop = { start: null, end: null };
    pd.loop.end = seconds;
    await savePlayerData();
  }

  async function deleteLoop(fileId) {
    const pd = getPlayerData(fileId);
    pd.loop = null;
    await savePlayerData();
  }

  return {
    load,
    getFiles, addFile, deleteFile, renameFile, setFileTags,
    getTags, addTag, updateTag, deleteTag, reorderTags,
    getPlayerData, addMarker, deleteNearestMarkerBefore,
    setLoopStart, setLoopEnd, deleteLoop
  };
})();
