/* =====================================================
   js/db.js - IndexedDB persistence layer
   ===================================================== */

const DB_NAME    = 'videoplayer-db';
const DB_VERSION = 2;

let _db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) { resolve(_db); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const db = e.target.result;
      /* Video blobs store */
      if (!db.objectStoreNames.contains('blobs')) {
        db.createObjectStore('blobs', { keyPath: 'id' });
      }
      /* App settings (tags, file meta, markers) */
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess  = e => { _db = e.target.result; resolve(_db); };
    req.onerror    = e => reject(e.target.error);
  });
}

/* --- Blob store --- */

function dbSaveBlob(id, blob, onProgress) {
  return new Promise(async (resolve, reject) => {
    const db = await openDB();

    /* Simulate chunked progress for UX */
    let pct = 0;
    const tick = setInterval(() => {
      pct = Math.min(pct + 4, 88);
      if (onProgress) onProgress(pct);
    }, 60);

    const tx  = db.transaction('blobs', 'readwrite');
    const req = tx.objectStore('blobs').put({ id, blob });
    req.onsuccess = () => {
      clearInterval(tick);
      if (onProgress) onProgress(100);
      resolve();
    };
    req.onerror = e => { clearInterval(tick); reject(e.target.error); };
  });
}

function dbGetBlob(id) {
  return new Promise(async (resolve, reject) => {
    const db  = await openDB();
    const tx  = db.transaction('blobs', 'readonly');
    const req = tx.objectStore('blobs').get(id);
    req.onsuccess = e => resolve(e.target.result ? e.target.result.blob : null);
    req.onerror   = e => reject(e.target.error);
  });
}

function dbDeleteBlob(id) {
  return new Promise(async (resolve, reject) => {
    const db  = await openDB();
    const tx  = db.transaction('blobs', 'readwrite');
    const req = tx.objectStore('blobs').delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

/* --- Settings store (JSON values) --- */

async function dbGet(key) {
  const db  = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('settings', 'readonly');
    const req = tx.objectStore('settings').get(key);
    req.onsuccess = e => resolve(e.target.result ? e.target.result.value : undefined);
    req.onerror   = e => reject(e.target.error);
  });
}

async function dbSet(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('settings', 'readwrite');
    const req = tx.objectStore('settings').put({ key, value });
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}
