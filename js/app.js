// ==================================================
//  app.js  （縦書き紙芝居エディタ + レイヤー + 手書きモード）
// ==================================================

const LS_KEY = 'kamishibai_pages_v8';

// 論理座標（レイアウトの基準となる仮想キャンバス）
const LOGICAL_W = 1080;
const LOGICAL_H = 720;

// サムネイルサイズ
const THUMB_W = 200;
const THUMB_H = 133;

// ===== DOM取得 =====
const editor = document.getElementById('editor');
const output = document.getElementById('output');
const fontSize = document.getElementById('fontSize');
const badge = document.getElementById('badge');
const counter = document.getElementById('counter');
const rail = document.getElementById('rail');
const stage = document.querySelector('.stage');

// ツールバー
const addOneBtn = document.getElementById('addOne');
const duplicateBtn = document.getElementById('duplicate');
const deleteBtn = document.getElementById('delete');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
const saveBtn = document.getElementById('save');
const loadBtn = document.getElementById('load');
const exportBtn = document.getElementById('export');
const importBtn = document.getElementById('import');
const importFile = document.getElementById('importFile');
const rasterizeBtn = document.getElementById('rasterize');
const backToTextBtn = document.getElementById('backToText');

// OBJECTツール
const shapeCircleFillBtn = document.getElementById('shapeCircleFill');
const shapeCircleRingBtn = document.getElementById('shapeCircleRing');
const shapeTriangleBtn = document.getElementById('shapeTriangle');
const shapeSquareBtn = document.getElementById('shapeSquare');
const shapeFullRectBtn = document.getElementById('shapeFullRect');
const toolTextBtn = document.getElementById('toolTextBtn');
const toolTextInput = document.getElementById('toolTextInput');

// カラー
const colorSwatches = document.querySelectorAll('.color-swatch');
const customColor = document.getElementById('customColor');

// SNAP
const snapCenterToggle = document.getElementById('snapCenterToggle');

// DRAW（手書き）
const drawModeToggle = document.getElementById('drawModeToggle');

// レイヤーパネル / コードパネル
const layerList = document.getElementById('layerList');
const canvasCode = document.getElementById('canvasCode');
const copyCodeBtn = document.getElementById('copyCode');

// 画像挿入
const imageFile = document.getElementById('imageFile');

// ===== データ構造 =====
// slides[i] = { text: string, raster: { fontSize:number, layers:[layer...] } | null }
// layer = {
//   kind:'char',   ch, logicX, logicY, baseSize, color, locked?
//   kind:'image',  src, logicX, logicY, baseW, baseH, locked?
//   kind:'shape',  type, logicX, logicY, baseW, baseH, text?, fontSize?, color?, locked?
//   kind:'stroke', points:[{x,y}...], width, color, locked?
// }

let slides = [{ text: '文字を視る', raster: null }];
let idx = 0;

let mode = 'text'; // 'text' | 'raster'
let stageSelected = false;

// ラスタライズ後のオブジェクトを管理
let charLayer = null;
let charObjects = []; // { el, data, kind }

// ドラッグ／リサイズ
let draggingObj = null;
let dragStartScreenX = 0;
let dragStartScreenY = 0;
let dragStartLogicX = 0;
let dragStartLogicY = 0;

let sizeEditMode = false;
let resizingObj = null;
let resizeStartScreenY = 0;
let resizeStartSize = 0;

// 選択状態
let selectedObj = null;
let selectedSet = [];

// レイヤー並べ替え
let currentLayerItems = [];
let dragLayerIndex = null;

// Undo / Redo
let undoStack = [];
let redoStack = [];
let isRestoring = false;

// 色
let currentColor = getInkColor();

// スナップ
let snapCenterEnabled = false;

// 画像挿入（ダブルクリック）
let pendingImagePos = null;

// 手書きモード用
let drawMode = false;      // 手書きモードON/OFF
let drawing = false;       // 線を描いている最中か
let erasing = false;       // Shift押下中（疑似消しゴム）
let currentStroke = null;  // 現在の1本の線レイヤー

let drawCanvas = null;     // ステージ上の手書きキャンバス
let drawCtx = null;


// ==================================================
// 共通ユーティリティ
// ==================================================

function getInkColor() {
  return (
    (getComputedStyle(document.body).getPropertyValue('--ink') || '#111111')
      .trim() || '#111111'
  );
}

function makeSnapshot() {
  return JSON.parse(
    JSON.stringify({
      slides,
      idx,
      fontSize: Number(fontSize.value)
    })
  );
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
  idx = Math.min(Math.max(0, snap.idx || 0), slides.length - 1);
  if (snap.fontSize) fontSize.value = snap.fontSize;

  clearSelectedObj();
  renderStage();

  isRestoring = false;
}

function undo() {
  if (!undoStack.length) return;
  const current = makeSnapshot();
  const snap = undoStack.pop();
  redoStack.push(current);
  restoreFromSnapshot(snap);
}

function redo() {
  if (!redoStack.length) return;
  const current = makeSnapshot();
  const snap = redoStack.pop();
  undoStack.push(current);
  restoreFromSnapshot(snap);
}

// ==================================================
// スライド / ラスタデータの正規化
// ==================================================

