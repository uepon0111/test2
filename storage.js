const DB_NAME = 'video_page_db';
const DB_VERSION = 1;
const VIDEO_STORE = 'videos';
const TAG_STORE = 'tags';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VIDEO_STORE)) {
        db.createObjectStore(VIDEO_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(TAG_STORE)) {
        const tagStore = db.createObjectStore(TAG_STORE, { keyPath: 'id' });
        tagStore.createIndex('order', 'order', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

export async function initStorage() {
  return openDb();
}

export async function getAllVideos() {
  const db = await openDb();
  const tx = db.transaction(VIDEO_STORE, 'readonly');
  const store = tx.objectStore(VIDEO_STORE);
  const items = await requestToPromise(store.getAll());
  await txDone(tx).catch(() => {});
  return items.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
}

export async function getVideo(id) {
  const db = await openDb();
  const tx = db.transaction(VIDEO_STORE, 'readonly');
  const store = tx.objectStore(VIDEO_STORE);
  const item = await requestToPromise(store.get(id));
  await txDone(tx).catch(() => {});
  return item || null;
}

export async function putVideo(video) {
  const db = await openDb();
  const tx = db.transaction(VIDEO_STORE, 'readwrite');
  const store = tx.objectStore(VIDEO_STORE);
  await requestToPromise(store.put(video));
  await txDone(tx);
  return video;
}

export async function deleteVideo(id) {
  const db = await openDb();
  const tx = db.transaction(VIDEO_STORE, 'readwrite');
  const store = tx.objectStore(VIDEO_STORE);
  await requestToPromise(store.delete(id));
  await txDone(tx);
}

export async function clearVideos() {
  const db = await openDb();
  const tx = db.transaction(VIDEO_STORE, 'readwrite');
  const store = tx.objectStore(VIDEO_STORE);
  await requestToPromise(store.clear());
  await txDone(tx);
}

export async function getAllTags() {
  const db = await openDb();
  const tx = db.transaction(TAG_STORE, 'readonly');
  const store = tx.objectStore(TAG_STORE);
  const items = await requestToPromise(store.getAll());
  await txDone(tx).catch(() => {});
  return items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function putTag(tag) {
  const db = await openDb();
  const tx = db.transaction(TAG_STORE, 'readwrite');
  const store = tx.objectStore(TAG_STORE);
  await requestToPromise(store.put(tag));
  await txDone(tx);
  return tag;
}

export async function deleteTag(tagId) {
  const db = await openDb();
  const tx = db.transaction([TAG_STORE, VIDEO_STORE], 'readwrite');
  const tagStore = tx.objectStore(TAG_STORE);
  const videoStore = tx.objectStore(VIDEO_STORE);
  await requestToPromise(tagStore.delete(tagId));
  const allVideos = await requestToPromise(videoStore.getAll());
  for (const video of allVideos) {
    if (!Array.isArray(video.tags)) continue;
    const nextTags = video.tags.filter((id) => id !== tagId);
    if (nextTags.length !== video.tags.length) {
      video.tags = nextTags;
      video.updatedAt = Date.now();
      await requestToPromise(videoStore.put(video));
    }
  }
  await txDone(tx);
}

export async function updateVideosWithTagRemoval(tagId) {
  const db = await openDb();
  const tx = db.transaction(VIDEO_STORE, 'readwrite');
  const videoStore = tx.objectStore(VIDEO_STORE);
  const allVideos = await requestToPromise(videoStore.getAll());
  for (const video of allVideos) {
    if (!Array.isArray(video.tags)) continue;
    const nextTags = video.tags.filter((id) => id !== tagId);
    if (nextTags.length !== video.tags.length) {
      video.tags = nextTags;
      video.updatedAt = Date.now();
      await requestToPromise(videoStore.put(video));
    }
  }
  await txDone(tx);
}

export async function replaceAllTags(tags) {
  const db = await openDb();
  const tx = db.transaction(TAG_STORE, 'readwrite');
  const store = tx.objectStore(TAG_STORE);
  await requestToPromise(store.clear());
  for (const tag of tags) {
    await requestToPromise(store.put(tag));
  }
  await txDone(tx);
}

export function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export async function nextTagOrder() {
  const tags = await getAllTags();
  const max = tags.reduce((acc, tag) => Math.max(acc, Number(tag.order) || 0), -1);
  return max + 1;
}

export function defaultLoop() {
  return { start: null, end: null, enabled: false };
}
