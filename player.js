/* =====================================================
   js/player.js - Player screen logic
   ===================================================== */

const Player = (() => {

  /* --- DOM refs --- */
  const video         = document.getElementById('video-el');
  const controls      = document.getElementById('player-controls');
  const btnBack       = document.getElementById('btn-back');
  const btnPlayPause  = document.getElementById('btn-play-pause');
  const iconPlay      = document.getElementById('icon-play');
  const iconPause     = document.getElementById('icon-pause');
  const btnBack3      = document.getElementById('btn-back3');
  const btnFwd3       = document.getElementById('btn-fwd3');
  const btnBack5      = document.getElementById('btn-back5');
  const btnFwd5       = document.getElementById('btn-fwd5');
  const btnMirror     = document.getElementById('btn-mirror');
  const btnSpeedDown  = document.getElementById('btn-speed-down');
  const btnSpeedUp    = document.getElementById('btn-speed-up');
  const speedDisplay  = document.getElementById('speed-display');
  const btnMarkerJump = document.getElementById('btn-marker-jump');
  const btnMarkerAdd  = document.getElementById('btn-marker-add');
  const btnMarkerDel  = document.getElementById('btn-marker-del');
  const btnLoopSet    = document.getElementById('btn-loop-set');
  const btnLoopToggle = document.getElementById('btn-loop-toggle');
  const btnLoopDel    = document.getElementById('btn-loop-del');
  const btnUiHide     = document.getElementById('btn-ui-hide');
  const btnUiShow     = document.getElementById('btn-ui-show');
  const seekTrack     = document.getElementById('seekbar-track');
  const seekProgress  = document.getElementById('seekbar-progress');
  const seekThumb     = document.getElementById('seekbar-thumb');
  const seekMarkers   = document.getElementById('seekbar-markers');
  const seekLoopRange = document.getElementById('seekbar-loop-range');
  const timeCurrent   = document.getElementById('time-current');
  const timeTotal     = document.getElementById('time-total');

  /* --- State --- */
  let currentFileId    = null;
  let objectUrl        = null;
  let speed            = 1.0;
  let mirrored         = false;
  let uiVisible        = true;
  let loopEnabled      = false;
  let loopSetStep      = 0;  /* 0=idle, 1=waiting for end */
  let isSeeking        = false;
  let rafId            = null;

  /* --- Load file --- */
  async function open(fileId) {
    currentFileId = fileId;
    speed = 1.0;
    mirrored = false;
    uiVisible = true;
    loopEnabled = false;
    loopSetStep = 0;

    showLoading('動画を読み込み中...');

    /* Revoke previous object URL to free memory */
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }

    /* Clear video src to release previous file from memory */
    video.pause();
    video.removeAttribute('src');
    video.load();

    updateLoadingProgress(20);

    const blob = await dbGetBlob(fileId);
    if (!blob) { hideLoading(); alert('動画ファイルが見つかりません'); return; }

    updateLoadingProgress(60);
    objectUrl = URL.createObjectURL(blob);
    video.src = objectUrl;
    video.playbackRate = speed;
    speedDisplay.textContent = speed.toFixed(2) + 'x';

    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = reject;
    }).catch(() => {});

    updateLoadingProgress(100);
    hideLoading();

    /* Mirror */
    video.classList.toggle('mirrored', mirrored);
    btnMirror.classList.toggle('active', mirrored);

    /* UI visibility */
    controls.style.display = '';
    btnUiShow.classList.add('hidden');

    /* Restore loop/markers UI */
    renderSeekbar();
    updateLoopButtonUI();

    /* Start RAF loop */
    if (rafId) cancelAnimationFrame(rafId);
    rafTick();
  }

  /* --- RAF loop: update seekbar + loop enforcement --- */
  function rafTick() {
    if (!isSeeking) updateSeekbarUI();
    enforceLoop();
    rafId = requestAnimationFrame(rafTick);
  }

  /* --- Play / Pause --- */
  function togglePlay() {
    if (video.paused) video.play();
    else video.pause();
  }

  video.addEventListener('play',  () => setPlayIcon(false));
  video.addEventListener('pause', () => setPlayIcon(true));

  function setPlayIcon(showPlay) {
    iconPlay.style.display  = showPlay  ? '' : 'none';
    iconPause.style.display = showPlay  ? 'none' : '';
  }

  /* --- Seek bar --- */
  function getSeekPct(clientX) {
    const rect = seekTrack.getBoundingClientRect();
    return clamp((clientX - rect.left) / rect.width, 0, 1);
  }

  function seekTo(pct) {
    if (!isFinite(video.duration)) return;
    video.currentTime = pct * video.duration;
  }

  /* Mouse */
  seekTrack.addEventListener('mousedown', e => {
    isSeeking = true;
    seekTo(getSeekPct(e.clientX));
    const onMove = e2 => seekTo(getSeekPct(e2.clientX));
    const onUp   = () => { isSeeking = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  });

  /* Touch */
  seekTrack.addEventListener('touchstart', e => {
    e.preventDefault();
    isSeeking = true;
    seekTo(getSeekPct(e.touches[0].clientX));
  }, { passive: false });
  seekTrack.addEventListener('touchmove', e => {
    e.preventDefault();
    seekTo(getSeekPct(e.touches[0].clientX));
  }, { passive: false });
  seekTrack.addEventListener('touchend', () => { isSeeking = false; });

  /* --- Update seekbar visuals --- */
  function updateSeekbarUI() {
    if (!isFinite(video.duration) || video.duration === 0) return;
    const pct = video.currentTime / video.duration;
    const p   = (pct * 100).toFixed(3) + '%';
    seekProgress.style.width = p;
    seekThumb.style.left     = p;
    timeCurrent.textContent  = formatTime(video.currentTime);
    timeTotal.textContent    = formatTime(video.duration);
  }

  /* --- Full seekbar render (markers + loop) --- */
  function renderSeekbar() {
    if (!isFinite(video.duration) || video.duration === 0) return;
    const pd = Store.getPlayerData(currentFileId);

    /* Markers */
    seekMarkers.innerHTML = '';
    pd.markers.forEach(sec => {
      const dot = document.createElement('div');
      dot.className = 'seekbar-marker-dot';
      dot.style.left = ((sec / video.duration) * 100).toFixed(3) + '%';
      seekMarkers.appendChild(dot);
    });

    /* Loop range */
    if (pd.loop && pd.loop.start !== null) {
      const startPct = (pd.loop.start / video.duration) * 100;
      seekLoopRange.classList.add('visible');

      /* Remove old endpoint markers */
      seekTrack.querySelectorAll('.seekbar-loop-start,.seekbar-loop-end').forEach(el => el.remove());

      const startMark = document.createElement('div');
      startMark.className = 'seekbar-loop-start';
      startMark.style.left = startPct.toFixed(3) + '%';
      seekTrack.appendChild(startMark);

      if (pd.loop.end !== null) {
        const endPct = (pd.loop.end / video.duration) * 100;
        seekLoopRange.style.left  = startPct.toFixed(3) + '%';
        seekLoopRange.style.width = (endPct - startPct).toFixed(3) + '%';

        const endMark = document.createElement('div');
        endMark.className = 'seekbar-loop-end';
        endMark.style.left = endPct.toFixed(3) + '%';
        seekTrack.appendChild(endMark);
      } else {
        seekLoopRange.style.left  = startPct.toFixed(3) + '%';
        seekLoopRange.style.width = '0%';
      }
    } else {
      seekLoopRange.classList.remove('visible');
      seekTrack.querySelectorAll('.seekbar-loop-start,.seekbar-loop-end').forEach(el => el.remove());
    }
  }

  video.addEventListener('loadedmetadata', () => {
    timeTotal.textContent = formatTime(video.duration);
    renderSeekbar();
  });

  /* --- Skip --- */
  function skip(sec) {
    video.currentTime = clamp(video.currentTime + sec, 0, video.duration || 0);
  }

  /* --- Speed --- */
  function changeSpeed(delta) {
    speed = clamp(Math.round((speed + delta) * 20) / 20, 0.05, 10);
    video.playbackRate = speed;
    speedDisplay.textContent = speed.toFixed(2) + 'x';
  }

  /* --- Mirror --- */
  function toggleMirror() {
    mirrored = !mirrored;
    video.classList.toggle('mirrored', mirrored);
    btnMirror.classList.toggle('active', mirrored);
  }

  /* --- Markers --- */
  async function addMarker() {
    if (!isFinite(video.duration)) return;
    const sec = Math.round(video.currentTime * 100) / 100;
    await Store.addMarker(currentFileId, sec);
    renderSeekbar();
  }

  async function deleteMarker() {
    const deleted = await Store.deleteNearestMarkerBefore(currentFileId, video.currentTime);
    if (deleted !== undefined) renderSeekbar();
  }

  function jumpToMarker() {
    if (!isFinite(video.duration)) return;
    const pd = Store.getPlayerData(currentFileId);
    const before = pd.markers.filter(m => m <= video.currentTime - 0.1);
    if (before.length === 0) { video.currentTime = 0; return; }
    video.currentTime = before[before.length - 1];
  }

  /* --- Loop --- */
  async function handleLoopSet() {
    if (!isFinite(video.duration)) return;
    if (loopSetStep === 0) {
      /* Set start */
      await Store.setLoopStart(currentFileId, video.currentTime);
      loopSetStep = 1;
      btnLoopSet.classList.add('active');
      renderSeekbar();
    } else {
      /* Set end */
      const pd = Store.getPlayerData(currentFileId);
      if (video.currentTime > pd.loop.start) {
        await Store.setLoopEnd(currentFileId, video.currentTime);
        loopSetStep = 0;
        btnLoopSet.classList.remove('active');
        renderSeekbar();
      }
    }
  }

  function toggleLoop() {
    const pd = Store.getPlayerData(currentFileId);
    if (!pd.loop || pd.loop.start === null || pd.loop.end === null) return;
    loopEnabled = !loopEnabled;
    updateLoopButtonUI();
  }

  async function deleteLoop() {
    const pd = Store.getPlayerData(currentFileId);
    if (!pd.loop || pd.loop.start === null) return;
    await Store.deleteLoop(currentFileId);
    loopEnabled  = false;
    loopSetStep  = 0;
    btnLoopSet.classList.remove('active');
    renderSeekbar();
    updateLoopButtonUI();
  }

  function enforceLoop() {
    if (!loopEnabled) return;
    const pd = Store.getPlayerData(currentFileId);
    if (!pd || !pd.loop || pd.loop.start === null || pd.loop.end === null) return;
    if (video.currentTime >= pd.loop.end) {
      video.currentTime = pd.loop.start;
    }
  }

  function updateLoopButtonUI() {
    btnLoopToggle.classList.toggle('active', loopEnabled);
  }

  /* --- UI hide/show --- */
  function hideUi() {
    uiVisible = false;
    controls.style.display = 'none';
    btnUiShow.classList.remove('hidden');
  }

  function showUi() {
    uiVisible = true;
    controls.style.display = '';
    btnUiShow.classList.add('hidden');
  }

  /* --- Close player --- */
  function close() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    currentFileId = null;

    /* Reset UI */
    showUi();
    btnMirror.classList.remove('active');
    btnLoopSet.classList.remove('active');
    btnLoopToggle.classList.remove('active');
    setPlayIcon(true);
    speedDisplay.textContent = '1.00x';
    seekProgress.style.width = '0%';
    seekThumb.style.left     = '0%';
    seekMarkers.innerHTML    = '';
    seekLoopRange.classList.remove('visible');
    seekTrack.querySelectorAll('.seekbar-loop-start,.seekbar-loop-end').forEach(el => el.remove());
    timeCurrent.textContent  = '0:00';
    timeTotal.textContent    = '0:00';
  }

  /* --- Prevent scroll/zoom on player wrap --- */
  const playerWrap = document.getElementById('player-wrap');
  playerWrap.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

  /* --- Button event bindings --- */
  function init() {
    initNoLongPress();

    btnBack.addEventListener('click', () => {
      close();
      if (window.App) App.showFileList();
    });
    btnPlayPause.addEventListener('click', togglePlay);
    btnBack3.addEventListener('click', () => skip(-3));
    btnFwd3.addEventListener('click',  () => skip(3));
    btnBack5.addEventListener('click', () => skip(-5));
    btnFwd5.addEventListener('click',  () => skip(5));
    btnMirror.addEventListener('click', toggleMirror);
    btnSpeedDown.addEventListener('click', () => changeSpeed(-0.05));
    btnSpeedUp.addEventListener('click',   () => changeSpeed(0.05));
    btnMarkerAdd.addEventListener('click',  addMarker);
    btnMarkerDel.addEventListener('click',  deleteMarker);
    btnMarkerJump.addEventListener('click', jumpToMarker);
    btnLoopSet.addEventListener('click',    handleLoopSet);
    btnLoopToggle.addEventListener('click', toggleLoop);
    btnLoopDel.addEventListener('click',    deleteLoop);
    btnUiHide.addEventListener('click', hideUi);
    btnUiShow.addEventListener('click', showUi);
  }

  return { init, open };
})();