function normalizeSlide(raw) {
  if (typeof raw === 'string') {
    return { text: raw, raster: null };
  }
  let r = raw && raw.raster ? raw.raster : null;
  if (r) {
    if (!Array.isArray(r.layers)) {
      r.layers = [];
      if (Array.isArray(r.chars)) {
        r.chars.forEach(c => {
          r.layers.push(Object.assign({ kind: 'char' }, c));
        });
      }
      if (Array.isArray(r.images)) {
        r.images.forEach(img => {
          r.layers.push(Object.assign({ kind: 'image' }, img));
        });
      }
      if (Array.isArray(r.shapes)) {
        r.shapes.forEach(s => {
          r.layers.push(Object.assign({ kind: 'shape' }, s));
        });
      }
      if (Array.isArray(r.strokes)) {
        r.strokes.forEach(s => {
          r.layers.push(Object.assign({ kind: 'stroke' }, s));
        });
      }
    }
  }
  return {
    text: raw && typeof raw.text === 'string' ? raw.text : '',
    raster: r ? { fontSize: r.fontSize || 64, layers: r.layers || [] } : null
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


// ==================================================
// 選択処理
// ==================================================

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
      if (selectedObj === obj) {
        selectedObj = selectedSet[selectedSet.length - 1] || null;
      }
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


// ==================================================
// レイヤーパネル & コードパネル
// ==================================================

function updateLayerAndCodeUI() {
  const page = slides[idx];
  const raster = page.raster;
  const snapshot = {
    pageIndex: idx,
    text: page.text,
    raster: raster || null
  };
  canvasCode.value = JSON.stringify(snapshot, null, 2);

  layerList.innerHTML = '';
  currentLayerItems = [];

  const layers = raster ? getRasterItems(raster) : [];

  if (!layers.length) {
    const li = document.createElement('li');
    li.className = 'layer-item';
    li.textContent = 'ラスタライズされたオブジェクトはありません。';
    layerList.appendChild(li);
    return;
  }

  currentLayerItems = layers.slice();

  const n = layers.length;
  // 内部: 先頭が奥、末尾が手前
  // UI: 手前（末尾）を一番上に表示
  for (let uiIndex = 0; uiIndex < n; uiIndex++) {
    const layerIndex = n - 1 - uiIndex;
    const entry = layers[layerIndex];

    // 手書きストロークは今回はレイヤー UI には出さない（必要ならここで対応可能）
    if (entry.kind === 'stroke') continue;

    const li = document.createElement('li');
    li.className = 'layer-item';
    if (entry.locked) li.classList.add('locked');

    const isSelected = selectedSet.some(o => o.data === entry);
    if (isSelected) li.classList.add('selected');

    const header = document.createElement('div');
    header.className = 'layer-item-header';

    const type = document.createElement('span');
    type.className = 'layer-type';
    if (entry.kind === 'char') type.textContent = '文字';
    else if (entry.kind === 'image') type.textContent = '画像';
    else type.textContent = '図形';

    const label = document.createElement('span');
    label.className = 'layer-label';
    if (entry.kind === 'char') {
      label.textContent = `'${entry.ch}'`;
    } else if (entry.kind === 'image') {
      label.textContent = '画像';
    } else {
      const t = entry.type;
      if (t === 'circleFill') label.textContent = '● 丸(塗り)';
      else if (t === 'circleRing') label.textContent = '○ 丸(線)';
      else if (t === 'triangle') label.textContent = '▲ 三角';
      else if (t === 'square') label.textContent = '■ 正方形';
      else if (t === 'fullrect') label.textContent = '▭ 全面長方形';
      else if (t === 'textbox') label.textContent = `T: ${entry.text || ''}`;
      else label.textContent = '図形';
    }

    const lockBtn = document.createElement('button');
    lockBtn.className = 'layer-lock';
    lockBtn.type = 'button';
    lockBtn.textContent = 'Lock';

    const orderSpan = document.createElement('span');
    orderSpan.className = 'layer-order';
    const visibleOrder = uiIndex + 1; // UI上 #1 が最前面
    orderSpan.textContent = `#${visibleOrder}`;

    header.appendChild(type);
    header.appendChild(label);
    header.appendChild(lockBtn);
    header.appendChild(orderSpan);

    const coords = document.createElement('div');
    coords.className = 'layer-coords';

    const x = entry.logicX != null ? entry.logicX.toFixed(1) : '-';
    const y = entry.logicY != null ? entry.logicY.toFixed(1) : '-';

    if (entry.kind === 'char') {
      const size = entry.baseSize != null ? entry.baseSize.toFixed(1) : '-';
      coords.textContent = `X: ${x}, Y: ${y} / size: ${size}`;
    } else if (entry.kind === 'image' || entry.kind === 'shape') {
      const w = entry.baseW != null ? entry.baseW.toFixed(1) : '-';
      const h = entry.baseH != null ? entry.baseH.toFixed(1) : '-';
      coords.textContent = `X: ${x}, Y: ${y} / W: ${w}, H: ${h}`;
    } else {
      coords.textContent = `X: ${x}, Y: ${y}`;
    }

    li.appendChild(header);
    li.appendChild(coords);

    // DnD並べ替え
    li.draggable = true;
    li.dataset.layerIndex = layerIndex;
    li.addEventListener('dragstart', handleLayerDragStart);
    li.addEventListener('dragover', handleLayerDragOver);
    li.addEventListener('drop', handleLayerDrop);

    lockBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      pushUndoState();
      entry.locked = !entry.locked;
      persist();
      updateLayerAndCodeUI();
    });

    // 名前をクリックしても選択
    li.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const obj = charObjects.find(o => o.data === entry);
      if (obj) {
        setSelectedObj(obj, e.shiftKey);
      } else if (!e.shiftKey) {
        clearSelectedObj();
      }
    });

    layerList.appendChild(li);
  }

  if (!layerList.children.length) {
    const li = document.createElement('li');
    li.className = 'layer-item';
    li.textContent = '（文字・図形レイヤーはありません）';
    layerList.appendChild(li);
  }
}

function handleLayerDragStart(e) {
  dragLayerIndex = Number(e.currentTarget.dataset.layerIndex);
  e.dataTransfer.effectAllowed = 'move';
}

function handleLayerDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function handleLayerDrop(e) {
  e.preventDefault();
  const targetIndex = Number(e.currentTarget.dataset.layerIndex);
  if (dragLayerIndex == null || targetIndex === dragLayerIndex) return;

  pushUndoState();
  const items = currentLayerItems.slice();
  const moved = items.splice(dragLayerIndex, 1)[0];
  items.splice(targetIndex, 0, moved);
  dragLayerIndex = null;
  applyLayerReorder(items);
}

function applyLayerReorder(newItems) {
  const page = slides[idx];
  if (!page.raster) return;
  page.raster.layers = newItems.slice();
  persist();
  buildCharLayerFromRaster(page.raster);
  renderRail();
  updateLayerAndCodeUI();
}


// ==================================================
// ステージ描画
// ==================================================

function renderStage() {
  const page = slides[idx];
  output.textContent = page.text || '（空）';
  output.style.fontSize = Number(fontSize.value) + 'px';
  editor.value = page.text || '';
  badge.textContent = String(idx + 1).padStart(2, '0');
  counter.textContent = `ページ ${idx + 1} / ${slides.length}`;

  clearCharLayer();

  const raster = page.raster;
  const hasRaster = raster && getRasterItems(raster).length > 0;

  if (hasRaster) {
    buildCharLayerFromRaster(raster);
  } else {
    mode = 'text';
    output.style.visibility = 'visible';
  }

  renderRail();
  persist();
  updateLayerAndCodeUI();
}

