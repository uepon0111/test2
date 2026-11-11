/*
 * ocr-analyzer.js
 * -----------------------------------------------------------------------
 * Project Sekai のリザルト画像をフルカラーで解析し、色変化に基づいて
 * ヘッダー白枠・ジャケット・ゲージ・難易度/レベル・判定カードの位置を
 * 自動検出します。旧機種プロファイルの固定矩形は読み取りに使用しません。
 *
 * ノイズ対策:
 *  - RGB完全一致ではなくユークリッド色距離で近似色を検出
 *  - 複数スキャンの一致率、中央値、短い欠損区間の結合を利用
 *  - 判定カードは色距離の許容値を小さい値から段階的に調整し、
 *    3行の幾何学的一貫性を満たす組み合わせのみを採用
 *  - ジャケット/バッジ境界は単一ラインで確定せず、複数ラインの中央値を採用
 *
 * 検出したスキャン線・境界線・領域A～Iはデバッグ画像に重ねて表示し、
 * 各OCR領域の切り出し前(カラー)と処理後(二値化・拡大)も実測ログに保存します。
 * -----------------------------------------------------------------------
 */

const PSM = (typeof Tesseract !== 'undefined' && Tesseract.PSM) ? Tesseract.PSM : {
  SINGLE_BLOCK: '6', SINGLE_LINE: '7', SINGLE_WORD: '8', SPARSE_TEXT: '11',
};

