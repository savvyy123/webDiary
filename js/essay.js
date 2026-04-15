// ==================================================
//  essay.js  エッセイモード（原稿用紙）
// ==================================================

// ===== 状態変数 =====

let essayMode = false;
let essayRows = 50;
let essayCols = 30;
let essayCursorVisible = true;
let essayCursorTimer = null;
let essayToastMsg = '';
let essayToastTimer = null;
let essayIsPasting = false;

// ステージ上に表示するエッセイキャンバス
let essayStageCanvas = null;
let essayStageCtx = null;

// ===== DOM 参照 =====

const essayOverlay     = document.getElementById('essayOverlay');
const essayCanvas      = document.getElementById('essayCanvas');
const essayCtx         = essayCanvas.getContext('2d');
const essayHiddenInput = document.getElementById('essayHiddenInput');
const essayRowsInput   = document.getElementById('essayRowsInput');
const essayColsInput   = document.getElementById('essayColsInput');
const essayModeBtn     = document.getElementById('essayModeBtn');

// ===== 原稿用紙 特殊文字セット =====

// 句読点: セル右上に配置
const ESSAY_PUNCT_CORNER = new Set(['。', '、', '．', '，']);

// 90° 時計回り回転が必要な文字
const ESSAY_ROTATE_CW = new Set([
  'ー', '―', '─', '—', '─', '〜', '～',
  '…', '‥',
  '！', '？', '!', '?',
  '（', '）', '【', '】',
  '〔', '〕', '〈', '〉', '《', '》',
  '｛', '｝', '〝', '〟',
]);

// ===== 文字描画ヘルパー =====

function drawVerticalChar(ctx, ch, cellX, cellY, cellSize) {
  const cx = cellX + cellSize / 2;
  const cy = cellY + cellSize / 2;

  if (ESSAY_PUNCT_CORNER.has(ch)) {
    // 句読点：縮小してセル右上隅に配置
    const pSize = Math.max(3, Math.floor(cellSize * 0.45));
    ctx.save();
    ctx.font = ctx.font.replace(/\d+(\.\d+)?px/, pSize + 'px');
    ctx.fillText(ch, cellX + cellSize - pSize / 2, cellY + pSize / 2);
    ctx.restore();
  } else if (ESSAY_ROTATE_CW.has(ch)) {
    // 棒線・括弧等：90° 時計回りに回転
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  } else {
    ctx.fillText(ch, cx, cy);
  }
}

// 文字インデックス → (col, row) 変換（縦書き：右列から左列へ）
function essayCharToCell(text, charIdx) {
  let col = 0, row = 0;
  for (let i = 0; i < charIdx; i++) {
    if (text[i] === '\n') {
      col++; row = 0;
    } else {
      row++;
      if (row >= essayRows) { row = 0; col++; }
    }
  }
  return { col, row };
}

// ===== 原稿用紙グリッド描画（オーバーレイ・ステージ・サムネイル共用） =====

function drawEssayGrid(ctx, W, H, text, options = {}) {
  const { padX = 80, padY = 56, showCursor = false, cursorIdx = 0, cursorVisible = false } = options;
  const rows = essayRows;
  const cols = essayCols;

  const cellSize = Math.floor(Math.min((W - padX * 2) / cols, (H - padY * 2) / rows));
  if (cellSize < 1) return;

  const gridW = cellSize * cols;
  const gridH = cellSize * rows;
  const startX = Math.floor((W - gridW) / 2);
  const startY = Math.floor((H - gridH) / 2);

  // 背景（和紙色）
  ctx.fillStyle = '#fffef5';
  ctx.fillRect(0, 0, W, H);

  // 外枠（太線）
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.strokeRect(startX, startY, gridW, gridH);

  // 内部グリッド線
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 0.7;
  for (let c = 1; c < cols; c++) {
    const x = startX + c * cellSize;
    ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, startY + gridH); ctx.stroke();
  }
  for (let r = 1; r < rows; r++) {
    const y = startY + r * cellSize;
    ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(startX + gridW, y); ctx.stroke();
  }

  // テキスト（縦書き：右列から左列へ）
  const fs = Math.floor(cellSize * 0.72);
  ctx.font = `500 ${fs}px 'Noto Sans JP', sans-serif`;
  ctx.fillStyle = '#111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  let ci = 0;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; ) {
      if (ci >= text.length) break;
      const ch = text[ci];
      if (ch === '\n') { ci++; break; }
      const cellX = startX + (cols - 1 - c) * cellSize;
      const cellY = startY + r * cellSize;
      drawVerticalChar(ctx, ch, cellX, cellY, cellSize);
      ci++; r++;
    }
    if (ci >= text.length) break;
  }

  // カーソル（セル上端の水平線）
  if (showCursor && cursorVisible) {
    const { col: curCol, row: curRow } = essayCharToCell(text, cursorIdx);
    if (curCol < cols && curRow <= rows) {
      const cx = startX + (cols - 1 - curCol) * cellSize;
      const cy = startY + curRow * cellSize;
      ctx.strokeStyle = '#1e88e5';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx + 3, cy + 2);
      ctx.lineTo(cx + cellSize - 3, cy + 2);
      ctx.stroke();
    }
  }
}

