// ==================================================
//  utils.js  共通ユーティリティ（Undo/Redo・正規化・選択・座標変換）
// ==================================================

// ===== Undo / Redo =====

function makeSnapshot() {
  return JSON.parse(JSON.stringify({ slides, idx, fontSize: Number(fontSize.value) }));
}

function pushUndoState() {
  if (isRestoring) return;
  const snap = makeSnapshot();
  undoStack.push(snap);
  if (undoStack.length > 100) undoStack.shift();
  redoStack = [];
}

function restoreFromSnapshot(snap) {
  isRestoring = true;
  slides = (snap.slides || []).map(normalizeSlide);
  idx    = Math.min(Math.max(0, snap.idx || 0), slides.length - 1);
  if (snap.fontSize) fontSize.value = snap.fontSize;
  clearSelectedObj();
  renderStage();
  isRestoring = false;
}

function undo() {
  if (!undoStack.length) return;
  const current = makeSnapshot();
  const snap    = undoStack.pop();
  redoStack.push(current);
  restoreFromSnapshot(snap);
}

function redo() {
  if (!redoStack.length) return;
  const current = makeSnapshot();
  const snap    = redoStack.pop();
  undoStack.push(current);
  restoreFromSnapshot(snap);
}

// ===== スライドデータ正規化 =====

function normalizeSlide(raw) {
  if (typeof raw === 'string') return { text: raw, raster: null };
  let r = raw && raw.raster ? raw.raster : null;
  if (r && !Array.isArray(r.layers)) {
    r.layers = [];
    if (Array.isArray(r.chars))   r.chars.forEach(c  => r.layers.push(Object.assign({ kind: 'char' },   c)));
    if (Array.isArray(r.images))  r.images.forEach(i => r.layers.push(Object.assign({ kind: 'image' },  i)));
    if (Array.isArray(r.shapes))  r.shapes.forEach(s => r.layers.push(Object.assign({ kind: 'shape' },  s)));
    if (Array.isArray(r.strokes)) r.strokes.forEach(s => r.layers.push(Object.assign({ kind: 'stroke' }, s)));
  }
  return {
    text:      raw && typeof raw.text      === 'string' ? raw.text      : '',
    raster:    r ? { fontSize: r.fontSize || 64, layers: r.layers || [] } : null,
    name:      raw && typeof raw.name      === 'string' ? raw.name      : '',
    essayText: raw && typeof raw.essayText === 'string' ? raw.essayText : ''
  };
}

function ensureRaster(page) {
  const fs = Number(fontSize.value) || 64;
  if (!page.raster) {
    page.raster = { fontSize: fs, layers: [] };
  } else {
    if (!Array.isArray(page.raster.layers)) page.raster.layers = [];
    if (!page.raster.fontSize) page.raster.fontSize = fs;
  }
  return page.raster;
}

function getRasterItems(raster) {
  return raster && Array.isArray(raster.layers) ? raster.layers : [];
}

// ===== 選択処理 =====

function updateSelectionStyles() {
  charObjects.forEach(o => {
    if (!o.el) return;
    if (selectedSet.includes(o)) o.el.classList.add('selected');
    else o.el.classList.remove('selected');
  });
}

function setSelectedObj(obj, append = false) {
  if (!append) {
    selectedObj = obj || null;
    selectedSet = obj ? [obj] : [];
  } else {
    if (!obj) return;
    const i = selectedSet.indexOf(obj);
    if (i >= 0) {
      selectedSet.splice(i, 1);
      if (selectedObj === obj) selectedObj = selectedSet[selectedSet.length - 1] || null;
    } else {
      selectedSet.push(obj);
      selectedObj = obj;
    }
  }
  updateSelectionStyles();
  updateLayerAndCodeUI();
}

function clearSelectedObj() {
  selectedObj = null;
  selectedSet = [];
  updateSelectionStyles();
  updateLayerAndCodeUI();
}

// ===== 座標変換 =====

// ステージの論理→画面変換情報を返す
// rect / scale / offsetX / offsetY   : ズーム込みの視覚値（マウスイベント変換用）
// baseRect / baseScale / baseOffsetX / baseOffsetY : ズームなしの基底値（スプライトCSS配置用）
function getStageTransform() {
  // ズーム込み（マウスイベント変換用）: stageInner の getBoundingClientRect
  const rect   = (stageInner || stage).getBoundingClientRect();
  const scaleX = rect.width  / LOGICAL_W;
  const scaleY = rect.height / LOGICAL_H;
  const scale  = Math.min(scaleX, scaleY);
  const offsetX = (rect.width  - LOGICAL_W * scale) / 2;
  const offsetY = (rect.height - LOGICAL_H * scale) / 2;

  // スプライトCSS配置用: stageInner の CSS レイアウトサイズ（transform 前）
  const innerEl = stageInner || stage;
  const baseW   = innerEl.offsetWidth;
  const baseH   = innerEl.offsetHeight;
  const baseScale   = Math.min(baseW / LOGICAL_W, baseH / LOGICAL_H);
  const baseOffsetX = (baseW - LOGICAL_W * baseScale) / 2;
  const baseOffsetY = (baseH - LOGICAL_H * baseScale) / 2;
  const baseRect    = { left: 0, top: 0, width: baseW, height: baseH };

  return { rect, scale, offsetX, offsetY, baseRect, baseScale, baseOffsetX, baseOffsetY };
}

// スクリーン座標 → 論理座標
function screenToLogical(clientX, clientY) {
  const { rect, scale, offsetX, offsetY } = getStageTransform();
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  return { lx: (sx - offsetX) / scale, ly: (sy - offsetY) / scale };
}