const COLOR_TARGETS = {
  frame: [171, 172, 189],       // #ABACBD (JPEG/PNG誤差を想定)
  screen: [50, 53, 88],         // #323558
  resultPill: [63, 63, 98],     // #3F3F62
  gaugeMint: [153, 252, 207],   // #99FCCF
  gaugePink: [236, 98, 121],    // #EC6279
};
const COLOR_TOLERANCE = {
  frame: 42,
  badgeNonWhite: 35,
  judgementBase: 9,
};
const BREAKDOWN_KEYS = ['perfect', 'great', 'good', 'bad', 'miss'];
const UPSCALE_BY_FIELD = {
  difficulty: 3.4, level: 3.4, title: 2.6,
  perfect: 3.2, great: 3.2, good: 3.2, bad: 3.2, miss: 3.2, combo: 3.4,
};
const BINARIZE_CHANNEL_BY_FIELD = {
  difficulty: 'whiteness', level: 'whiteness', title: 'luminance',
  perfect: 'luminance', great: 'luminance', good: 'luminance', bad: 'luminance', miss: 'luminance', combo: 'luminance',
};

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rgbDistance(r, g, b, target) {
  const dr = r - target[0], dg = g - target[1], db = b - target[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function median(values) {
  if (!values || !values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function getPixel(data, width, x, y) {
  const idx = (y * width + x) * 4;
  return [data[idx], data[idx + 1], data[idx + 2]];
}

// Booleanマスクの連続区間を返す。maxGap以内の短い穴はスキャンノイズとして結合。
function findRuns(mask, minLength = 1, maxGap = 0) {
  const runs = [];
  let start = -1;
  let lastTrue = -1;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) {
      if (start < 0) start = i;
      lastTrue = i;
    } else if (start >= 0 && i - lastTrue > maxGap) {
      const end = lastTrue + 1; // 終端はexclusive
      if (end - start >= minLength) runs.push({ start, end, length: end - start });
      start = -1;
      lastTrue = -1;
    }
  }
  if (start >= 0) {
    const end = lastTrue + 1;
    if (end - start >= minLength) runs.push({ start, end, length: end - start });
  }
  return runs;
}

function mergeRunGroups(runs, maxGap) {
  if (!runs || !runs.length) return [];
  const sorted = runs.slice().sort((a, b) => a.start - b.start);
  const merged = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const previous = merged[merged.length - 1];
    if (current.start - previous.end <= maxGap) {
      previous.end = Math.max(previous.end, current.end);
      previous.length = previous.end - previous.start;
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

function boxSmooth(values, radius) {
  const result = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    const left = Math.max(0, i - radius);
    const right = Math.min(values.length - 1, i + radius);
    for (let j = left; j <= right; j++) sum += values[j];
    result[i] = sum / (right - left + 1);
  }
  return result;
}

function medianRgbAtY(data, width, height, x, yList) {
  const rs = [], gs = [], bs = [];
  for (const y0 of yList) {
    const y = clampNumber(Math.round(y0), 0, height - 1);
    const [r, g, b] = getPixel(data, width, x, y);
    rs.push(r); gs.push(g); bs.push(b);
  }
  return [median(rs), median(gs), median(bs)];
}

function medianRgbAtX(data, width, height, y, xList) {
  const rs = [], gs = [], bs = [];
  for (const x0 of xList) {
    const x = clampNumber(Math.round(x0), 0, width - 1);
    const [r, g, b] = getPixel(data, width, x, y);
    rs.push(r); gs.push(g); bs.push(b);
  }
  return [median(rs), median(gs), median(bs)];
}

function detectFrameBounds(data, width, height) {
  // Step 1: 画面上端中央の7本を縦走査。上端から続く白枠色の終端を中央値で決定。
  const scanX = [0.442, 0.455, 0.468, 0.481, 0.494, 0.507, 0.520]
    .map(fraction => clampNumber(Math.round(width * fraction), 0, width - 1));
  const topSamples = [], bottomSamples = [];
  for (const x of scanX) {
    const mask = new Array(height).fill(false);
    for (let y = 0; y < height; y++) {
      const [r, g, b] = getPixel(data, width, x, y);
      mask[y] = rgbDistance(r, g, b, COLOR_TARGETS.frame) <= COLOR_TOLERANCE.frame;
    }
    const candidates = findRuns(mask, Math.max(20, Math.round(height * 0.045)), 3)
      .filter(run => run.start <= height * 0.04 && run.end <= height * 0.32);
    if (candidates.length) {
      // 上端から始まる最長の白領域を採用。文字等の短いノイズ帯を除外する。
      const best = candidates.sort((a, b) => b.length - a.length)[0];
      topSamples.push(best.start);
      bottomSamples.push(best.end);
    }
  }
  if (bottomSamples.length < 4) throw new Error('画面上部の白枠下端を検出できませんでした。');
  const frameTop = Math.round(median(topSamples));
  const frameBottom = Math.round(median(bottomSamples));
  const frameHeight = frameBottom - frameTop;
  if (frameHeight < height * 0.055 || frameHeight > height * 0.22) {
    throw new Error(`白枠の縦幅が想定範囲外です (${frameHeight}px)。`);
  }

  // Step 2: 白枠縦幅の4等分位置で5本横走査。端部の孤立した装飾/カメラを避ける。
  const scanY = [0.16, 0.33, 0.50, 0.67, 0.84]
    .map(fraction => clampNumber(Math.round(frameTop + frameHeight * fraction), 0, height - 1));
  const leftSamples = [], rightSamples = [];
  for (const y of scanY) {
    const mask = new Array(width).fill(false);
    for (let x = 0; x < width; x++) {
      const [r, g, b] = getPixel(data, width, x, y);
      mask[x] = rgbDistance(r, g, b, COLOR_TARGETS.frame) <= COLOR_TOLERANCE.frame;
    }
    const runs = findRuns(mask, Math.max(6, Math.round(width * 0.003)), 3);
    const leftCandidates = runs.filter(run => run.start >= width * 0.04
      && run.start <= width * 0.31 && run.end > width * 0.08);
    const rightCandidates = runs.filter(run => run.start >= width * 0.55
      && run.end <= width * 0.96 && run.end > width * 0.70);
    if (leftCandidates.length) leftSamples.push(leftCandidates[0].start);
    if (rightCandidates.length) rightSamples.push(rightCandidates[rightCandidates.length - 1].end);
  }
  if (leftSamples.length < 3 || rightSamples.length < 3) {
    throw new Error('白枠の左右端を検出できませんでした。');
  }
  const frameLeft = Math.round(median(leftSamples));
  const frameRight = Math.round(median(rightSamples));
  if (frameRight - frameLeft < width * 0.42 || frameRight <= frameLeft) {
    throw new Error('白枠の横幅が不正です。');
  }

  return {
    frameTop, frameBottom, frameHeight, frameLeft, frameRight,
    step1: {
      scanX,
      samples: topSamples.map((top, i) => ({ top, bottom: bottomSamples[i] })),
    },
    step2: { scanY, leftSamples, rightSamples },
  };
}

function detectJacketAndGauge(data, width, height, frame) {
  // Step 3: 白枠縦幅の中央を通る3本の水平スキャンでジャケットとゲージを検出。
  const centerY = Math.round((frame.frameTop + frame.frameBottom) / 2);
  const scanY = [centerY - 2, centerY, centerY + 2]
    .map(y => clampNumber(y, 0, height - 1));
  const nonWhiteSupport = new Array(width).fill(0);
  const profile = new Array(width);
  for (let x = 0; x < width; x++) {
    let count = 0;
    for (const y of scanY) {
      const [r, g, b] = getPixel(data, width, x, y);
      if (rgbDistance(r, g, b, COLOR_TARGETS.frame) > COLOR_TOLERANCE.frame) count++;
    }
    nonWhiteSupport[x] = count / scanY.length;
    profile[x] = medianRgbAtY(data, width, height, x, scanY);
  }
  // ジャケット画像は内部ノイズが強いため、3本中2本以上が非白なら画像内部とみなす。
  const jacketMask = nonWhiteSupport.map(value => value >= 0.5);
  // ジャケット内部の明るい/白い画素で非白マスクが分断されるため、
  // まず短い区間を拾い、ジャケット幅の2.5%以内の穴を結合して全体の外縁を得る。
  const jacketFragments = findRuns(jacketMask, Math.max(8, Math.round(width * 0.012)), Math.max(3, Math.round(width * 0.004)))
    .filter(run => run.start >= frame.frameLeft + 3 && run.start < width * 0.35
      && run.end < width * 0.42);
  const jacketRuns = mergeRunGroups(jacketFragments, Math.max(12, Math.round(width * 0.025)))
    .filter(run => run.length >= width * 0.045);
  if (!jacketRuns.length) throw new Error('ジャケット画像の左右端を検出できませんでした。');
  const jacket = jacketRuns.sort((a, b) => a.start - b.start)[0];
  const jacketLeft = jacket.start;
  const jacketRight = jacket.end;

  // ゲージ色は難易度ごとに変化する。固定色だけでなく彩度/明度の連続区間で検出。
  const gaugeMask = profile.map(([r, g, b], x) => {
    if (x < Math.max(jacketRight + 20, width * 0.45) || x > frame.frameRight) return false;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    const mintDistance = rgbDistance(r, g, b, COLOR_TARGETS.gaugeMint);
    const pinkDistance = rgbDistance(r, g, b, COLOR_TARGETS.gaugePink);
    return (chroma >= 42 && luminance >= 80) || Math.min(mintDistance, pinkDistance) <= 50;
  });
  const gaugeRuns = findRuns(gaugeMask, Math.max(35, Math.round(width * 0.08)), 5)
    .filter(run => run.start >= width * 0.45 && run.start < frame.frameRight);
  if (!gaugeRuns.length) throw new Error('ライフ／ゲージの左端を検出できませんでした。');
  const gaugeLeft = gaugeRuns.sort((a, b) => a.start - b.start)[0].start;
  if (gaugeLeft <= jacketRight + width * 0.12) throw new Error('ゲージ左端の位置が不正です。');

  return {
    jacketLeft, jacketRight, gaugeLeft, centerY,
    step3: { scanY, scanXStart: frame.frameLeft, scanXEnd: frame.frameRight },
  };
}

function detectJacketVerticalBounds(data, width, height, frame, jacket) {
  // Step 4: ジャケット幅を4等分した5本の縦スキャン。中央を含む画像区間を各線で取得。
  const scanX = [];
  const topSamples = [], bottomSamples = [];
  const centerY = Math.round((frame.frameTop + frame.frameBottom) / 2);
  for (let i = 0; i <= 4; i++) {
    const x = clampNumber(Math.round(jacket.jacketLeft
      + (jacket.jacketRight - jacket.jacketLeft) * (i / 4)), 0, width - 1);
    scanX.push(x);
    const mask = new Array(height).fill(false);
    for (let y = frame.frameTop; y <= frame.frameBottom; y++) {
      const [r, g, b] = getPixel(data, width, x, y);
      mask[y] = rgbDistance(r, g, b, COLOR_TARGETS.frame) > COLOR_TOLERANCE.frame;
    }
    const runs = findRuns(mask, Math.max(6, Math.round(frame.frameHeight * 0.40)), 4)
      .filter(run => run.start <= centerY + 4 && run.end >= centerY - 4);
    if (runs.length) {
      // 中央位置を横切る連続区間のみ採用し、下端の1～数pixelノイズを除外。
      const selected = runs.sort((a, b) => b.length - a.length)[0];
      topSamples.push(selected.start);
      bottomSamples.push(selected.end);
    }
  }
  if (topSamples.length < 3 || bottomSamples.length < 3) {
    throw new Error('ジャケット画像の上端/下端を検出できませんでした。');
  }
  const jacketTop = Math.round(median(topSamples));
  const jacketBottom = Math.round(median(bottomSamples));
  const jacketHeight = jacketBottom - jacketTop;
  if (jacketHeight < frame.frameHeight * 0.50 || jacketHeight > frame.frameHeight * 1.30) {
    throw new Error(`ジャケットの縦幅が想定範囲外です (${jacketHeight}px)。`);
  }
  return {
    jacketTop, jacketBottom, jacketHeight, jacketCenter: Math.round((jacketTop + jacketBottom) / 2),
    step4: { scanX, topSamples, bottomSamples },
  };
}

function detectDifficultyAndLevelBadges(data, width, height, frame, jacket, vertical) {
  // Step 5: ジャケット中央～下端を5本横走査。白枠→難易度色→レベル地→白枠を探す。
  // 色バッジは種類により色が異なるため、白枠/背景から離れた領域の連続範囲をまず取得し、
  // その内部のRGB変化量が最大になる境界を各ラインで推定して中央値を採用する。
  const scanY = [];
  for (let i = 0; i <= 4; i++) {
    scanY.push(clampNumber(Math.round(vertical.jacketCenter
      + (vertical.jacketBottom - vertical.jacketCenter) * (i / 4)), 0, height - 1));
  }
  const candidates = [];
  const boundarySamples = [];
  for (const y of scanY) {
    const mask = new Array(width).fill(false);
    const line = new Array(width);
    for (let x = 0; x < width; x++) {
      const [r, g, b] = getPixel(data, width, x, y);
      line[x] = [r, g, b];
      mask[x] = x > jacket.jacketRight + 2 && x < jacket.gaugeLeft - 2
        && rgbDistance(r, g, b, COLOR_TARGETS.frame) > COLOR_TOLERANCE.badgeNonWhite
        && rgbDistance(r, g, b, COLOR_TARGETS.screen) > 12;
    }
    const runs = findRuns(mask, Math.max(3, Math.round(width * 0.004)), 5);
    const groups = mergeRunGroups(runs, Math.max(20, Math.round(width * 0.04)))
      .filter(run => run.length >= width * 0.12
        && run.start > jacket.jacketRight && run.end < jacket.gaugeLeft);
    if (!groups.length) continue;
    // 左端から最初に現れる大きな連続バッジを採用する(曲名文字の領域は上側にある)。
    const badge = groups.sort((a, b) => a.start - b.start)[0];
    candidates.push({ start: badge.start, end: badge.end });

    const searchStart = Math.round(badge.start + badge.length * 0.35);
    const searchEnd = Math.round(badge.start + badge.length * 0.65);
    let strongestX = null;
    let strongestScore = 0;
    for (let x = Math.max(badge.start + 2, searchStart); x < Math.min(badge.end - 2, searchEnd); x++) {
      const left = medianRgbAtX(data, width, height, y, [x - 3, x - 2, x - 1]);
      const right = medianRgbAtX(data, width, height, y, [x, x + 1, x + 2]);
      const score = rgbDistance(left[0], left[1], left[2], right);
      if (score > strongestScore) {
        strongestScore = score;
        strongestX = x;
      }
    }
    if (strongestX != null && strongestScore >= 32) boundarySamples.push(strongestX);
  }
  if (candidates.length < 2 || boundarySamples.length < 2) {
    throw new Error('楽曲難易度/レベルのバッジ境界を検出できませんでした。');
  }
  const difficultyLeft = Math.round(median(candidates.map(item => item.start)));
  const levelRight = Math.round(median(candidates.map(item => item.end)));
  const difficultyRight = Math.round(median(boundarySamples));
  const levelLeft = difficultyRight;
  if (difficultyRight <= difficultyLeft || levelRight <= levelLeft
      || difficultyRight - difficultyLeft < width * 0.045
      || levelRight - levelLeft < width * 0.035) {
    throw new Error('難易度/レベルバッジの幅または境界位置が不正です。');
  }
  return {
    difficultyLeft, difficultyRight, levelLeft, levelRight,
    step5: {
      scanY, scanXStart: jacket.jacketRight, scanXEnd: jacket.gaugeLeft,
      candidates, boundarySamples,
    },
  };
}

function chooseThreeBands(runs, height) {
  const candidates = runs.filter(run => run.length >= height * 0.022 && run.length <= height * 0.078);
  if (candidates.length < 3) return null;
  let best = null;
  let bestScore = Infinity;
  for (let a = 0; a < candidates.length - 2; a++) {
    for (let b = a + 1; b < candidates.length - 1; b++) {
      for (let c = b + 1; c < candidates.length; c++) {
        const triple = [candidates[a], candidates[b], candidates[c]];
        const centers = triple.map(run => (run.start + run.end) / 2);
        const gaps = [centers[1] - centers[0], centers[2] - centers[1]];
        const meanGap = (gaps[0] + gaps[1]) / 2;
        const lengths = triple.map(run => run.length);
        const meanLength = lengths.reduce((sum, value) => sum + value, 0) / 3;
        const gapPenalty = Math.abs(gaps[0] - gaps[1]) / height;
        const spacingPenalty = Math.abs(meanGap / height - 0.105);
        const heightPenalty = Math.abs(meanLength / height - 0.045);
        const rowHeightSpread = (Math.max(...lengths) - Math.min(...lengths)) / height;
        const earlyPenalty = centers[0] < height * 0.48 ? 0.8 : 0;
        const score = gapPenalty * 2.2 + spacingPenalty + heightPenalty * 1.5 + rowHeightSpread + earlyPenalty;
        if (score < bestScore) {
          bestScore = score;
          best = triple;
        }
      }
    }
  }
  return best;
}

function detectJudgementRows(data, width, height, frame, jacket, badges) {
  // Step 9: ジャケット右端～難易度右端を8等分し、9本縦走査。
  // #3F3F62との色距離を段階調整。背景が近似色なので許容値を大きくしすぎない。
  const scanX = [];
  const xStart = clampNumber(jacket.jacketRight + 2, 0, width - 2);
  const xEnd = clampNumber(badges.difficultyRight - 2, xStart + 1, width - 1);
  for (let i = 0; i <= 8; i++) scanX.push(Math.round(xStart + (xEnd - xStart) * (i / 8)));
  if (scanX.length !== 9 || xEnd <= xStart) throw new Error('判定行の縦スキャン範囲が不正です。');

  const minY = Math.max(Math.round(height * 0.47), Math.round(frame.frameBottom + height * 0.22));
  let selected = null;
  let selectedTolerance = null;
  let selectedRuns = [];
  for (const tolerance of [8, 9, 10, 11, 12, 13]) {
    const support = new Array(height).fill(0);
    for (let y = minY; y < height; y++) {
      let count = 0;
      for (const x of scanX) {
        const [r, g, b] = getPixel(data, width, x, y);
        if (rgbDistance(r, g, b, COLOR_TARGETS.resultPill) <= tolerance) count++;
      }
      support[y] = count / scanX.length;
    }
    const smooth = boxSmooth(support, 2);
    const mask = smooth.map((value, y) => y >= minY && value >= 0.42);
    const runs = findRuns(mask, Math.max(12, Math.round(height * 0.022)), 4)
      .filter(run => run.length >= height * 0.022 && run.length <= height * 0.078);
    const triple = chooseThreeBands(runs, height);
    if (triple) {
      selected = triple;
      selectedTolerance = tolerance;
      selectedRuns = runs;
      break;
    }
  }
  if (!selected) {
    throw new Error('判定カード(PERFECT/GOOD/MISS)を3段検出できませんでした。');
  }
  const [perfect, good, miss] = selected;
  if (!(perfect.end < good.start && good.end < miss.start)) {
    throw new Error('判定カードの上下関係が不正です。');
  }
  return {
    perfectTop: perfect.start, perfectBottom: perfect.end,
    goodTop: good.start, goodBottom: good.end,
    missTop: miss.start, missBottom: miss.end,
    step9: {
      scanX, minY, colorTolerance: selectedTolerance,
      detectedBands: selected.map(run => ({ top: run.start, bottom: run.end })),
      candidateBands: selectedRuns.map(run => ({ top: run.start, bottom: run.end })),
    },
  };
}

function detectResultPanelHorizontalBounds(data, width, height, frame, jacket, rows) {
  // Step 10: GOOD上端～MISS下端を8等分した9本の水平走査。
  // 各水平線で#3F3F62の一致率を取り、GOOD列とLATE/FAST列の外縁を集約する。
  const scanY = [];
  for (let i = 0; i <= 8; i++) {
    scanY.push(Math.round(rows.goodTop + (rows.missBottom - rows.goodTop) * (i / 8)));
  }
  const xStart = clampNumber(frame.frameLeft, 0, width - 1);
  const xEnd = clampNumber(jacket.gaugeLeft, xStart + 1, width);
  let chosenRuns = [];
  let chosenTolerance = COLOR_TOLERANCE.judgementBase;
  for (const tolerance of [9, 10, 11, 12]) {
    const support = new Array(xEnd - xStart).fill(0);
    for (let x = xStart; x < xEnd; x++) {
      let count = 0;
      for (const y of scanY) {
        const [r, g, b] = getPixel(data, width, x, y);
        if (rgbDistance(r, g, b, COLOR_TARGETS.resultPill) <= tolerance) count++;
      }
      support[x - xStart] = count / scanY.length;
    }
    const smooth = boxSmooth(support, 4);
    const mask = smooth.map(value => value >= 0.25);
    const runs = findRuns(mask, Math.max(12, Math.round(width * 0.008)), 10)
      .map(run => ({ start: run.start + xStart, end: run.end + xStart, length: run.length }))
      .filter(run => run.length >= width * 0.08 && run.start >= frame.frameLeft && run.end <= jacket.gaugeLeft);
    if (runs.length >= 2) {
      chosenRuns = runs;
      chosenTolerance = tolerance;
      break;
    }
  }
  if (chosenRuns.length < 2) {
    throw new Error('GOODカードとLATE/FASTカードの左右端を検出できませんでした。');
  }

  // LATE/FASTは右側にある大きなカード。これより左の一致区間をすべてGOODカードに統合。
  // GOOD列より右側にあるカードをLATE/FASTとする。ヘッダー余白や端末比率で
  // x座標の絶対比率が変わるため、画面左端からの固定比率では除外しない。
  const lateCandidates = chosenRuns.filter(run => run.length >= width * 0.08);
  if (lateCandidates.length < 2) throw new Error('LATE/FASTカードが見つかりませんでした。');
  const lateFast = lateCandidates.sort((a, b) => b.end - a.end)[0];
  const goodFragments = chosenRuns.filter(run => run.end <= lateFast.start && run.start < lateFast.start);
  if (!goodFragments.length) throw new Error('GOODカードが見つかりませんでした。');
  const goodLeft = Math.min(...goodFragments.map(run => run.start));
  const goodRight = Math.max(...goodFragments.map(run => run.end));
  const lateFastLeft = lateFast.start;
  if (goodRight <= goodLeft || goodRight >= lateFastLeft
      || goodRight - goodLeft < width * 0.12
      || lateFastLeft - goodRight > width * 0.12) {
    throw new Error(`GOOD/LATE・FASTカードの境界が不正です (GOOD:${goodLeft}-${goodRight}, LATE:${lateFastLeft})。`);
  }
  return {
    goodLeft, goodRight, lateFastLeft,
    step10: {
      scanY, scanXStart: xStart, scanXEnd: xEnd,
      colorTolerance: chosenTolerance,
      cardCandidates: chosenRuns.map(run => ({ left: run.start, right: run.end })),
    },
  };
}

function rectFromBounds(left, top, right, bottom) {
  const x = Math.round(left), y = Math.round(top);
  const r = Math.round(right), b = Math.round(bottom);
  return { x, y, w: Math.max(1, r - x), h: Math.max(1, b - y) };
}

function createOcrRegions(frame, jacket, vertical, badges, rows, panels) {
  // Step 6～8、11～16: 指定された境界をそのまま使って領域A～Iを作成。
  return {
    title: rectFromBounds(jacket.jacketRight, vertical.jacketTop, frame.frameRight, vertical.jacketCenter), // A
    difficulty: rectFromBounds(badges.difficultyLeft, vertical.jacketCenter, badges.difficultyRight, vertical.jacketBottom), // B
    level: rectFromBounds(badges.levelLeft, vertical.jacketCenter, badges.levelRight, vertical.jacketBottom), // C
    perfect: rectFromBounds(panels.goodLeft, rows.perfectTop, panels.goodRight, rows.perfectBottom), // D
    great: rectFromBounds(panels.goodLeft, rows.perfectBottom, panels.goodRight, rows.goodTop), // E
    good: rectFromBounds(panels.goodLeft, rows.goodTop, panels.goodRight, rows.goodBottom), // F
    bad: rectFromBounds(panels.goodLeft, rows.goodBottom, panels.goodRight, rows.missTop), // G
    miss: rectFromBounds(panels.goodLeft, rows.missTop, panels.goodRight, rows.missBottom), // H
    combo: rectFromBounds(panels.lateFastLeft, rows.perfectTop, jacket.gaugeLeft, rows.perfectBottom), // I
  };
}

function drawLine(ctx, x1, y1, x2, y2, color, lineWidth) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.globalAlpha = 0.92;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.restore();
}

function annotateDetectedLayout(imageElement, layout, regions) {
  const canvas = document.createElement('canvas');
  canvas.width = imageElement.naturalWidth;
  canvas.height = imageElement.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageElement, 0, 0);
  const w = canvas.width, h = canvas.height;
  const bounds = layout.bounds;
  const colors = {
    red: '#ff3030', blue: '#2584ff', green: '#23e56b', yellow: '#ffed36',
    purple: '#c45cff', pink: '#ff55bc', cyan: '#25eaff',
  };

  // Step 1: 赤の細線(縦スキャン)と白枠下端の太線。
  for (const x of bounds.step1.scanX) drawLine(ctx, x, 0, x, bounds.frameBottom + 5, colors.red, 2);
  drawLine(ctx, 0, bounds.frameBottom, w, bounds.frameBottom, colors.red, 6);
  drawLine(ctx, 0, bounds.frameTop, w, bounds.frameTop, colors.red, 3);

  // Step 2: 青の細線(横スキャン)と白枠左右端の太線。
  for (const y of bounds.step2.scanY) drawLine(ctx, 0, y, w, y, colors.blue, 2);
  drawLine(ctx, bounds.frameLeft, bounds.frameTop, bounds.frameLeft, bounds.frameBottom, colors.blue, 6);
  drawLine(ctx, bounds.frameRight, bounds.frameTop, bounds.frameRight, bounds.frameBottom, colors.blue, 6);

  // Step 3: 緑の中央横スキャン、ジャケット左右端、ゲージ左端。
  for (const y of layout.jacketStep3.scanY) drawLine(ctx, bounds.frameLeft, y, bounds.frameRight, y, colors.green, 2);
  for (const x of [layout.jacketLeft, layout.jacketRight, layout.gaugeLeft]) {
    drawLine(ctx, x, bounds.frameTop, x, bounds.frameBottom, colors.green, 6);
  }

  // Step 4: 黄の5本縦スキャンとジャケット上下/中央境界。
  for (const x of layout.step4.scanX) drawLine(ctx, x, layout.jacketTop, x, layout.jacketBottom, colors.yellow, 2);
  drawLine(ctx, layout.jacketLeft, layout.jacketTop, layout.jacketRight, layout.jacketTop, colors.yellow, 6);
  drawLine(ctx, layout.jacketLeft, layout.jacketCenter, layout.jacketRight, layout.jacketCenter, colors.yellow, 6);
  drawLine(ctx, layout.jacketLeft, layout.jacketBottom, layout.jacketRight, layout.jacketBottom, colors.yellow, 6);

  // Step 5: 紫の5本横スキャンと難易度/レベル3境界。
  for (const y of layout.step5.scanY) drawLine(ctx, layout.jacketRight, y, layout.gaugeLeft, y, colors.purple, 2);
  for (const x of [layout.difficultyLeft, layout.difficultyRight, layout.levelRight]) {
    drawLine(ctx, x, layout.jacketCenter, x, layout.jacketBottom, colors.purple, 6);
  }

  // Step 9: 桃の9本縦スキャンと判定帯6本の上下端。
  for (const x of layout.step9.scanX) drawLine(ctx, x, bounds.frameBottom, x, h, colors.pink, 2);
  for (const y of [layout.perfectTop, layout.perfectBottom, layout.goodTop, layout.goodBottom, layout.missTop, layout.missBottom]) {
    drawLine(ctx, layout.jacketRight, y, layout.difficultyRight, y, colors.pink, 6);
  }

  // Step 10: 水色の9本横スキャンとGOOD/LATE・FASTの境界。
  for (const y of layout.step10.scanY) drawLine(ctx, layout.frameLeft, y, layout.gaugeLeft, y, colors.cyan, 2);
  for (const x of [layout.goodLeft, layout.goodRight, layout.lateFastLeft]) {
    drawLine(ctx, x, layout.goodTop, x, layout.missBottom, colors.cyan, 6);
  }

  // 領域A～Iはスキャン線と区別できる白縁付きの色枠・ラベルで描画。
  const regionColors = {
    title: '#ff9f43', difficulty: '#d86cff', level: '#a56eff',
    perfect: '#ff5c75', great: '#ff8b5c', good: '#ffca3a', bad: '#f36bff', miss: '#ff3f9b', combo: '#35d8ee',
  };
  const regionLabels = { title: 'A', difficulty: 'B', level: 'C', perfect: 'D', great: 'E', good: 'F', bad: 'G', miss: 'H', combo: 'I' };
  for (const [key, rect] of Object.entries(regions)) {
    const color = regionColors[key];
    ctx.save();
    ctx.lineWidth = 4; ctx.strokeStyle = '#ffffff'; ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    const label = regionLabels[key];
    ctx.font = `bold ${Math.max(18, Math.round(w * 0.012))}px sans-serif`;
    const textWidth = ctx.measureText(label).width;
    const tagY = Math.max(0, rect.y - 25);
    ctx.fillStyle = '#101326'; ctx.fillRect(rect.x, tagY, textWidth + 14, 24);
    ctx.fillStyle = color; ctx.fillText(label, rect.x + 7, tagY + 18);
    ctx.restore();
  }
  return canvas.toDataURL('image/jpeg', 0.92);
}

function detectResultLayout(imageElement) {
  if (!imageElement || !imageElement.naturalWidth || !imageElement.naturalHeight) {
    throw new Error('画像が読み込まれていないか、画像サイズが不正です。');
  }
  const canvas = document.createElement('canvas');
  canvas.width = imageElement.naturalWidth;
  canvas.height = imageElement.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('画像解析用のCanvasを作成できませんでした。');
  ctx.drawImage(imageElement, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  const width = canvas.width, height = canvas.height;

  const frame = detectFrameBounds(data, width, height);
  const jacketBase = detectJacketAndGauge(data, width, height, frame);
  const jacketVertical = detectJacketVerticalBounds(data, width, height, frame, jacketBase);
  const badges = detectDifficultyAndLevelBadges(data, width, height, frame, jacketBase, jacketVertical);
  const rows = detectJudgementRows(data, width, height, frame, jacketBase, badges);
  const panels = detectResultPanelHorizontalBounds(data, width, height, frame, jacketBase, rows);
  const regions = createOcrRegions(frame, jacketBase, jacketVertical, badges, rows, panels);

  // OCR領域が画像外に出る/逆転する/小さすぎる場合はOCR前に検出失敗とする。
  for (const [key, rect] of Object.entries(regions)) {
    if (!Number.isFinite(rect.x) || !Number.isFinite(rect.y) || !Number.isFinite(rect.w) || !Number.isFinite(rect.h)
        || rect.x < 0 || rect.y < 0 || rect.x + rect.w > width || rect.y + rect.h > height
        || rect.w < 8 || rect.h < 8) {
      throw new Error(`OCR領域${key}の座標が不正です (${JSON.stringify(rect)})。`);
    }
  }

  const bounds = {
    ...frame, ...jacketBase, ...jacketVertical, ...badges, ...rows, ...panels,
    step1: frame.step1, step2: frame.step2,
  };
  const scanData = {
    jacketStep3: jacketBase.step3,
    step4: jacketVertical.step4,
    step5: badges.step5,
    step9: rows.step9,
    step10: panels.step10,
  };
  const annotatedDataUrl = annotateDetectedLayout(imageElement, { bounds, ...scanData }, regions);
  return { bounds, scanData, regions, annotatedDataUrl, imageWidth: width, imageHeight: height };
}

// ============================================================
// 大津の二値化(Otsu)とフィールド前処理
// ============================================================
function computeOtsuThreshold(histogram, totalPixels) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];
  let sumB = 0, wB = 0, maxVar = -1, threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (!wB) continue;
    const wF = totalPixels - wB;
    if (!wF) break;
    sumB += t * histogram[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const variance = wB * wF * (mB - mF) * (mB - mF);
    if (variance > maxVar) { maxVar = variance; threshold = t; }
  }
  return threshold;
}

