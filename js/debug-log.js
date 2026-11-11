/*
 * debug-log.js
 * -----------------------------------------------------------------------
 * 自動検出のスキャン画像・境界座標・領域A～I・各領域の切り出し前後/OCRを表示します。
 * -----------------------------------------------------------------------
 */

const DEBUG_LOG_FIELD_ORDER = [
  { key: 'title', label: '楽曲タイトル (領域A)' },
  { key: 'difficulty', label: '楽曲難易度 (領域B)' },
  { key: 'level', label: '楽曲レベル (領域C)' },
  { key: 'perfect', label: 'PERFECT (領域D)' },
  { key: 'great', label: 'GREAT (領域E)' },
  { key: 'good', label: 'GOOD (領域F)' },
  { key: 'bad', label: 'BAD (領域G)' },
  { key: 'miss', label: 'MISS (領域H)' },
  { key: 'combo', label: 'コンボ数 (領域I)' },
];

function openDebugLogModal(itemId) {
  const item = editorQueue.find(q => q.id === itemId);
  if (!item) return;
  renderDebugLogContent(item);
  document.getElementById('debugLogModal').style.display = 'flex';
}

function closeDebugLogModal() {
  document.getElementById('debugLogModal').style.display = 'none';
}

function confidenceBadgeHtml(level) {
  const map = {
    high: { text: '信頼度: 高', cls: 'conf-high' },
    medium: { text: '信頼度: 中', cls: 'conf-medium' },
    low: { text: '信頼度: 低', cls: 'conf-low' },
  };
  const m = map[level] || map.low;
  return `<span class="confidence-badge ${m.cls}">${m.text}</span>`;
}

const WARNING_ICON_BY_LEVEL = { error: 'error', warn: 'warning', info: 'info' };

function warningListHtml(warnings) {
  if (!warnings || warnings.length === 0) {
    return `<div class="log-warning-item log-level-ok"><span class="material-symbols-outlined">check_circle</span><span>目立った矛盾は検出されませんでした。</span></div>`;
  }
  return warnings.map(w => `
    <div class="log-warning-item log-level-${escapeHtml(w.level)}">
      <span class="material-symbols-outlined">${WARNING_ICON_BY_LEVEL[w.level] || 'info'}</span>
      <span>${escapeHtml(w.message)}</span>
    </div>
  `).join('');
}

function reasoningListHtml(reasoning) {
  if (!reasoning || reasoning.length === 0) return '<p class="log-empty">判断ステップの記録はありません(直接一致など単純なケース)。</p>';
  return `<ol class="reasoning-list">${reasoning.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ol>`;
}

function formatPx(value) {
  return Number.isFinite(value) ? `${Math.round(value)}px` : '-';
}

function layoutBoundsHtml(bounds) {
  if (!bounds) return '<p class="log-empty">境界座標がありません。</p>';
  const rows = [
    ['白枠', bounds.frameLeft, bounds.frameTop, bounds.frameRight, bounds.frameBottom],
    ['ジャケット', bounds.jacketLeft, bounds.jacketTop, bounds.jacketRight, bounds.jacketBottom],
    ['ゲージ左端', bounds.gaugeLeft, null, null, null],
    ['難易度', bounds.difficultyLeft, bounds.jacketCenter, bounds.difficultyRight, bounds.jacketBottom],
    ['楽曲レベル', bounds.levelLeft, bounds.jacketCenter, bounds.levelRight, bounds.jacketBottom],
    ['PERFECT', null, bounds.perfectTop, null, bounds.perfectBottom],
    ['GOOD', null, bounds.goodTop, null, bounds.goodBottom],
    ['MISS', null, bounds.missTop, null, bounds.missBottom],
    ['GOODカード', bounds.goodLeft, bounds.goodTop, bounds.goodRight, bounds.missBottom],
    ['LATE/FAST左端', bounds.lateFastLeft, null, null, null],
  ];
  return `
    <div class="log-coordinate-table-wrap"><table class="log-coordinate-table">
      <thead><tr><th>検出対象</th><th>左 / 上</th><th>右 / 下</th><th>幅 / 高さ</th></tr></thead>
      <tbody>${rows.map(([label, left, top, right, bottom]) => {
        const width = left != null && right != null ? right - left : null;
        const height = top != null && bottom != null ? bottom - top : null;
        return `<tr><th>${escapeHtml(label)}</th><td>${left != null ? formatPx(left) : '-'} / ${top != null ? formatPx(top) : '-'}</td><td>${right != null ? formatPx(right) : '-'} / ${bottom != null ? formatPx(bottom) : '-'}</td><td>${width != null ? formatPx(width) : '-'} / ${height != null ? formatPx(height) : '-'}</td></tr>`;
      }).join('')}</tbody>
    </table></div>`;
}

