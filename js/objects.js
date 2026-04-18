// ==================================================
//  objects.js  ラスタオブジェクト操作・色変更・スナップ
// ==================================================

// ===== レイヤークリア / モード切替 =====

function clearCharLayer() {
  if (charLayer) {
    charLayer.remove();
    charLayer = null;
  }
  charObjects = [];
  draggingObj = null;
  resizingObj = null;
  clearSelectedObj();
}

function exitRasterMode() {
  mode = 'text';
  clearCharLayer();
  output.style.visibility = 'visible';

  if (drawCanvas && drawCtx) {
    drawCanvas.style.pointerEvents = 'none';
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  }
  updateLayerAndCodeUI();
}

function enterRasterMode() {
  if (mode === 'raster' && slides[idx].raster && getRasterItems(slides[idx].raster).length) {
    return;
  }

  commitInline();
  const page = slides[idx];
  const text = page.text || '';
  const fs = (Number(fontSize.value) || 64) * OBJ_SIZE_SCALE;

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
    if (rawCh === '\n') { col++; row = 0; continue; }
    charsInfo.push({ ch: rawCh, col, row });
    row++;
    if (row >= maxRows) { row = 0; col++; }
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

// ===== 画像挿入 =====

function insertImageAt(logicX, logicY, dataUrl) {
  pushUndoState();

  const page = slides[idx];
  const raster = ensureRaster(page);

  const tmpImg = new Image();
  tmpImg.onload = () => {
    const nw = tmpImg.naturalWidth || 200;
    const nh = tmpImg.naturalHeight || 200;

    const maxSize = 280 * OBJ_SIZE_SCALE;
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

// ===== 回転（Rキー） =====
// Rキーで回転モードに入る。マウス移動で回転、数値入力で角度指定。

let rotateMode = false;
let rotateStartAngle = 0;
let rotateStartRots = [];
let rotateInput = null;

function startRotateMode() {
  if (!selectedSet.length || mode !== 'raster') return;
  rotateMode = true;
  pushUndoState();
  // 各オブジェクトの現在の回転を記録
  rotateStartRots = selectedSet.map(obj => obj.data.rotation || 0);
  // 数値入力用フィールドを作成
  rotateInput = document.createElement('input');
  rotateInput.type = 'number';
  rotateInput.className = 'rotate-angle-input';
  rotateInput.placeholder = '0°';
  rotateInput.value = '';
  document.body.appendChild(rotateInput);
  rotateInput.focus();

  // 基準角度: マウス位置と選択中心の角度
  const center = getSelectedCenter();
  rotateStartAngle = null; // マウス移動時に初期化

  function onMouseMove(e) {
    const dx = e.clientX - center.sx;
    const dy = e.clientY - center.sy;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    if (rotateStartAngle === null) rotateStartAngle = angle;
    const delta = angle - rotateStartAngle;
    applyRotation(delta);
    rotateInput.value = Math.round(delta);
  }

  function applyRotation(delta) {
    selectedSet.forEach((obj, i) => {
      obj.data.rotation = (rotateStartRots[i] + delta) % 360;
    });
    updateSpritePositions();
  }

  function commitRotate() {
    rotateMode = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mousedown', onClickFinish);
    document.removeEventListener('keydown', onKey);
    if (rotateInput && rotateInput.parentNode) rotateInput.remove();
    rotateInput = null;
    persist();
    renderRail();
    updateLayerAndCodeUI();
  }

  function onClickFinish(e) {
    if (e.target === rotateInput) return;
    commitRotate();
  }

  function onKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = parseFloat(rotateInput.value) || 0;
      applyRotation(val - (rotateStartRots[0] || 0) + (rotateStartRots[0] || 0));
      selectedSet.forEach((obj, i) => {
        obj.data.rotation = (rotateStartRots[i] + val) % 360;
      });
      updateSpritePositions();
      commitRotate();
    }
    if (e.key === 'Escape') {
      // キャンセル: 元に戻す
      selectedSet.forEach((obj, i) => {
        obj.data.rotation = rotateStartRots[i];
      });
      updateSpritePositions();
      commitRotate();
      undo();
    }
  }

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onClickFinish);
  document.addEventListener('keydown', onKey);
}

function getSelectedCenter() {
  let sumX = 0, sumY = 0;
  selectedSet.forEach(obj => {
    sumX += obj.data.logicX || 0;
    sumY += obj.data.logicY || 0;
  });
  const lx = sumX / selectedSet.length;
  const ly = sumY / selectedSet.length;
  const { baseScale: scale, baseOffsetX: offsetX, baseOffsetY: offsetY, baseRect } = getStageTransform();
  return {
    lx, ly,
    sx: baseRect.left + offsetX + lx * scale,
    sy: baseRect.top  + offsetY + ly * scale
  };
}

// ===== オブジェクト複製（Dキー） =====

function duplicateSelected() {
  if (!selectedSet.length || mode !== 'raster') return;
  pushUndoState();
  const page = slides[idx];
  const raster = ensureRaster(page);
  const offset = 30; // 複製先のずらし量
  selectedSet.forEach(obj => {
    const clone = JSON.parse(JSON.stringify(obj.data));
    clone.logicX = (clone.logicX || 0) + offset;
    clone.logicY = (clone.logicY || 0) + offset;
    clone.locked = false;
    raster.layers.push(clone);
  });
  persist();
  buildCharLayerFromRaster(raster);
  renderRail();
  updateLayerAndCodeUI();
}

// ===== テキストボックス追加 =====

function addTextboxFromTool() {
  pushUndoState();

  let text = toolTextInput.value.trim();
  if (!text) text = 'テキスト';

  const page = slides[idx];
  const raster = ensureRaster(page);

  const fs = Math.round(48 * OBJ_SIZE_SCALE);
  const baseH = fs * 1.6;
  const baseW = fs * text.length * 0.8 + 40;

  const layer = {
    kind: 'shape',
    type: 'textbox',
    text,
    fontSize: fs,
    logicX: LOGICAL_W / 2,
    logicY: LOGICAL_H / 2,
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

// ===== 色変更 =====

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
    } else if (obj.kind === 'image') {
      if (!obj.data.origSrc) obj.data.origSrc = obj.data.src;
      obj.data.color = color;
      const oldEl = obj.el;
      const newImg = createImageSprite(obj.data, (finishedImg) => {
        obj.data.src = finishedImg.src;
        persist();
      });
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
    if (btn.dataset.color && btn.dataset.color.toLowerCase() === color.toLowerCase()) {
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

// ===== スナップ（中央 + オブジェクト同士） =====

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
    if (Math.sqrt(dx * dx + dy * dy) <= SNAP_RADIUS_CENTER) {
      d.logicX = centerX;
      d.logicY = centerY;
      snapped = true;
    }
  });

  // オブジェクト同士のスナップ
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
      if (Math.abs(dx) <= SNAP_RADIUS_AXIS) { d.logicX = od.logicX; snapped = true; }
      if (Math.abs(dy) <= SNAP_RADIUS_AXIS) { d.logicY = od.logicY; snapped = true; }
    });
  });

  if (snapped) updateSpritePositions();
}