// サムネイル用（パディング小）
function renderEssayThumbnail(ctx, W, H, text) {
  drawEssayGrid(ctx, W, H, text, { padX: 8, padY: 6 });
}

// ステージ上に原稿用紙を表示
function renderEssayOnStage() {
  const page = slides[idx];
  const text = page ? (page.essayText || '') : '';

  if (!text) {
    if (essayStageCanvas) essayStageCanvas.style.display = 'none';
    return;
  }

  // 初回：stageInner の最背面に挿入
  if (!essayStageCanvas) {
    essayStageCanvas = document.createElement('canvas');
    essayStageCanvas.className = 'essay-stage-canvas';
    stageInner.insertBefore(essayStageCanvas, stageInner.firstChild);
    essayStageCtx = essayStageCanvas.getContext('2d');
  }

  essayStageCanvas.style.display = 'block';
  output.style.visibility = 'hidden';

  const { baseRect } = getStageTransform();
  const dpr = window.devicePixelRatio || 1;
  const W = baseRect.width;
  const H = baseRect.height;
  essayStageCanvas.width        = Math.round(W * dpr);
  essayStageCanvas.height       = Math.round(H * dpr);
  essayStageCanvas.style.width  = W + 'px';
  essayStageCanvas.style.height = H + 'px';
  essayStageCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  drawEssayGrid(essayStageCtx, W, H, text, { padX: 36, padY: 28 });
}

// ===== エッセイモード制御 =====

function toggleEssayMode() {
  essayMode ? exitEssayMode() : enterEssayMode();
}

function enterEssayMode() {
  essayMode = true;
  if (!slides[idx].essayText) slides[idx].essayText = '';
  essayHiddenInput.value = slides[idx].essayText;
  essayOverlay.classList.remove('essay-hidden');

  const onFS = () => {
    document.removeEventListener('fullscreenchange', onFS);
    document.removeEventListener('webkitfullscreenchange', onFS);
    resizeEssayCanvas();
    renderEssayCanvas();
    essayHiddenInput.focus();
  };
  document.addEventListener('fullscreenchange', onFS);
  document.addEventListener('webkitfullscreenchange', onFS);

  essayOverlay.requestFullscreen({ navigationUI: 'hide' }).catch(() => {
    document.removeEventListener('fullscreenchange', onFS);
    document.removeEventListener('webkitfullscreenchange', onFS);
    setTimeout(() => { resizeEssayCanvas(); renderEssayCanvas(); essayHiddenInput.focus(); }, 50);
  });

  essayCursorVisible = true;
  essayCursorTimer = setInterval(() => {
    if (!essayMode) return;
    essayCursorVisible = !essayCursorVisible;
    renderEssayCanvas();
  }, 530);
}

function exitEssayMode() {
  if (!essayMode) return;
  essayMode = false;
  clearInterval(essayCursorTimer);
  essayCursorTimer = null;
  slides[idx].essayText = essayHiddenInput.value;
  essayOverlay.classList.add('essay-hidden');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  persist();
  renderEssayOnStage();
}

function resizeEssayCanvas() {
  const dpr = window.devicePixelRatio || 1;
  essayCanvas.width  = Math.round(window.innerWidth  * dpr);
  essayCanvas.height = Math.round(window.innerHeight * dpr);
}

function renderEssayCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const W   = Math.round(essayCanvas.width  / dpr);
  const H   = Math.round(essayCanvas.height / dpr);
  essayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const text = essayHiddenInput.value;

  drawEssayGrid(essayCtx, W, H, text, {
    padX: 80, padY: 56,
    showCursor: true,
    cursorIdx: essayHiddenInput.selectionStart || 0,
    cursorVisible: essayCursorVisible
  });

  // 下部ヒント
  const charCount = text.replace(/\n/g, '').length;
  essayCtx.fillStyle = 'rgba(0,0,0,0.3)';
  essayCtx.font = '12px sans-serif';
  essayCtx.textAlign = 'center';
  essayCtx.textBaseline = 'bottom';
  essayCtx.fillText(`${charCount} 字  /  Shift+E または Esc で終了`, W / 2, H - 12);

  // トースト通知
  if (essayToastMsg) {
    const cellSize = Math.floor(Math.min((W - 80 * 2) / essayCols, (H - 56 * 2) / essayRows));
    const startY = Math.floor((H - cellSize * essayRows) / 2);
    const tw = essayCtx.measureText(essayToastMsg).width + 32;
    const th = 36;
    const tx = (W - tw) / 2;
    const ty = startY - th - 12;
    essayCtx.fillStyle = 'rgba(30,136,229,0.92)';
    essayCtx.beginPath();
    essayCtx.roundRect(tx, ty, tw, th, 8);
    essayCtx.fill();
    essayCtx.fillStyle = '#fff';
    essayCtx.font = 'bold 14px sans-serif';
    essayCtx.textAlign = 'center';
    essayCtx.textBaseline = 'middle';
    essayCtx.fillText(essayToastMsg, W / 2, ty + th / 2);
  }
}

// テキストを1ページ分ずつ分割（縦書き：cols 本 × rows 文字）
function splitEssayText(text, rows, cols) {
  const pages = [];
  let i = 0;
  while (i < text.length) {
    let pageText = '';
    let col = 0, row = 0;
    while (i < text.length && col < cols) {
      const ch = text[i];
      pageText += ch;
      i++;
      if (ch === '\n') { col++; row = 0; }
      else { row++; if (row >= rows) { col++; row = 0; } }
    }
    pages.push(pageText);
  }
  return pages;
}

// ペースト後のオーバーフロー処理
function handleEssayOverflow() {
  const text = essayHiddenInput.value;
  const pages = splitEssayText(text, essayRows, essayCols);

  if (pages.length <= 1) {
    slides[idx].essayText = text;
    essayCursorVisible = true;
    renderEssayCanvas();
    persist();
    return;
  }

  pushUndoState();

  slides[idx].essayText = pages[0];
  essayHiddenInput.value = pages[0];

  for (let p = pages.length - 1; p >= 1; p--) {
    slides.splice(idx + p, 0, { text: '', raster: null, name: '', essayText: pages[p] });
  }

  const added = pages.length - 1;
  essayToastMsg = `${added} ページ追加しました`;
  clearTimeout(essayToastTimer);
  essayToastTimer = setTimeout(() => { essayToastMsg = ''; renderEssayCanvas(); }, 2500);

  essayCursorVisible = true;
  renderEssayCanvas();
  renderRail();
  persist();
}

// ===== イベントハンドラ =====

essayRowsInput.addEventListener('change', () => {
  essayRows = Math.max(5, Math.min(50, parseInt(essayRowsInput.value) || 20));
  essayRowsInput.value = essayRows;
  if (essayMode) renderEssayCanvas();
});

essayColsInput.addEventListener('change', () => {
  essayCols = Math.max(5, Math.min(50, parseInt(essayColsInput.value) || 20));
  essayColsInput.value = essayCols;
  if (essayMode) renderEssayCanvas();
});

essayModeBtn.addEventListener('click', toggleEssayMode);

essayHiddenInput.addEventListener('paste', () => {
  essayIsPasting = true;
  setTimeout(() => { essayIsPasting = false; handleEssayOverflow(); }, 0);
});

essayHiddenInput.addEventListener('input', () => {
  if (essayIsPasting) return;
  slides[idx].essayText = essayHiddenInput.value;
  essayCursorVisible = true;
  renderEssayCanvas();
  renderEssayOnStage();
  persist();
});

essayHiddenInput.addEventListener('keydown', e => {
  if (e.key === 'Escape' || (e.shiftKey && (e.key === 'e' || e.key === 'E'))) {
    e.preventDefault();
    exitEssayMode();
    return;
  }
  requestAnimationFrame(() => renderEssayCanvas());
});

essayHiddenInput.addEventListener('keyup', () => renderEssayCanvas());

essayOverlay.addEventListener('click', () => essayHiddenInput.focus());

document.addEventListener('fullscreenchange', () => {
  if (essayMode) {
    if (!document.fullscreenElement) {
      exitEssayMode();
    } else {
      resizeEssayCanvas();
      renderEssayCanvas();
      essayHiddenInput.focus();
    }
  }
});

document.addEventListener('webkitfullscreenchange', () => {
  if (essayMode) { resizeEssayCanvas(); renderEssayCanvas(); }
});