// サムネイル用：図形描画（ステージと同等のスケールロジック）
function drawShapeOnCtx(ctx, shape, scale, offsetX, offsetY) {
  const baseColor = shape.color || getInkColor();

  const cx = offsetX + shape.logicX * scale;
  const cy = offsetY + shape.logicY * scale;
  const w = (shape.baseW || 0) * scale;
  const h = (shape.baseH || 0) * scale;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();

  if (shape.type === 'circleFill' || shape.type === 'circleRing') {
    const r = Math.min(w, h) / 2;
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    if (shape.type === 'circleFill') {
      ctx.fillStyle = baseColor;
      ctx.fill();
    } else {
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  } else if (shape.type === 'square') {
    const s = Math.min(w, h);
    ctx.rect(-s / 2, -s / 2, s, s);
    ctx.fillStyle = baseColor;
    ctx.fill();
  } else if (shape.type === 'triangle') {
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(w / 2, h / 2);
    ctx.lineTo(-w / 2, h / 2);
    ctx.closePath();
    ctx.fillStyle = baseColor;
    ctx.fill();
  } else if (shape.type === 'fullrect') {
    ctx.rect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = baseColor;
    ctx.fill();
  } else if (shape.type === 'textbox') {
    ctx.fillStyle = baseColor;
    const text = shape.text || '';
    const fs = (h || 40) * 0.6;
    ctx.font = `${fs}px "Noto Sans JP", system-ui, -apple-system, "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(text, -w / 2, -h / 2, w);
  }

  ctx.restore();
}

function renderRail() {
  rail.innerHTML = '';
  slides.forEach((page, i) => {
    const t = document.createElement('div');
    t.className = 'thumb' + (i === idx ? ' active' : '');

    const raster = page.raster;
    const layers = raster ? getRasterItems(raster) : [];

    if (layers.length > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = THUMB_W;
      canvas.height = THUMB_H;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#d6d6d6';
      ctx.fillRect(0, 0, THUMB_W, THUMB_H);

      const scaleX = THUMB_W / LOGICAL_W;
      const scaleY = THUMB_H / LOGICAL_H;
      const scale = Math.min(scaleX, scaleY);
      const offsetX = (THUMB_W - LOGICAL_W * scale) / 2;
      const offsetY = (THUMB_H - LOGICAL_H * scale) / 2;

      layers.forEach(layer => {
        if (layer.kind === 'char') {
          const x = offsetX + layer.logicX * scale;
          const y = offsetY + layer.logicY * scale;
          const size = layer.baseSize * scale;
          const col = layer.color || getInkColor();
          ctx.font = `${size}px "Noto Sans JP", system-ui, -apple-system, "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif`;
          ctx.fillStyle = col;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(layer.ch, x, y);
        } else if (layer.kind === 'image') {
          const image = new Image();
          image.src = layer.src;
          image.onload = () => {
            const cx = offsetX + layer.logicX * scale;
            const cy = offsetY + layer.logicY * scale;
            const w = (layer.baseW || 0) * scale;
            const h = (layer.baseH || 0) * scale;
            ctx.drawImage(image, cx - w / 2, cy - h / 2, w, h);
          };
        } else if (layer.kind === 'shape') {
          drawShapeOnCtx(ctx, layer, scale, offsetX, offsetY);
        } else if (layer.kind === 'stroke') {
          const pts = layer.points || [];
          if (pts.length > 1) {
            const widthPx = (layer.width || 4) * scale;
            ctx.strokeStyle = layer.color || getInkColor();
            ctx.lineWidth = widthPx;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            pts.forEach((pt, idx) => {
              const sx = offsetX + pt.x * scale;
              const sy = offsetY + pt.y * scale;
              if (idx === 0) ctx.moveTo(sx, sy);
              else ctx.lineTo(sx, sy);
            });
            ctx.stroke();
          }
        }
      });

      t.appendChild(canvas);
    } else {
      const tt = document.createElement('div');
      tt.className = 'ttext';
      tt.textContent = page.text || '（空）';
      t.appendChild(tt);
    }

    const id = document.createElement('div');
    id.className = 'idx';
    id.textContent = String(i + 1).padStart(2, '0');
    t.appendChild(id);

    t.addEventListener('click', () => {
      commitInline();
      idx = i;
      stageSelected = false;
      clearSelectedObj();
      renderStage();
    });

    rail.appendChild(t);
  });
}


// ==================================================
// ページ操作
// ==================================================

function addOne() {
  commitInline();
  pushUndoState();
  slides.splice(idx + 1, 0, { text: '', raster: null });
  idx = Math.min(idx + 1, slides.length - 1);
  clearSelectedObj();
  renderStage();
}

function duplicate() {
  commitInline();
  pushUndoState();
  const base = slides[idx];
  const copy = {
    text: base.text,
    raster: base.raster ? JSON.parse(JSON.stringify(base.raster)) : null
  };
  slides.splice(idx + 1, 0, copy);
  idx++;
  clearSelectedObj();
  renderStage();
}

function remove() {
  commitInline();
  pushUndoState();
  if (slides.length === 1) {
    slides[0] = { text: '', raster: null };
    idx = 0;
    clearSelectedObj();
    renderStage();
    return;
  }
  slides.splice(idx, 1);
  idx = Math.max(0, Math.min(idx, slides.length - 1));
  clearSelectedObj();
  renderStage();
}

function next() {
  commitInline();
  idx = Math.min(slides.length - 1, idx + 1);
  stageSelected = false;
  clearSelectedObj();
  renderStage();
}

function prev() {
  commitInline();
  idx = Math.max(0, idx - 1);
  stageSelected = false;
  clearSelectedObj();
  renderStage();
}


// ==================================================
// 保存 / 読み込み
// ==================================================

function persist() {
  localStorage.setItem(
    LS_KEY,
    JSON.stringify({ slides, idx, fontSize: Number(fontSize.value) })
  );
}

function load() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return false;
  try {
    const st = JSON.parse(raw);
    if (Array.isArray(st.slides)) {
      slides = st.slides.map(normalizeSlide);
    } else if (Array.isArray(st)) {
      slides = st.map(normalizeSlide);
    } else {
      slides = [{ text: '', raster: null }];
    }
    idx = Math.min(Math.max(0, st.idx || 0), slides.length - 1);
    if (st.fontSize) fontSize.value = st.fontSize;
    clearSelectedObj();
    renderStage();
    return true;
  } catch (e) {
    console.warn(e);
    return false;
  }
}


