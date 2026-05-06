/* =====================================================
   js/utils.js - Utility helpers
   ===================================================== */

/** Format seconds → "m:ss" or "h:mm:ss" */
function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  return `${m}:${String(s).padStart(2,'0')}`;
}

/** Generate a simple unique id */
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Clamp a number between min and max */
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

/** Show the loading overlay */
function showLoading(msg = '読み込み中...') {
  const el = document.getElementById('loading-overlay');
  document.getElementById('loading-message').textContent = msg;
  document.getElementById('loading-bar').style.width = '0%';
  document.getElementById('loading-percent').textContent = '0%';
  el.classList.remove('hidden');
}

/** Update loading progress (0-100) */
function updateLoadingProgress(pct) {
  const p = clamp(Math.round(pct), 0, 100);
  document.getElementById('loading-bar').style.width = p + '%';
  document.getElementById('loading-percent').textContent = p + '%';
}

/** Hide the loading overlay */
function hideLoading() {
  document.getElementById('loading-overlay').classList.add('hidden');
}

/** Disable long-press context menu on a button */
function noLongPress(el) {
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('touchstart', e => { /* prevent text-select */ }, { passive: true });
}

/** Apply noLongPress to all .ctrl-btn elements */
function initNoLongPress() {
  document.querySelectorAll('.ctrl-btn').forEach(noLongPress);
}

/** Get file size human-readable */
function humanSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
