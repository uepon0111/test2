const DB_NAME = 'video_library_player';
const DB_VERSION = 1;
const VIDEO_STORE = 'videos';
const TAG_STORE = 'tags';

function requestToPromise(request){
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function openDatabase(){
  return new Promise((resolve, reject) => {
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
}

export async function getAllVideos(db){
  const tx = db.transaction(VIDEO_STORE, 'readonly');
  const store = tx.objectStore(VIDEO_STORE);
  const items = await requestToPromise(store.getAll());
  return items.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
}

export async function getVideo(db, id){
  const tx = db.transaction(VIDEO_STORE, 'readonly');
  const store = tx.objectStore(VIDEO_STORE);
  return await requestToPromise(store.get(id));
}

export async function putVideo(db, video){
  const tx = db.transaction(VIDEO_STORE, 'readwrite');
  tx.objectStore(VIDEO_STORE).put(video);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  return video;
}

export async function deleteVideo(db, id){
  const tx = db.transaction(VIDEO_STORE, 'readwrite');
  tx.objectStore(VIDEO_STORE).delete(id);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getAllTags(db){
  const tx = db.transaction(TAG_STORE, 'readonly');
  const store = tx.objectStore(TAG_STORE);
  const items = await requestToPromise(store.getAll());
  return items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function putTag(db, tag){
  const tx = db.transaction(TAG_STORE, 'readwrite');
  tx.objectStore(TAG_STORE).put(tag);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  return tag;
}

export async function deleteTag(db, id){
  const tx = db.transaction(TAG_STORE, 'readwrite');
  tx.objectStore(TAG_STORE).delete(id);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getCounts(db){
  const [videos, tags] = await Promise.all([getAllVideos(db), getAllTags(db)]);
  return { videos, tags };
}

async function fileToBlob(file, onFileProgress){
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable && onFileProgress) {
        onFileProgress({ loaded: event.loaded, total: event.total });
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      resolve(new Blob([reader.result], { type: file.type || 'video/*' }));
    };
    reader.readAsArrayBuffer(file);
  });
}

export async function addFiles(db, files, onProgress){
  const list = [...files];
  const totalBytes = list.reduce((sum, file) => sum + file.size, 0);
  let doneBytes = 0;

  const records = [];
  for (let index = 0; index < list.length; index += 1) {
    const file = list[index];
    const beforeBytes = doneBytes;
    const blob = await fileToBlob(file, ({ loaded, total }) => {
      if (onProgress) {
        onProgress({
          phase: 'reading',
          fileName: file.name,
          fileIndex: index,
          fileCount: list.length,
          totalBytes,
          loadedBytes: beforeBytes + loaded,
          percent: Math.min(100, Math.round(((beforeBytes + loaded) / Math.max(totalBytes, 1)) * 100)),
        });
      }
    });

    doneBytes += file.size;
    const record = {
      id: crypto.randomUUID(),
      fileName: file.name,
      displayName: file.name,
      addedAt: Date.now(),
      mimeType: blob.type || file.type || 'video/*',
      blob,
      tags: [],
      markers: [],
      loop: null,
      lastTime: 0,
      playbackRate: 1,
      mirror: false,
    };
    records.push(record);

    if (onProgress) {
      onProgress({
        phase: 'writing',
        fileName: file.name,
        fileIndex: index,
        fileCount: list.length,
        totalBytes,
        loadedBytes: doneBytes,
        percent: Math.min(100, Math.round((doneBytes / Math.max(totalBytes, 1)) * 100)),
      });
    }
  }

  const tx = db.transaction(VIDEO_STORE, 'readwrite');
  const store = tx.objectStore(VIDEO_STORE);
  for (const record of records) {
    store.put(record);
  }
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

  return records;
}

export async function updateVideoFields(db, id, patch){
  const video = await getVideo(db, id);
  if (!video) return null;
  const updated = { ...video, ...patch };
  await putVideo(db, updated);
  return updated;
}

export async function replaceVideo(db, updated){
  await putVideo(db, updated);
  return updated;
}

export async function updateAllVideos(db, updater){
  const videos = await getAllVideos(db);
  const tx = db.transaction(VIDEO_STORE, 'readwrite');
  const store = tx.objectStore(VIDEO_STORE);
  for (const video of videos) {
    store.put(updater(video));
  }
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  return videos;
}