// ==================================================
// テキスト編集
// ==================================================

function placeCaretAtEnd(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function startInlineEdit() {
  output.contentEditable = true;
  output.classList.add('editing');
  placeCaretAtEnd(output);
}

function commitInline() {
  if (!output.isContentEditable) return;
  pushUndoState();
  const txt = output.innerText.trim();
  slides[idx].text = txt;
  slides[idx].raster = null;
  editor.value = txt;
  output.contentEditable = false;
  output.classList.remove('editing');
  clearSelectedObj();
  renderRail();
  persist();
  updateLayerAndCodeUI();
}

output.addEventListener('blur', commitInline);
output.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    commitInline();
  }
});

stage.addEventListener('click', e => {
  if (e.target === stage) {
    clearSelectedObj();
  }
  stageSelected = true;
});


// ==================================================
// ラスタライズレイヤー（テキスト→オブジェクト）
// ==================================================

function clearCharLayer() {
  if (charLayer) {
    charLayer.remove();
    charLayer = null;
  }
  charObjects = [];
  draggingObj = null;
  resizingObj = null;
  clearSelectedObj();

  // 手書きキャンバスは残す（modeがtextなら後でhide）
}

function exitRasterMode() {
  mode = 'text';
  clearCharLayer();
  output.style.visibility = 'visible';

  // 手書きキャンバスも見えなくする
  if (drawCanvas && drawCtx) {
    drawCanvas.style.pointerEvents = 'none';
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  }
  updateLayerAndCodeUI();
}

// ステージの論理→画面変換情報
function getStageTransform() {
  const rect = stage.getBoundingClientRect();
  const scaleX = rect.width / LOGICAL_W;
  const scaleY = rect.height / LOGICAL_H;
  const scale = Math.min(scaleX, scaleY);
  const offsetX = (rect.width - LOGICAL_W * scale) / 2;
  const offsetY = (rect.height - LOGICAL_H * scale) / 2;
  return { rect, scale, offsetX, offsetY };
}

function updateSpritePositions() {
  if (mode !== 'raster' || !charLayer || charObjects.length === 0) return;

  const { scale, offsetX, offsetY } = getStageTransform();

  charObjects.forEach(obj => {
    const d = obj.data;
    if (!d) return;

    const cx = offsetX + d.logicX * scale;
    const cy = offsetY + d.logicY * scale;

    obj.el.style.left = `${cx}px`;
    obj.el.style.top = `${cy}px`;

    if (obj.kind === 'char') {
      const w = d.baseSize * scale;
      const h = d.baseSize * scale;
      obj.el.style.width = `${w}px`;
      obj.el.style.height = `${h}px`;
    } else if (obj.kind === 'image' || obj.kind === 'shape') {
      const w = (d.baseW || 0) * scale;
      const h = (d.baseH || 0) * scale;
      obj.el.style.width = `${w}px`;
      obj.el.style.height = `${h}px`;
    }
  });
}

// 高解像度文字画像
function createCharImage(data) {
  const SCALE = 3;
  const dpr = (window.devicePixelRatio || 1) * SCALE;

  const size = data.baseSize;
  const canvas = document.createElement('canvas');

  canvas.width = size * dpr;
  canvas.height = size * dpr;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, size, size);

  const col = data.color || getInkColor();
  ctx.fillStyle = col;
  ctx.font = `${size}px "Noto Sans JP", system-ui, -apple-system, "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(data.ch, size / 2, size / 2);

  const img = new Image();
  img.src = canvas.toDataURL('image/png');
  img.className = 'char-sprite';

  img.style.width = size + 'px';
  img.style.height = size + 'px';

  return img;
}

// 高解像度図形画像（ステージ表示用）
function createShapeImage(shape) {
  const SCALE = 3;
  const dpr = (window.devicePixelRatio || 1) * SCALE;

  const w = shape.baseW || 200;
  const h = shape.baseH || 200;

  const canvas = document.createElement('canvas');
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const col = shape.color || getInkColor();

  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();

  if (shape.type === 'circleFill' || shape.type === 'circleRing') {
    const r = Math.min(w, h) / 2;
    ctx.translate(w / 2, h / 2);
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    if (shape.type === 'circleFill') {
      ctx.fillStyle = col;
      ctx.fill();
    } else {
      ctx.strokeStyle = col;
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  } else if (shape.type === 'square') {
    const s = Math.min(w, h);
    ctx.rect((w - s) / 2, (h - s) / 2, s, s);
    ctx.fillStyle = col;
    ctx.fill();
  } else if (shape.type === 'triangle') {
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
  } else if (shape.type === 'fullrect') {
    ctx.rect(0, 0, w, h);
    ctx.fillStyle = col;
    ctx.fill();
  } else if (shape.type === 'textbox') {
    const text = shape.text || '';
    const fs = (h || 40) * 0.6;
    ctx.fillStyle = col;
    ctx.font = `${fs}px "Noto Sans JP", system-ui, -apple-system, "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(text, 0, 0, w);
  }

  const img = new Image();
  img.src = canvas.toDataURL('image/png');
  img.className = 'char-sprite';
  img.style.width = `${w}px`;
  img.style.height = `${h}px`;
  return img;
}

function addSpriteEventHandlers(img, obj) {
  img.addEventListener('mousedown', e => {
    if (mode !== 'raster') return;
    e.stopPropagation();
    e.preventDefault();
    stageSelected = true;

    if (obj.data && obj.data.locked) {
      setSelectedObj(obj, e.shiftKey);
      return;
    }

    // 操作開始時にUndoスナップ
    pushUndoState();

    // 複数選択（Shift）
    setSelectedObj(obj, e.shiftKey);

    if (sizeEditMode) {
      resizingObj = obj;
      resizeStartScreenY = e.clientY;
      if (obj.kind === 'char') {
        resizeStartSize = obj.data.baseSize;
      } else {
        resizeStartSize = obj.data.baseW || 100;
      }
    } else {
      draggingObj = obj;
      dragStartScreenX = e.clientX;
      dragStartScreenY = e.clientY;
      dragStartLogicX = obj.data.logicX;
      dragStartLogicY = obj.data.logicY;
    }
  });
}

