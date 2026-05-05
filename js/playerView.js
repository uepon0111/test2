import { applyIcons, icon } from './icons.js';

function clamp(value, min, max){
  return Math.min(max, Math.max(min, value));
}

function formatTime(seconds){
  if (!Number.isFinite(seconds)) return '0:00';
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function createPlayerController(app){
  const video = document.getElementById('video-player');
  const overlay = document.getElementById('player-overlay');
  const loading = document.getElementById('player-loading');
  const loadingText = document.getElementById('loading-text');
  const loadingFill = document.getElementById('loading-bar-fill');
  const btnBackList = document.getElementById('btn-back-list');
  const btnPlayToggle = document.getElementById('btn-play-toggle');
  const btnBack3 = document.getElementById('btn-back-3');
  const btnForward3 = document.getElementById('btn-forward-3');
  const btnBack5 = document.getElementById('btn-back-5');
  const btnForward5 = document.getElementById('btn-forward-5');
  const btnMirror = document.getElementById('btn-mirror');
  const btnSpeedDown = document.getElementById('btn-speed-down');
  const btnSpeedDisplay = document.getElementById('btn-speed-display');
  const btnSpeedUp = document.getElementById('btn-speed-up');
  const btnMarkerJump = document.getElementById('btn-marker-jump');
  const btnMarkerAdd = document.getElementById('btn-marker-add');
  const btnMarkerDelete = document.getElementById('btn-marker-delete');
  const btnLoopSet = document.getElementById('btn-loop-set');
  const btnLoopToggle = document.getElementById('btn-loop-toggle');
  const btnLoopClear = document.getElementById('btn-loop-clear');
  const btnUiHide = document.getElementById('btn-ui-hide');
  const btnUiShow = document.getElementById('btn-ui-show');
  const progressTrack = document.getElementById('progress-track');
  const progressPlayed = document.getElementById('progress-played');
  const progressMarkers = document.getElementById('progress-markers');
  const progressLoop = document.getElementById('progress-loop');
  const progressHandle = document.getElementById('progress-handle');

  let objectUrl = '';
  let videoRecord = null;
  let loopMode = 'idle'; // idle | start
  let rafId = 0;

  function setLoading(active, text = '読み込み中…', percent = 0){
    loading.classList.toggle('hidden', !active);
    loadingText.textContent = text;
    loadingFill.style.width = `${clamp(percent, 0, 100)}%`;
  }

  function updateIcons(){
    applyIcons(overlay);
  }

  function updatePlayButton(){
    const name = video.paused ? 'play' : 'pause';
    const holder = btnPlayToggle.querySelector('[data-icon]');
    holder.setAttribute('data-icon', name);
    holder.innerHTML = icon(name);
  }

  function updateMirror(){
    video.style.transform = videoRecord?.mirror ? 'scaleX(-1)' : 'scaleX(1)';
  }

  function updateSpeedLabel(){
    btnSpeedDisplay.textContent = `${video.playbackRate.toFixed(2)}×`;
  }

  function updateLoopVisual(){
    const loop = videoRecord?.loop;
    const hasRange = !!loop && loop.end != null;
    if (!hasRange) {
      progressLoop.style.left = '0%';
      progressLoop.style.width = '0%';
      btnLoopToggle.disabled = true;
      btnLoopClear.disabled = true;
      return;
    }
    const duration = video.duration || 0;
    const start = clamp(loop.start / Math.max(duration, 0.001), 0, 1);
    const end = clamp(loop.end / Math.max(duration, 0.001), 0, 1);
    progressLoop.style.left = `${start * 100}%`;
    progressLoop.style.width = `${Math.max(0, (end - start) * 100)}%`;
    btnLoopToggle.disabled = false;
    btnLoopClear.disabled = false;
    btnLoopToggle.style.opacity = loop.enabled ? '1' : '0.82';
  }

  function updateMarkers(){
    const duration = video.duration || 0;
    progressMarkers.innerHTML = (videoRecord?.markers || []).map((time, index) => {
      const pos = clamp(time / Math.max(duration, 0.001), 0, 1) * 100;
      return `<div class="progress-marker" style="left:${pos}%;" data-marker-index="${index}" title="${formatTime(time)}"></div>`;
    }).join('');
  }

  function updateProgress(){
    const duration = video.duration || 0;
    const current = video.currentTime || 0;
    const ratio = duration ? clamp(current / duration, 0, 1) : 0;
    progressPlayed.style.width = `${ratio * 100}%`;
    progressHandle.style.left = `${ratio * 100}%`;
    updateLoopVisual();
    btnMarkerJump.disabled = !(videoRecord?.markers || []).length;
    btnMarkerDelete.disabled = !(videoRecord?.markers || []).length;
    btnLoopToggle.disabled = !(videoRecord?.loop && videoRecord.loop.end != null);
    btnLoopClear.disabled = !(videoRecord?.loop && videoRecord.loop.end != null);
    btnSpeedDisplay.textContent = `${video.playbackRate.toFixed(2)}×`;
  }

  function commitState(){
    if (!videoRecord) return;
    videoRecord = {
      ...videoRecord,
      lastTime: video.currentTime || 0,
      playbackRate: video.playbackRate,
      mirror: !!videoRecord.mirror,
    };
    app.saveVideo(videoRecord);
  }

  async function open(record){
    videoRecord = { ...record, markers: [...(record.markers || [])].sort((a, b) => a - b) };
    loopMode = 'idle';
    setLoading(true, '動画を読み込んでいます…', 0);

    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = '';
    }

    objectUrl = URL.createObjectURL(videoRecord.blob);
    video.src = objectUrl;
    video.currentTime = Math.max(0, videoRecord.lastTime || 0);
    video.playbackRate = videoRecord.playbackRate || 1;
    updateSpeedLabel();
    updateMirror();
    updateMarkers();
    updateLoopVisual();
    updatePlayButton();
    updateProgress();

    await new Promise((resolve) => {
      const onLoaded = () => {
        video.removeEventListener('loadedmetadata', onLoaded);
        resolve();
      };
      video.addEventListener('loadedmetadata', onLoaded, { once: true });
      const timeout = setTimeout(resolve, 600);
      video.addEventListener('loadedmetadata', () => clearTimeout(timeout), { once: true });
    });

    setLoading(false);
    await video.play().catch(() => {});
    updatePlayButton();
    app.showPlayerView();
    startTicker();
  }

  function close(){
    stopTicker();
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = '';
    }
    video.removeAttribute('src');
    video.load();
    setLoading(false);
    videoRecord = null;
    loopMode = 'idle';
  }

  function startTicker(){
    stopTicker();
    const tick = () => {
      updateProgress();
      if (videoRecord?.loop?.enabled && videoRecord.loop.end != null && video.currentTime >= videoRecord.loop.end) {
        video.currentTime = videoRecord.loop.start;
        if (!video.paused) {
          video.play().catch(() => {});
        }
      }
      if (videoRecord) {
        videoRecord.lastTime = video.currentTime || 0;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  function stopTicker(){
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function seekBy(delta){
    video.currentTime = clamp((video.currentTime || 0) + delta, 0, video.duration || Number.MAX_SAFE_INTEGER);
  }

  function jumpToClosestMarker(deleteMode = false){
    if (!videoRecord?.markers?.length) {
      video.currentTime = 0;
      return;
    }
    const current = video.currentTime || 0;
    const markers = [...videoRecord.markers].sort((a, b) => a - b);
    let targetIndex = -1;
    for (let i = 0; i < markers.length; i += 1) {
      if (markers[i] < current) targetIndex = i;
      else break;
    }
    if (targetIndex < 0) {
      video.currentTime = 0;
      return;
    }
    const target = markers[targetIndex];
    if (deleteMode) {
      videoRecord.markers.splice(videoRecord.markers.indexOf(target), 1);
      app.saveVideo(videoRecord);
      updateMarkers();
      updateProgress();
      return;
    }
    video.currentTime = target;
  }

  function addMarker(){
    const time = Math.max(0, video.currentTime || 0);
    videoRecord.markers = [...(videoRecord.markers || []), time].sort((a, b) => a - b);
    app.saveVideo(videoRecord);
    updateMarkers();
    updateProgress();
  }

  function deleteMarker(){
    if (!videoRecord?.markers?.length) return;
    const current = video.currentTime || 0;
    const markers = [...videoRecord.markers].sort((a, b) => a - b);
    let targetIndex = -1;
    for (let i = 0; i < markers.length; i += 1) {
      if (markers[i] < current) targetIndex = i;
      else break;
    }
    if (targetIndex < 0) return;
    const target = markers[targetIndex];
    videoRecord.markers.splice(videoRecord.markers.indexOf(target), 1);
    app.saveVideo(videoRecord);
    updateMarkers();
    updateProgress();
  }

  function setLoopPoint(){
    const current = Math.max(0, video.currentTime || 0);
    if (!videoRecord.loop || loopMode === 'idle') {
      videoRecord.loop = { start: current, end: null, enabled: false };
      loopMode = 'start';
      app.saveVideo(videoRecord);
      updateLoopVisual();
      return;
    }
    if (loopMode === 'start') {
      const start = videoRecord.loop.start;
      let end = current;
      if (end <= start) end = Math.min((video.duration || end + 0.1), start + 0.1);
      videoRecord.loop = {
        start: Math.min(start, end),
        end: Math.max(start, end),
        enabled: videoRecord.loop.enabled,
      };
      loopMode = 'idle';
      app.saveVideo(videoRecord);
      updateLoopVisual();
      return;
    }
    videoRecord.loop = { start: current, end: null, enabled: false };
    loopMode = 'start';
    app.saveVideo(videoRecord);
    updateLoopVisual();
  }

  function toggleLoop(){
    if (!videoRecord?.loop || videoRecord.loop.end == null) return;
    videoRecord.loop.enabled = !videoRecord.loop.enabled;
    app.saveVideo(videoRecord);
    updateLoopVisual();
  }

  function clearLoop(){
    if (!videoRecord?.loop) return;
    videoRecord.loop = null;
    loopMode = 'idle';
    app.saveVideo(videoRecord);
    updateLoopVisual();
  }

  function applyProgressSeek(clientX){
    const rect = progressTrack.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    const duration = video.duration || 0;
    if (duration > 0) video.currentTime = duration * ratio;
  }

  function bind(){
    btnBackList.onclick = () => app.goList();
    btnPlayToggle.onclick = async () => {
      if (video.paused) {
        await video.play().catch(() => {});
      } else {
        video.pause();
      }
      updatePlayButton();
    };
    btnBack3.onclick = () => seekBy(-3);
    btnForward3.onclick = () => seekBy(3);
    btnBack5.onclick = () => seekBy(-5);
    btnForward5.onclick = () => seekBy(5);
    btnMirror.onclick = () => {
      if (!videoRecord) return;
      videoRecord.mirror = !videoRecord.mirror;
      updateMirror();
      app.saveVideo(videoRecord);
    };
    btnSpeedDown.onclick = () => {
      video.playbackRate = Math.max(0.05, Math.round((video.playbackRate - 0.05) * 100) / 100);
      updateSpeedLabel();
      commitState();
    };
    btnSpeedUp.onclick = () => {
      video.playbackRate = Math.min(8, Math.round((video.playbackRate + 0.05) * 100) / 100);
      updateSpeedLabel();
      commitState();
    };
    btnMarkerJump.onclick = () => jumpToClosestMarker(false);
    btnMarkerAdd.onclick = () => addMarker();
    btnMarkerDelete.onclick = () => deleteMarker();
    btnLoopSet.onclick = () => setLoopPoint();
    btnLoopToggle.onclick = () => toggleLoop();
    btnLoopClear.onclick = () => clearLoop();
    btnUiHide.onclick = () => {
      overlay.classList.add('hidden-ui');
      btnUiHide.classList.add('hidden');
      btnUiShow.classList.remove('hidden');
    };
    btnUiShow.onclick = () => {
      overlay.classList.remove('hidden-ui');
      btnUiHide.classList.remove('hidden');
      btnUiShow.classList.add('hidden');
    };

    video.addEventListener('play', updatePlayButton);
    video.addEventListener('pause', updatePlayButton);
    video.addEventListener('ratechange', () => {
      updateSpeedLabel();
      commitState();
    });
    video.addEventListener('timeupdate', () => {
      updateProgress();
      if (videoRecord) videoRecord.lastTime = video.currentTime || 0;
    });
    video.addEventListener('ended', () => {
      if (videoRecord?.loop?.enabled && videoRecord.loop.start != null && videoRecord.loop.end != null) {
        video.currentTime = videoRecord.loop.start;
        video.play().catch(() => {});
      }
    });
    video.addEventListener('loadedmetadata', () => {
      updateMarkers();
      updateLoopVisual();
      updateProgress();
    });

    progressTrack.addEventListener('click', (event) => {
      applyProgressSeek(event.clientX);
    });
    progressTrack.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'mouse') {
        progressTrack.setPointerCapture(event.pointerId);
        applyProgressSeek(event.clientX);
      }
    });

    updateIcons();
  }

  function setVideoData(record){
    videoRecord = record;
    updateMirror();
    updateMarkers();
    updateLoopVisual();
    updateSpeedLabel();
    updatePlayButton();
    updateProgress();
  }

  bind();

  return {
    open,
    close,
    setVideoData,
    sync(){
      updateMarkers();
      updateLoopVisual();
      updateProgress();
      updateSpeedLabel();
      updatePlayButton();
      updateMirror();
    },
    getCurrentRecord(){
      return videoRecord;
    },
    pause(){
      video.pause();
    },
    hideUi(){
      overlay.classList.add('hidden-ui');
      btnUiHide.classList.add('hidden');
      btnUiShow.classList.remove('hidden');
    },
    showUi(){
      overlay.classList.remove('hidden-ui');
      btnUiHide.classList.remove('hidden');
      btnUiShow.classList.add('hidden');
    }
  };
}