function binarizeCanvasInPlace(canvas, ctx, channelType) {
  const w = canvas.width, h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const channel = new Uint8Array(w * h);
  const histogram = new Array(256).fill(0);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const value = channelType === 'whiteness' ? clampNumber(luminance - chroma, 0, 255) : luminance;
    channel[p] = value | 0;
    histogram[channel[p]]++;
  }
  const threshold = computeOtsuThreshold(histogram, w * h);
  let below = 0;
  for (let p = 0; p < channel.length; p++) if (channel[p] < threshold) below++;
  const textIsBelowThreshold = below <= channel.length - below;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const isText = textIsBelowThreshold ? channel[p] < threshold : channel[p] >= threshold;
    const value = isText ? 0 : 255;
    data[i] = data[i + 1] = data[i + 2] = value;
    data[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return { threshold, channelType, textIsBelowThreshold };
}

function cropRectToCanvas(imageElement, rect, fieldKey) {
  const width = imageElement.naturalWidth, height = imageElement.naturalHeight;
  const x = clampNumber(Math.floor(rect.x), 0, width - 1);
  const y = clampNumber(Math.floor(rect.y), 0, height - 1);
  const right = clampNumber(Math.ceil(rect.x + rect.w), x + 1, width);
  const bottom = clampNumber(Math.ceil(rect.y + rect.h), y + 1, height);
  const sw = right - x, sh = bottom - y;
  const upscale = UPSCALE_BY_FIELD[fieldKey] || 3;

  const originalCanvas = document.createElement('canvas');
  originalCanvas.width = sw; originalCanvas.height = sh;
  const originalCtx = originalCanvas.getContext('2d');
  originalCtx.drawImage(imageElement, x, y, sw, sh, 0, 0, sw, sh);
  const originalDataUrl = originalCanvas.toDataURL('image/png');

  const canvas = document.createElement('canvas');
  // 領域Iには「COMBO」ラベルと数値が同居する。処理前画像は領域全体を保存し、
  // OCR用画像だけ左側ラベルを除いた数値部分(右60%)を拡大して誤読を抑える。
  const ocrSourceX = fieldKey === 'combo' ? Math.round(sw * 0.40) : 0;
  const ocrSourceWidth = Math.max(1, sw - ocrSourceX);
  canvas.width = Math.max(1, Math.round(ocrSourceWidth * upscale));
  canvas.height = Math.max(1, Math.round(sh * upscale));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(originalCanvas, ocrSourceX, 0, ocrSourceWidth, sh, 0, 0, canvas.width, canvas.height);
  return {
    canvas, ctx, originalDataUrl,
    srcRect: { x, y, w: sw, h: sh },
    regionRatio: { x: x / width, y: y / height, w: sw / width, h: sh / height },
  };
}