function buildCharLayerFromRaster(raster) {
  clearCharLayer();

  const layerEl = document.createElement('div');
  layerEl.className = 'char-layer';

  const layers = getRasterItems(raster);

  layers.forEach(layer => {
    if (layer.kind === 'stroke') return; // ストロークはdrawCanvasに描画
    let img;
    if (layer.kind === 'char') {
      img = createCharImage(layer);
    } else if (layer.kind === 'image') {
      img = new Image();
      img.src = layer.src;
      img.className = 'char-sprite';
      img.style.width = (layer.baseW || 200) + 'px';
      img.style.height = (layer.baseH || 200) + 'px';
    } else if (layer.kind === 'shape') {
      img = createShapeImage(layer);
    }
    if (!img) return;

    const obj = { el: img, data: layer, kind: layer.kind };
    charObjects.push(obj);
    img._charObj = obj;
    addSpriteEventHandlers(img, obj);
    layerEl.appendChild(img);
  });

  stage.appendChild(layerEl);
  charLayer = layerEl;
  mode = 'raster';
  output.style.visibility = 'hidden';
  updateSpritePositions();

  // 手書きキャンバスもセットアップ
  setupDrawCanvas();

  updateLayerAndCodeUI();
}

function enterRasterMode() {
  if (mode === 'raster' && slides[idx].raster && getRasterItems(slides[idx].raster).length) {
    return;
  }

  commitInline();
  const page = slides[idx];
  const text = page.text || '';
  const fs = Number(fontSize.value) || 64;

  if (page.raster && getRasterItems(page.raster).length) {
    ensureRaster(page);
    buildCharLayerFromRaster(page.raster);
    renderRail();
    return;
  }

  if (!text) {
    ensureRaster(page);
    buildCharLayerFromRaster(page.raster);
    renderRail();
    return;
  }

  pushUndoState();

  const charH = fs * 1.2;
  const charW = fs * 1.1;

  const usableHeight = LOGICAL_H * 0.8;
  const topBase = (LOGICAL_H - usableHeight) / 2;
  const maxRows = Math.max(1, Math.floor(usableHeight / charH));

  const charsInfo = [];
  let col = 0;
  let row = 0;

  for (const rawCh of text) {
    const ch = rawCh;
    if (ch === '\n') {
      col++; row = 0; continue;
    }
    charsInfo.push({ ch, col, row });
    row++;
    if (row >= maxRows) {
      row = 0;
      col++;
    }
  }

  const raster = ensureRaster(page);

  const totalCols = charsInfo.length ? (charsInfo[charsInfo.length - 1].col + 1) : 1;
  const totalWidth = totalCols * charW;
  const leftBase = (LOGICAL_W - totalWidth) / 2;

  const layers = charsInfo.map(info => ({
    kind: 'char',
    ch: info.ch,
    logicX: leftBase + info.col * charW + charW / 2,
    logicY: topBase + info.row * charH + charH / 2,
    baseSize: fs,
    color: currentColor,
    locked: false
  }));

  raster.fontSize = fs;
  raster.layers = layers;

  persist();
  buildCharLayerFromRaster(page.raster);
  renderRail();
}


// ==================================================
// 画像挿入（ダブルクリック）
// ==================================================

function insertImageAt(logicX, logicY, dataUrl) {
  pushUndoState();

  const page = slides[idx];
  const raster = ensureRaster(page);

  const tmpImg = new Image();
  tmpImg.onload = () => {
    const nw = tmpImg.naturalWidth || 200;
    const nh = tmpImg.naturalHeight || 200;

    const maxSize = 280;
    const scale = Math.min(maxSize / nw, maxSize / nh, 1);
    const baseW = nw * scale;
    const baseH = nh * scale;

    const layer = {
      kind: 'image',
      src: dataUrl,
      logicX,
      logicY,
      baseW,
      baseH,
      locked: false
    };
    raster.layers.push(layer);
    persist();

    if (mode === 'raster' && charLayer) {
      const img = new Image();
      img.src = layer.src;
      img.className = 'char-sprite';
      img.style.width = `${layer.baseW}px`;
      img.style.height = `${layer.baseH}px`;
      const obj = { el: img, data: layer, kind: 'image' };
      charObjects.push(obj);
      img._charObj = obj;
      addSpriteEventHandlers(img, obj);
      charLayer.appendChild(img);
      updateSpritePositions();
    }

    renderRail();
    updateLayerAndCodeUI();
  };
  tmpImg.src = dataUrl;
}


// ==================================================
// 図形 & テキストオブジェクト追加
// ==================================================

function addShape(type) {
  pushUndoState();

  const page = slides[idx];
  const raster = ensureRaster(page);

  let baseW = 220;
  let baseH = 220;
  let logicX;
  let logicY;

  if (type === 'fullrect') {
    baseW = LOGICAL_W;
    baseH = LOGICAL_H;
    logicX = LOGICAL_W / 2;
    logicY = LOGICAL_H / 2;
  } else {
    logicX = LOGICAL_W / 2;
    logicY = LOGICAL_H / 2;
  }

  const layer = {
    kind: 'shape',
    type,
    logicX,
    logicY,
    baseW,
    baseH,
    color: currentColor,
    locked: false
  };

  raster.layers.push(layer);
  persist();
  buildCharLayerFromRaster(raster);
  renderRail();
  updateLayerAndCodeUI();
}

function addTextboxFromTool() {
  pushUndoState();

  let text = toolTextInput.value.trim();
  if (!text) text = 'テキスト';

  const page = slides[idx];
  const raster = ensureRaster(page);

  const fs = 48;
  const baseH = fs * 1.6;
  const baseW = fs * text.length * 0.8 + 40;

  const logicX = LOGICAL_W / 2;
  const logicY = LOGICAL_H / 2;

  const layer = {
    kind: 'shape',
    type: 'textbox',
    text,
    fontSize: fs,
    logicX,
    logicY,
    baseW,
    baseH,
    color: currentColor,
    locked: false
  };

  raster.layers.push(layer);
  persist();
  buildCharLayerFromRaster(raster);
  renderRail();
  updateLayerAndCodeUI();
}