function layoutCardHtml(layoutLog) {
  if (!layoutLog || !layoutLog.annotatedDataUrl) {
    return '<p class="log-empty">自動検出画像がありません。</p>';
  }
  return `
    <div class="log-layout-card">
      <div class="log-layout-image-wrap">
        <img src="${layoutLog.annotatedDataUrl}" class="log-layout-image" alt="スキャン線・境界線・領域AからIを重ねた画像">
      </div>
      <div class="log-layout-legend">
        <span><i class="legend-line legend-red"></i>白枠下端</span>
        <span><i class="legend-line legend-blue"></i>白枠左右端</span>
        <span><i class="legend-line legend-green"></i>ジャケット左右端・ゲージ左端</span>
        <span><i class="legend-line legend-yellow"></i>ジャケット上下端・中央</span>
        <span><i class="legend-line legend-purple"></i>難易度/レベル境界</span>
        <span><i class="legend-line legend-pink"></i>判定行境界</span>
        <span><i class="legend-line legend-cyan"></i>判定カード左右端</span>
      </div>
      <div class="log-layout-meta">画像サイズ: ${layoutLog.imageWidth} × ${layoutLog.imageHeight}px</div>
      ${layoutBoundsHtml(layoutLog.bounds)}
    </div>`;
}

function fieldCardHtml(label, log, confidenceLevel) {
  if (!log) return `<div class="log-field-card"><div class="log-field-header"><span class="log-field-label">${escapeHtml(label)}</span></div><p class="log-empty">データがありません</p></div>`;
  const rect = log.srcRect || {};
  const ratio = log.regionRatio || {};
  const fmt = (n) => (typeof n === 'number' ? n.toFixed(3) : '-');
  const effectiveConfidence = confidenceLevel || (typeof log.confidence === 'number' ? (log.confidence >= 80 ? 'high' : log.confidence >= 55 ? 'medium' : 'low') : 'low');
  return `
    <div class="log-field-card">
      <div class="log-field-header">
        <span class="log-field-label">${escapeHtml(label)}</span>
        ${confidenceBadgeHtml(effectiveConfidence)}
      </div>
      <div class="log-field-body">
        <div class="log-image-pair">
          <div class="log-image-cell">
            <div class="log-image-caption">処理前 (カラー切り出し)</div>
            ${log.originalDataUrl ? `<img src="${log.originalDataUrl}" class="log-field-image" alt="${escapeHtml(label)} 処理前カラー画像">` : '<p class="log-empty">画像なし</p>'}
          </div>
          <div class="log-image-cell">
            <div class="log-image-caption">処理後 (二値化・拡大)</div>
            <img src="${log.dataUrl || ''}" class="log-field-image" alt="${escapeHtml(label)} 処理後画像">
          </div>
        </div>
        <div class="log-field-meta">
          <div><span class="log-meta-key">切り出し座標(px)</span>x:${rect.x}, y:${rect.y}, w:${rect.w}, h:${rect.h}</div>
          <div><span class="log-meta-key">切り出し座標(比率)</span>x:${fmt(ratio.x)}, y:${fmt(ratio.y)}, w:${fmt(ratio.w)}, h:${fmt(ratio.h)}</div>
          <div><span class="log-meta-key">二値化しきい値</span>${log.threshold} (${log.channelType === 'whiteness' ? '白さ基準' : '明度基準'})</div>
          <div><span class="log-meta-key">OCR結果</span><code>${escapeHtml(log.ocrText) || '(空)'}</code></div>
          <div><span class="log-meta-key">OCR信頼度</span>${log.confidence}%</div>
          ${log.found != null ? `<div><span class="log-meta-key">数字の検出</span>${log.found ? '成功' : '未検出'}</div>` : ''}
          ${log.ocrError ? `<div class="log-meta-error">⚠ ${escapeHtml(log.ocrError)}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

function renderDebugLogContent(item) {
  const container = document.getElementById('debug-log-content');
  document.getElementById('debug-log-subtitle').innerText = item.data.title ? `「${item.data.title}」の実測ログ` : '実測ログ';

  if (!item.debugLog) {
    container.innerHTML = '<p class="log-empty">この画像はまだ解析されていません。先に「この画像を再解析」を実行してください。</p>';
    return;
  }

  const conf = item.confidence || {};
  const dl = item.debugLog;
  container.innerHTML = `
    <div class="log-section">
      <h4><span class="material-symbols-outlined" style="font-size:1.1rem;">fact_check</span> 総合判断の結果</h4>
      ${warningListHtml(item.warnings)}
    </div>
    <div class="log-section">
      <h4><span class="material-symbols-outlined" style="font-size:1.1rem;">route</span> 判断の過程</h4>
      ${reasoningListHtml(item.reasoning)}
    </div>
    <div class="log-section">
      <h4><span class="material-symbols-outlined" style="font-size:1.1rem;">center_focus_strong</span> 自動検出結果 (スキャン線・境界線・領域A～I)</h4>
      ${layoutCardHtml(dl.layout)}
    </div>
    <div class="log-section">
      <h4><span class="material-symbols-outlined" style="font-size:1.1rem;">image_search</span> 領域ごとのOCR実測ログ</h4>
      <div class="log-field-grid">
        ${DEBUG_LOG_FIELD_ORDER.map(f => fieldCardHtml(f.label, dl[f.key], f.key === 'perfect' || f.key === 'great' || f.key === 'good' || f.key === 'bad' || f.key === 'miss' ? null : conf[f.key])).join('')}
      </div>
    </div>
  `;
}
