// ==================================================
//  draw.js  手書きモード（Draw Canvas）
// ==================================================

// 手書き用キャンバスのセットアップ（ページ切り替え時も呼ばれる）
function setupDrawCanvas() {
  if (!stage) return;

  if (!drawCanvas) {
    drawCanvas = document.createElement('canvas');
    drawCanvas.className = 'draw-canvas';
    drawCanvas.style.pointerEvents = drawMode ? 'auto' : 'none';
    stageInner.appendChild(drawCanvas);

    drawCtx = drawCanvas.getContext('2d');
    drawCtx.lineCap = 'round';
    drawCtx.lineJoin = 'round';

    drawCanvas.addEventListener('mousedown', onDrawMouseDown);
  }

  const { baseRect } = getStageTransform();
  drawCanvas.width = baseRect.width;
  drawCanvas.height = baseRect.height;

  redrawStrokes();
}

// ステージリサイズ時に再描画
function resizeAndRedrawDrawCanvas() {
  if (!drawCanvas || !drawCtx || mode !== 'raster') return;
  const { baseRect } = getStageTransform();
  drawCanvas.width = baseRect.width;
  drawCanvas.height = baseRect.height;
  redrawStrokes();
}

// ラスターデータの stroke レイヤーを画面に描き直す
function redrawStrokes() {
  if (!drawCanvas || !drawCtx) return;

  const page = slides[idx];
  const raster = page.raster;
  const layers = raster ? getRasterItems(raster) : [];
  const strokes = layers.filter(l => l.kind === 'stroke');

  const { baseRect: rect, baseScale: scale, baseOffsetX: offsetX, baseOffsetY: offsetY } = getStageTransform();
  const dpr = window.devicePixelRatio || 1;
  drawCanvas.width        = Math.round(rect.width  * dpr);
  drawCanvas.height       = Math.round(rect.height * dpr);
  drawCanvas.style.width  = rect.width  + 'px';
  drawCanvas.style.height = rect.height + 'px';
  drawCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  drawCtx.clearRect(0, 0, rect.width, rect.height);
  drawCtx.lineCap = 'round';
  drawCtx.lineJoin = 'round';

  strokes.forEach(stroke => {
    if (!stroke.points || stroke.points.length < 2) return;
    drawCtx.strokeStyle = stroke.color || getInkColor();
    drawCtx.lineWidth = (stroke.width || 4) * scale;
    drawCtx.beginPath();
    stroke.points.forEach((pt, i) => {
      const sx = offsetX + pt.x * scale;
      const sy = offsetY + pt.y * scale;
      if (i === 0) drawCtx.moveTo(sx, sy);
      else drawCtx.lineTo(sx, sy);
    });
    drawCtx.stroke();
  });
}

// 手書きキャンバスの mousedown ハンドラ
function onDrawMouseDown(e) {
  if (!drawMode || mode !== 'raster') return;
  e.preventDefault();

  const page = slides[idx];
  const raster = ensureRaster(page);
  const { lx, ly } = screenToLogical(e.clientX, e.clientY);

  pushUndoState();

  drawing = true;
  erasing = e.shiftKey;

  // Shift押下中は背景色で上書き（消しゴム風）
  const color = erasing ? '#d6d6d6' : currentColor;
  const strokeWidth = 4; // 論理座標上の太さ

  currentStroke = {
    kind: 'stroke',
    points: [{ x: lx, y: ly }],
    width: strokeWidth,
    color,
    locked: false
  };

  raster.layers.push(currentStroke);
  persist();
  redrawStrokes();
}