// 選択中の textbox を一文字ずつ char にバラす
function rasterizeSelectedTextbox() {
  const tbObj = selectedSet.length === 1 ? selectedSet[0] : null;
  if (!tbObj || tbObj.kind !== 'shape' || tbObj.data.type !== 'textbox') return false;
  if (tbObj.data.locked) return false;

  pushUndoState();

  const page = slides[idx];
  const raster = ensureRaster(page);
  const layers = raster.layers;
  const tb = tbObj.data;
  const text = (tb.text || '').trim();
  if (!text) return false;

  const fs = tb.fontSize || 48;
  const charW = fs * 0.7;
  const centerY = tb.logicY;
  let x = tb.logicX - (charW * text.length) / 2;
  const col = tb.color || currentColor;

  const tbIndex = layers.indexOf(tb);
  if (tbIndex < 0) return false;

  const newChars = [];
  for (const ch of text) {
    newChars.push({
      kind: 'char',
      ch,
      logicX: x + charW / 2,
      logicY: centerY,
      baseSize: fs,
      color: col,
      locked: false
    });
    x += charW;
  }

  layers.splice(tbIndex, 1, ...newChars);
  persist();
  buildCharLayerFromRaster(raster);
  renderRail();
  clearSelectedObj();
  return true;
}


// ==================================================
// 色変更
// ==================================================

function applyColorToSelected(color) {
  if (!selectedSet.length) return;
  pushUndoState();

  selectedSet.forEach(obj => {
    if (obj.data && obj.data.locked) return;

    if (obj.kind === 'char') {
      obj.data.color = color;
      const oldEl = obj.el;
      const newImg = createCharImage(obj.data);
      obj.el = newImg;
      newImg._charObj = obj;
      addSpriteEventHandlers(newImg, obj);
      oldEl.replaceWith(newImg);
    } else if (obj.kind === 'shape') {
      obj.data.color = color;
      const oldEl = obj.el;
      const newImg = createShapeImage(obj.data);
      obj.el = newImg;
      newImg._charObj = obj;
      addSpriteEventHandlers(newImg, obj);
      oldEl.replaceWith(newImg);
    }
  });

  updateSpritePositions();
  persist();
  renderRail();
  updateLayerAndCodeUI();
}