function prepareFieldImage(imageElement, rect, fieldKey) {
  const cropped = cropRectToCanvas(imageElement, rect, fieldKey);
  const channelType = BINARIZE_CHANNEL_BY_FIELD[fieldKey] || 'luminance';
  const { threshold, textIsBelowThreshold } = binarizeCanvasInPlace(cropped.canvas, cropped.ctx, channelType);
  return {
    canvas: cropped.canvas,
    originalDataUrl: cropped.originalDataUrl,
    dataUrl: cropped.canvas.toDataURL('image/png'),
    regionRatio: cropped.regionRatio,
    srcRect: cropped.srcRect,
    threshold, channelType, textIsBelowThreshold,
  };
}

// ============================================================
// OCR・値解析
// ============================================================
async function recognizeField(worker, canvas, { whitelist = '', psm = PSM.SINGLE_LINE } = {}) {
  try {
    await worker.setParameters({ tessedit_pageseg_mode: psm, tessedit_char_whitelist: whitelist });
    const result = await worker.recognize(canvas);
    return { text: result.data.text || '', confidence: Math.round(result.data.confidence || 0), error: null };
  } catch (error) {
    console.error('OCR recognize failed', error);
    return { text: '', confidence: 0, error: String(error && error.message || error) };
  }
}

const DIFF_WORD_TO_CODE = { EASY: 'EZ', NORMAL: 'NM', HARD: 'HD', EXPERT: 'EX', MASTER: 'MS', APPEND: 'AP' };
const DIFF_WORDS = Object.keys(DIFF_WORD_TO_CODE);

