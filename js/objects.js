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