function setCurrentColor(color) {
  currentColor = color;
  colorSwatches.forEach(btn => {
    if (
      btn.dataset.color &&
      btn.dataset.color.toLowerCase() === color.toLowerCase()
    ) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  customColor.value = color;

  if (selectedSet.length) {
    applyColorToSelected(color);
  }
}


// ==================================================
// スナップ処理（中央 ＋ オブジェクト同士）
// ==================================================

function snapSelectedToCenter() {
  if (!snapCenterEnabled) return;
  if (!selectedSet.length) return;
  if (mode !== 'raster') return;

  const centerX = LOGICAL_W / 2;
  const centerY = LOGICAL_H / 2;

  const SNAP_RADIUS_CENTER = 40;
  const SNAP_RADIUS_AXIS = 30;

  let snapped = false;

  // 中央スナップ
  selectedSet.forEach(obj => {
    const d = obj.data;
    if (!d || d.locked) return;

    const dx = d.logicX - centerX;
    const dy = d.logicY - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= SNAP_RADIUS_CENTER) {
      d.logicX = centerX;
      d.logicY = centerY;
      snapped = true;
    }
  });

  // オブジェクト同士
  selectedSet.forEach(obj => {
    const d = obj.data;
    if (!d || d.locked) return;

    charObjects.forEach(other => {
      if (other === obj) return;
      const od = other.data;
      if (!od || od.locked) return;
      if (selectedSet.includes(other)) return;

      const dx = d.logicX - od.logicX;
      const dy = d.logicY - od.logicY;

      if (Math.abs(dx) <= SNAP_RADIUS_AXIS) {
        d.logicX = od.logicX;
        snapped = true;
      }
      if (Math.abs(dy) <= SNAP_RADIUS_AXIS) {
        d.logicY = od.logicY;
        snapped = true;
      }
    });
  });

  if (snapped) {
    updateSpritePositions();
  }
}


// ==================================================
// 手書きモード（DRAW）
// ==================================================

// ステージ上のロジカル座標へ変換
function screenToLogical(clientX, clientY) {
  const { rect, scale, offsetX, offsetY } = getStageTransform();
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  const lx = (sx - offsetX) / scale;
  const ly = (sy - offsetY) / scale;
  return { lx, ly };
}

// 手書き用キャンバスの準備
function setupDrawCanvas() {
  if (!stage) return;

  if (!drawCanvas) {
    drawCanvas = document.createElement('canvas');
    drawCanvas.className = 'draw-canvas';
    drawCanvas.style.pointerEvents = drawMode ? 'auto' : 'none';
    stage.appendChild(drawCanvas);

    drawCtx = drawCanvas.getContext('2d');
    drawCtx.lineCap = 'round';
    drawCtx.lineJoin = 'round';

    drawCanvas.addEventListener('mousedown', onDrawMouseDown);
  }

  const { rect } = getStageTransform();
  drawCanvas.width = rect.width;
  drawCanvas.height = rect.height;

  redrawStrokes();
}

// ステージリサイズ時などに再描画
function resizeAndRedrawDrawCanvas() {
  if (!drawCanvas || !drawCtx || mode !== 'raster') return;
  const { rect } = getStageTransform();
  drawCanvas.width = rect.width;
  drawCanvas.height = rect.height;
  redrawStrokes();
}

// ラスターデータにある stroke を画面に描き直す
function redrawStrokes() {
  if (!drawCanvas || !drawCtx) return;

  const page = slides[idx];
  const raster = page.raster;
  const layers = raster ? getRasterItems(raster) : [];

  const strokes = layers.filter(l => l.kind === 'stroke');

  const { rect, scale, offsetX, offsetY } = getStageTransform();
  drawCanvas.width = rect.width;
  drawCanvas.height = rect.height;

  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  drawCtx.lineCap = 'round';
  drawCtx.lineJoin = 'round';

  strokes.forEach(stroke => {
    if (!stroke.points || stroke.points.length < 2) return;

    const widthPx = (stroke.width || 4) * scale;
    drawCtx.strokeStyle = stroke.color || getInkColor();
    drawCtx.lineWidth = widthPx;

    drawCtx.beginPath();
    stroke.points.forEach((pt, idx) => {
      const sx = offsetX + pt.x * scale;
      const sy = offsetY + pt.y * scale;
      if (idx === 0) drawCtx.moveTo(sx, sy);
      else drawCtx.lineTo(sx, sy);
    });
    drawCtx.stroke();
  });
}

function onDrawMouseDown(e) {
  if (!drawMode || mode !== 'raster') return;
  e.preventDefault();

  const page = slides[idx];
  const raster = ensureRaster(page);

  const { lx, ly } = screenToLogical(e.clientX, e.clientY);

  pushUndoState();

  drawing = true;
  erasing = e.shiftKey;

  // 消しゴムっぽく見せるため背景色で上塗り
  const bgColor = '#d6d6d6'; // ステージ背景色に合わせる
  const color = erasing ? bgColor : currentColor;
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


// ==================================================
// マウス操作（移動 / サイズ変更 / 手書き）
// ==================================================

document.addEventListener('mousemove', e => {
  // 手書き中
  if (drawing && drawMode && mode === 'raster' && drawCanvas && drawCtx) {
    const { lx, ly } = screenToLogical(e.clientX, e.clientY);

    if (currentStroke) {
      const pts = currentStroke.points;
      const last = pts[pts.length - 1];
      const dx = lx - last.x;
      const dy = ly - last.y;
      const dist2 = dx * dx + dy * dy;

      if (dist2 > 0.5 * 0.5) {
        pts.push({ x: lx, y: ly });
        redrawStrokes();
      }
    }
    return; // 他のドラッグ処理はしない
  }

  // サイズ変更
  if (resizingObj && mode === 'raster') {
    const dy = e.clientY - resizeStartScreenY;
    const factor = 1 - dy / 200;
    let newSize = resizeStartSize * factor;
    newSize = Math.max(16, Math.min(800, newSize));

    if (resizingObj.kind === 'char') {
      resizingObj.data.baseSize = newSize;
      const oldEl = resizingObj.el;
      const newImg = createCharImage(resizingObj.data);
      resizingObj.el = newImg;
      newImg._charObj = resizingObj;
      addSpriteEventHandlers(newImg, resizingObj);
      oldEl.replaceWith(newImg);
    } else if (resizingObj.kind === 'image' || resizingObj.kind === 'shape') {
      const d = resizingObj.data;
      const ratio = (d.baseH || 200) / (d.baseW || 200);
      d.baseW = newSize;
      d.baseH = newSize * ratio;
      const oldEl = resizingObj.el;
      if (resizingObj.kind === 'image') {
        resizingObj.el.style.width = `${d.baseW}px`;
        resizingObj.el.style.height = `${d.baseH}px`;
      } else {
        const newImg = createShapeImage(d);
        resizingObj.el = newImg;
        newImg._charObj = resizingObj;
        addSpriteEventHandlers(newImg, resizingObj);
        oldEl.replaceWith(newImg);
      }
    }

    updateSpritePositions();
    renderRail();
    updateLayerAndCodeUI();
    return;
  }

  // オブジェクト移動
  if (!draggingObj || mode !== 'raster') return;
  const { rect } = getStageTransform();
  const scaleX = rect.width / LOGICAL_W;
  const scaleY = rect.height / LOGICAL_H;

  const dxScreen = e.clientX - dragStartScreenX;
  const dyScreen = e.clientY - dragStartScreenY;

  const dxLogic = dxScreen / scaleX;
  const dyLogic = dyScreen / scaleY;

  draggingObj.data.logicX = dragStartLogicX + dxLogic;
  draggingObj.data.logicY = dragStartLogicY + dyLogic;

  updateSpritePositions();
});

document.addEventListener('mouseup', () => {
  // 手書き終了
  if (drawing && drawMode) {
    drawing = false;
    currentStroke = null;
    persist();
    renderRail();
    updateLayerAndCodeUI();
  }

  // 移動 / リサイズ終了
  if (draggingObj || resizingObj) {
    if (snapCenterEnabled && mode === 'raster' && selectedSet.length) {
      snapSelectedToCenter();
    }
    draggingObj = null;
    resizingObj = null;
    persist();
    renderRail();
    updateLayerAndCodeUI();
  }
});


// ==================================================
// ダブルクリックで画像挿入
// ==================================================

stage.addEventListener('dblclick', e => {
  if (e.target !== stage) return;
  if (mode !== 'raster') enterRasterMode();

  const { rect } = getStageTransform();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const { scale, offsetX, offsetY } = getStageTransform();
  const lx = (x - offsetX) / scale;
  const ly = (y - offsetY) / scale;

  pendingImagePos = { logicX: lx, logicY: ly };
  imageFile.value = '';
  imageFile.click();
});

imageFile.addEventListener('change', e => {
  const file = e.target.files && e.target.files[0];
  if (!file || !pendingImagePos) return;

  const { logicX, logicY } = pendingImagePos;
  pendingImagePos = null;

  const reader = new FileReader();
  reader.onload = ev => {
    const dataUrl = ev.target.result;
    insertImageAt(logicX, logicY, dataUrl);
  };
  reader.readAsDataURL(file);
});


// ==================================================
// コードのコピー / JSON書き出し / 読み込み
// ==================================================

copyCodeBtn.addEventListener('click', () => {
  const text = canvasCode.value || '';
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      copyCodeBtn.textContent = 'コピーしました';
      setTimeout(() => {
        copyCodeBtn.textContent = 'コードをコピー';
      }, 1200);
    }).catch(() => {
      canvasCode.select();
      document.execCommand('copy');
    });
  } else {
    canvasCode.select();
    document.execCommand('copy');
  }
});