function levenshtein(a, b) {
  const rows = a.length + 1, cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;
  for (let i = 1; i < rows; i++) for (let j = 1; j < cols; j++) {
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return dp[rows - 1][cols - 1];
}

function detectDifficultyCode(diffText) {
  const cleaned = (diffText || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (!cleaned) return { code: null, matched: false, distanceRatio: 1, ocrLetters: '' };
  for (const word of DIFF_WORDS) if (cleaned.includes(word)) {
    return { code: DIFF_WORD_TO_CODE[word], matched: true, distanceRatio: 0, ocrLetters: cleaned };
  }
  let bestWord = 'EXPERT', bestDistance = Infinity;
  for (const word of DIFF_WORDS) {
    const distance = levenshtein(cleaned, word) / Math.max(cleaned.length, word.length);
    if (distance < bestDistance) { bestDistance = distance; bestWord = word; }
  }
  return { code: DIFF_WORD_TO_CODE[bestWord], matched: false, distanceRatio: bestDistance, ocrLetters: cleaned };
}

function parseLevelText(text) {
  const matches = (text || '').match(/\d+/g);
  if (!matches || !matches.length) return null;
  const best = matches.reduce((a, b) => b.length > a.length ? b : a);
  const value = parseInt(best, 10);
  return Number.isFinite(value) ? value : null;
}

function parseDigitField(text) {
  const matches = (text || '').match(/\d+/g) || [];
  if (!matches.length) return { value: 0, found: false, groups: [] };
  const best = matches.reduce((a, b) => b.length > a.length ? b : a);
  const value = parseInt(best, 10);
  return { value: Number.isFinite(value) ? value : 0, found: true, groups: matches };
}

function parseComboText(text) {
  const parsed = parseDigitField(text);
  return { value: parsed.value, ambiguous: parsed.groups.length > 1, groups: parsed.groups };
}

function confidenceLevelFromPercent(value) {
  if (value >= 80) return 'high';
  if (value >= 55) return 'medium';
  return 'low';
}

// ============================================================
// メイン解析処理
// ============================================================
async function analyzeLoadedImage(imgElement, worker) {
  try {
    const layout = detectResultLayout(imgElement);
    const debugLog = {
      layout: {
        annotatedDataUrl: layout.annotatedDataUrl,
        imageWidth: layout.imageWidth,
        imageHeight: layout.imageHeight,
        bounds: layout.bounds,
        regions: layout.regions,
      },
    };

    async function processField(key, whitelist, psm) {
      const prep = prepareFieldImage(imgElement, layout.regions[key], key);
      const ocr = await recognizeField(worker, prep.canvas, { whitelist, psm });
      debugLog[key] = {
        regionRatio: prep.regionRatio,
        srcRect: prep.srcRect,
        originalDataUrl: prep.originalDataUrl,
        dataUrl: prep.dataUrl,
        threshold: prep.threshold,
        channelType: prep.channelType,
        textIsBelowThreshold: prep.textIsBelowThreshold,
        ocrText: ocr.text.trim(),
        confidence: ocr.confidence,
        ocrError: ocr.error,
      };
      return { prep, ocr };
    }

    // A: 曲名、B: 難易度、C: 楽曲レベル。
    const titleResult = await processField('title', '', PSM.SINGLE_LINE);
    const difficultyResult = await processField('difficulty', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', PSM.SINGLE_LINE);
    const levelResult = await processField('level', '0123456789', PSM.SINGLE_LINE);

    const difficulty = detectDifficultyCode(difficultyResult.ocr.text.toUpperCase());
    const levelValue = parseLevelText(levelResult.ocr.text);
    debugLog.difficulty.detected = difficulty;
    debugLog.level.value = levelValue;

    // D～H: 判定カード5領域を独立OCR。表示ラベルではなく各領域内の数字を読み取る。
    const rowValues = {};
    const rowFound = {};
    const rowConfidences = [];
    for (const key of BREAKDOWN_KEYS) {
      const result = await processField(key, '0123456789', PSM.SINGLE_LINE);
      const parsed = parseDigitField(result.ocr.text);
      rowValues[key] = parsed.value;
      rowFound[key] = parsed.found;
      rowConfidences.push(result.ocr.confidence);
      debugLog[key].parsedValue = parsed.value;
      debugLog[key].found = parsed.found;
      debugLog[key].numberGroups = parsed.groups;
    }
    const breakdownConfidence = Math.round(rowConfidences.reduce((sum, value) => sum + value, 0) / rowConfidences.length);
    const breakdown = {
      ...rowValues,
      found: rowFound,
      allFound: BREAKDOWN_KEYS.every(key => rowFound[key]),
      confidence: breakdownConfidence,
    };

    // I: コンボ数領域。
    const comboResult = await processField('combo', '0123456789', PSM.SINGLE_LINE);
    const combo = parseComboText(comboResult.ocr.text);
    combo.confidence = comboResult.ocr.confidence;
    debugLog.combo.parsed = combo;

    return {
      difficulty: {
        code: difficulty.code,
        matched: difficulty.matched,
        distanceRatio: difficulty.distanceRatio,
        confidence: difficultyResult.ocr.confidence,
        ocrText: difficultyResult.ocr.text.trim(),
      },
      level: {
        value: levelValue,
        confidence: levelResult.ocr.confidence,
        ocrText: levelResult.ocr.text.trim(),
        diffHint: null,
      },
      title: {
        ocrText: titleResult.ocr.text.replace(/\r?\n/g, '').trim(),
        confidence: titleResult.ocr.confidence,
      },
      breakdown,
      combo,
      debugLog,
    };
  } catch (error) {
    console.error('analyzeLoadedImage failed', error);
    return null;
  }
}
