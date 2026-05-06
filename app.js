/* =====================================================
   js/app.js - Main application entry point
   ===================================================== */

const App = (() => {

  const screenFileList = document.getElementById('screen-filelist');
  const screenPlayer   = document.getElementById('screen-player');

  /* --- Screen switching --- */
  function showFileList() {
    screenPlayer.classList.remove('active');
    screenFileList.classList.add('active');
    FileList.render();
  }

  async function openPlayer(fileId) {
    screenFileList.classList.remove('active');
    screenPlayer.classList.add('active');
    await Player.open(fileId);
  }

  /* --- Boot --- */
  async function boot() {
    showLoading('初期化中...');
    updateLoadingProgress(10);
    await Store.load();
    updateLoadingProgress(80);
    FileList.init();
    TagEditor.init();
    Player.init();
    updateLoadingProgress(100);
    hideLoading();
    showFileList();
  }

  /* Prevent all default touch scroll on body */
  document.body.addEventListener('touchmove', e => {
    /* Allow scroll inside file grid and modal body only */
    const allowed = e.target.closest('.fl-file-grid, .modal-body, .fl-tag-filter-bar');
    if (!allowed) e.preventDefault();
  }, { passive: false });

  /* Prevent pinch-zoom globally */
  document.addEventListener('gesturestart',  e => e.preventDefault());
  document.addEventListener('gesturechange', e => e.preventDefault());
  document.addEventListener('gestureend',    e => e.preventDefault());

  return { boot, showFileList, openPlayer };
})();

/* Start */
document.addEventListener('DOMContentLoaded', () => App.boot());