exportBtn.addEventListener('click', () => {
  const blob = new Blob(
    [JSON.stringify({ slides, idx, fontSize: Number(fontSize.value) }, null, 2)],
    { type: 'application/json' }
  );
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'kamishibai.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

importBtn.addEventListener('click', () => importFile.click());

importFile.addEventListener('change', async e => {
  const f = e.target.files?.[0];
  if (!f) return;
  const txt = await f.text();
  try {
    const st = JSON.parse(txt);
    pushUndoState();
    if (Array.isArray(st.slides)) {
      slides = st.slides.map(normalizeSlide);
      idx = Math.min(Math.max(0, st.idx || 0), slides.length - 1);
      if (st.fontSize) fontSize.value = st.fontSize;
    } else if (Array.isArray(st)) {
      slides = st.map(normalizeSlide);
      idx = 0;
    } else {
      slides = [{ text: '', raster: null }];
      idx = 0;
    }
    clearSelectedObj();
    renderStage();
  } catch (err) {
    alert('JSONの読み込みに失敗しました');
  }
});


// ==================================================
// ボタンイベント
// ==================================================

addOneBtn.addEventListener('click', addOne);
duplicateBtn.addEventListener('click', duplicate);
deleteBtn.addEventListener('click', remove);
prevBtn.addEventListener('click', prev);
nextBtn.addEventListener('click', next);
saveBtn.addEventListener('click', persist);
loadBtn.addEventListener('click', () => {
  if (!load()) alert('保存データが見つかりません');
});

rasterizeBtn.addEventListener('click', () => {
  if (!rasterizeSelectedTextbox()) {
    enterRasterMode();
  }
});

backToTextBtn.addEventListener('click', () => exitRasterMode());

fontSize.addEventListener('input', () => {
  pushUndoState();
  output.style.fontSize = Number(fontSize.value) + 'px';
  slides[idx].raster = null;
  clearSelectedObj();
  persist();
  renderRail();
  updateLayerAndCodeUI();
});

editor.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    addOne();
    e.preventDefault();
  }
});

// 図形ツール
shapeCircleFillBtn.addEventListener('click', () => {
  enterRasterMode();
  addShape('circleFill');
});
shapeCircleRingBtn.addEventListener('click', () => {
  enterRasterMode();
  addShape('circleRing');
});
shapeTriangleBtn.addEventListener('click', () => {
  enterRasterMode();
  addShape('triangle');
});
shapeSquareBtn.addEventListener('click', () => {
  enterRasterMode();
  addShape('square');
});
shapeFullRectBtn.addEventListener('click', () => {
  enterRasterMode();
  addShape('fullrect');
});

// テキストツール
toolTextBtn.addEventListener('click', () => {
  enterRasterMode();
  addTextboxFromTool();
});

// カラー
colorSwatches.forEach(btn => {
  btn.addEventListener('click', () => {
    setCurrentColor(btn.dataset.color);
  });
});

customColor.addEventListener('input', e => {
  setCurrentColor(e.target.value);
});

// SNAP
snapCenterToggle.addEventListener('change', (e) => {
  snapCenterEnabled = e.target.checked;
});

// DRAW （手書きモード）
drawModeToggle.addEventListener('change', (e) => {
  drawMode = e.target.checked;

  if (!drawCanvas && drawMode) {
    setupDrawCanvas();
  }
  if (drawCanvas) {
    drawCanvas.style.pointerEvents = drawMode ? 'auto' : 'none';
  }

  if (!drawMode) {
    drawing = false;
    currentStroke = null;
  }
});


// ==================================================
// キーボードショートカット
// ==================================================

window.addEventListener('keydown', e => {
  const tag = (document.activeElement?.tagName || '').toLowerCase();
  const isEditable = document.activeElement?.isContentEditable;
  const isInput = tag === 'input' || tag === 'textarea';

  // Undo / Redo
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault();
    if (e.shiftKey) {
      redo();
    } else {
      undo();
    }
    return;
  }

  // S: サイズ編集モード切り替え
  if ((e.key === 's' || e.key === 'S') && !isInput && !isEditable && document.activeElement !== toolTextInput) {
    e.preventDefault();
    sizeEditMode = !sizeEditMode;
    document.body.classList.toggle('size-edit-mode', sizeEditMode);
    draggingObj = null;
    resizingObj = null;
    return;
  }

  // Enter: キャンバスクリック後 → テキスト編集
  if (e.key === 'Enter' && stageSelected && !output.isContentEditable && !isInput && !isEditable) {
    e.preventDefault();
    if (mode === 'raster') {
      exitRasterMode();
    }
    startInlineEdit();
    return;
  }

  // Delete / Backspace: オブジェクト削除 or ページ削除
  if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditable && !isInput) {
    e.preventDefault();
    if (selectedSet.length && mode === 'raster') {
      pushUndoState();
      const page = slides[idx];
      const r = page.raster;
      if (r && Array.isArray(r.layers)) {
        const toDelete = new Set(
          selectedSet
            .filter(o => !o.data.locked)
            .map(o => o.data)
        );
        r.layers = r.layers.filter(layer => !toDelete.has(layer));
      }
      selectedSet.forEach(obj => {
        if (obj.data.locked) return;
        if (obj.el && obj.el.parentNode) {
          obj.el.parentNode.removeChild(obj.el);
        }
      });
      charObjects = charObjects.filter(o => !selectedSet.includes(o) || o.data.locked);
      clearSelectedObj();
      persist();
      renderRail();
      updateLayerAndCodeUI();
    } else {
      remove();
    }
    return;
  }

  if (isInput || isEditable) return;

  if (e.key === 'ArrowRight' || e.key === 'PageDown') next();
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') prev();

  if (e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    toggleFullscreen();
  }
});


// ==================================================
// フルスクリーン
// ==================================================

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    if (stage && stage.requestFullscreen) {
      stage.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }
}

window.addEventListener('resize', () => {
  updateSpritePositions();
  resizeAndRedrawDrawCanvas();
});
document.addEventListener('fullscreenchange', () => {
  updateSpritePositions();
  resizeAndRedrawDrawCanvas();
});
document.addEventListener('webkitfullscreenchange', () => {
  updateSpritePositions();
  resizeAndRedrawDrawCanvas();
});


// ==================================================
// パネルをドラッグ可能にする
// ==================================================

function makePanelDraggable(panel) {
  if (!panel) return;
  const handle = panel.querySelector('.panel-drag-handle');
  if (!handle) return;

  let offsetX = 0;
  let offsetY = 0;
  let dragging = false;

  handle.addEventListener('mousedown', (e) => {
    dragging = true;
    const rect = panel.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    handle.style.cursor = 'grabbing';

    // bottom固定があると縦に伸びるので解除
    panel.style.bottom = 'auto';

    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    panel.style.left = `${e.clientX - offsetX}px`;
    panel.style.top = `${e.clientY - offsetY}px`;
  });

  document.addEventListener('mouseup', () => {
    dragging = false;
    handle.style.cursor = 'grab';
  });
}


// ==================================================
// 初期化
// ==================================================

if (!load()) {
  renderStage();
}

// パネルをドラッグ可能に
makePanelDraggable(document.getElementById('objectPanel'));
makePanelDraggable(document.getElementById('panelLayers'));
makePanelDraggable(document.getElementById('panelCode'));
