// ==================================================
//  render.js  描画（ステージ・スプライト・サムネイル・レイヤーUI）
// ==================================================

// ===== スプライト位置更新 =====

function updateSpritePositions() {
  if (mode !== 'raster' || !charLayer || charObjects.length === 0) return;
  const { baseScale: scale, baseOffsetX: offsetX, baseOffsetY: offsetY } = getStageTransform();

  charObjects.forEach(obj => {
    const d = obj.data;
    if (!d) return;
    const cx = offsetX + d.logicX * scale;
    const cy = offsetY + d.logicY * scale;
    obj.el.style.left = `${cx}px`;
    obj.el.style.top  = `${cy}px`;
    if (obj.kind === 'char') {
      const w = d.baseSize * scale;
      obj.el.style.width  = `${w}px`;
      obj.el.style.height = `${w}px`;
    } else if (obj.kind === 'image' || obj.kind === 'shape') {
      obj.el.style.width  = `${(d.baseW || 0) * scale}px`;
      obj.el.style.height = `${(d.baseH || 0) * scale}px`;
    }
  });
}

// ===== 文字スプライト画像生成 =====

function createCharImage(data) {
  const SCALE = 3;
  const dpr   = (window.devicePixelRatio || 1) * SCALE;
  const size  = data.baseSize;

  const canvas = document.createElement('canvas');
  canvas.width  = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, size, size);

  const col = data.color || getInkColor();
  ctx.fillStyle = col;
  ctx.font = `${size}px "Noto Sans JP", system-ui, -apple-system, "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(data.ch, size / 2, size / 2);

  const img = new Image();
  img.src       = canvas.toDataURL('image/png');
  img.className = 'char-sprite';
  img.style.width  = `${size}px`;
  img.style.height = `${size}px`;
  return img;
}

// ===== 図形スプライト画像生成 =====

function createShapeImage(shape) {
  const dpr = window.devicePixelRatio || 1;
  const w   = shape.baseW || 200;
  const h   = shape.baseH || 200;

  const canvas = document.createElement('canvas');
  canvas.width  = w * dpr;
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
    if (shape.type === 'circleFill') { ctx.fillStyle = col; ctx.fill(); }
    else { ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.stroke(); }
  } else if (shape.type === 'square') {
    const s = Math.min(w, h);
    ctx.rect((w - s) / 2, (h - s) / 2, s, s);
    ctx.fillStyle = col; ctx.fill();
  } else if (shape.type === 'triangle') {
    ctx.moveTo(w / 2, 0); ctx.lineTo(w, h); ctx.lineTo(0, h);
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  } else if (shape.type === 'fullrect') {
    ctx.rect(0, 0, w, h); ctx.fillStyle = col; ctx.fill();
  } else if (shape.type === 'textbox') {
    const text = shape.text || '';
    const fs   = (h || 40) * 0.6;
    ctx.fillStyle     = col;
    ctx.font          = `${fs}px "Noto Sans JP", system-ui, -apple-system, "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif`;
    ctx.textAlign     = 'left';
    ctx.textBaseline  = 'top';
    ctx.fillText(text, 0, 0, w);
  }

  const img = new Image();
  img.src       = canvas.toDataURL('image/png');
  img.className = 'char-sprite';
  img.style.width  = `${w}px`;
  img.style.height = `${h}px`;
  return img;
}

// ===== 画像スプライト生成（色指定があれば着色） =====

function createImageSprite(layer, onReady) {
  const img = new Image();
  img.className   = 'char-sprite';
  img.style.width  = (layer.baseW || 200) + 'px';
  img.style.height = (layer.baseH || 200) + 'px';

  const srcOriginal = layer.origSrc || layer.src;

  if (!layer.color) {
    img.src = srcOriginal;
    return img;
  }

  const tmp = new Image();
  tmp.onload = () => {
    const w = tmp.naturalWidth  || layer.baseW || 200;
    const h = tmp.naturalHeight || layer.baseH || 200;
    const canvas = document.createElement('canvas');
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(tmp, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = layer.color;
    ctx.fillRect(0, 0, w, h);
    img.src = canvas.toDataURL('image/png');
    if (onReady) onReady(img);
  };
  tmp.onerror = () => { img.src = srcOriginal; if (onReady) onReady(img); };
  tmp.src = srcOriginal;
  return img;
}

// ===== スプライトへのマウスイベント登録 =====

function addSpriteEventHandlers(img, obj) {
  img.addEventListener('mousedown', e => {
    if (mode !== 'raster') return;
    e.stopPropagation();
    e.preventDefault();
    stageSelected = true;

    if (obj.data && obj.data.locked) { setSelectedObj(obj, e.shiftKey); return; }

    pushUndoState();
    setSelectedObj(obj, e.shiftKey);

    if (sizeEditMode) {
      resizingObj         = obj;
      resizeStartScreenY  = e.clientY;
      resizeStartSize     = obj.kind === 'char' ? obj.data.baseSize : (obj.data.baseW || 100);
    } else {
      draggingObj      = obj;
      dragStartScreenX = e.clientX;
      dragStartScreenY = e.clientY;
      dragStartLogicX  = obj.data.logicX;
      dragStartLogicY  = obj.data.logicY;
    }
  });
}

// ===== ラスタレイヤーをDOMに構築 =====

function buildCharLayerFromRaster(raster) {
  clearCharLayer();

  const layerEl = document.createElement('div');
  layerEl.className = 'char-layer';

  getRasterItems(raster).forEach(layer => {
    if (layer.kind === 'stroke') return;
    let img;
    if (layer.kind === 'char')  img = createCharImage(layer);
    else if (layer.kind === 'image') {
      img = createImageSprite(layer);
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

  stageInner.appendChild(layerEl);
  charLayer = layerEl;
  mode      = 'raster';
  output.style.visibility = 'hidden';
  updateSpritePositions();
  setupDrawCanvas();
  updateLayerAndCodeUI();
}

// ===== レイヤーパネル更新 =====

function updateLayerAndCodeUI() {
  layerList.innerHTML  = '';
  currentLayerItems    = [];

  const page   = slides[idx];
  const raster = page.raster;
  const layers = raster ? getRasterItems(raster) : [];

  if (!layers.length) {
    const li = document.createElement('li');
    li.className   = 'layer-item';
    li.textContent = 'ラスタライズされたオブジェクトはありません。';
    layerList.appendChild(li);
    return;
  }

  currentLayerItems = layers.slice();
  const n = layers.length;

  for (let uiIndex = 0; uiIndex < n; uiIndex++) {
    const layerIndex = n - 1 - uiIndex;
    const entry      = layers[layerIndex];
    if (entry.kind === 'stroke') continue;

    const li = document.createElement('li');
    li.className = 'layer-item';
    if (entry.locked) li.classList.add('locked');
    if (selectedSet.some(o => o.data === entry)) li.classList.add('selected');

    li.draggable         = true;
    li.dataset.layerIndex = layerIndex;
    li.addEventListener('dragstart', handleLayerDragStart);
    li.addEventListener('dragover',  handleLayerDragOver);
    li.addEventListener('drop',      handleLayerDrop);

    const header = document.createElement('div');
    header.className = 'layer-item-header';

    const type = document.createElement('span');
    type.className  = 'layer-type';
    type.textContent = entry.kind === 'char' ? '文字' : entry.kind === 'image' ? '画像' : '図形';

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
      else if (t === 'triangle')   label.textContent = '▲ 三角';
      else if (t === 'square')     label.textContent = '■ 正方形';
      else if (t === 'fullrect')   label.textContent = '▭ 全面矩形';
      else if (t === 'textbox')    label.textContent = `T "${entry.text || ''}"`;
      else label.textContent = t;
    }

    const lockBtn = document.createElement('button');
    lockBtn.className   = 'layer-lock';
    lockBtn.textContent = entry.locked ? '🔒' : '🔓';
    lockBtn.addEventListener('click', e => {
      e.stopPropagation();
      entry.locked = !entry.locked;
      persist();
      updateLayerAndCodeUI();
    });

    const order = document.createElement('span');
    order.className   = 'layer-order';
    order.textContent = `#${layerIndex + 1}`;

    header.append(type, label, lockBtn, order);

    const coords = document.createElement('div');
    coords.className = 'layer-coords';
    const x = entry.logicX != null ? entry.logicX.toFixed(0) : '-';
    const y = entry.logicY != null ? entry.logicY.toFixed(0) : '-';
    if (entry.kind === 'char') {
      coords.textContent = `X: ${x}, Y: ${y} / size: ${entry.baseSize != null ? entry.baseSize.toFixed(1) : '-'}`;
    } else {
      coords.textContent = `X: ${x}, Y: ${y} / W: ${entry.baseW != null ? entry.baseW.toFixed(1) : '-'}, H: ${entry.baseH != null ? entry.baseH.toFixed(1) : '-'}`;
    }

    li.append(header, coords);
    li.addEventListener('click', () => {
      const obj = charObjects.find(o => o.data === entry);
      if (obj) setSelectedObj(obj, false);
      else if (!e?.shiftKey) clearSelectedObj();
    });

    layerList.appendChild(li);
  }

  if (!layerList.children.length) {
    const li = document.createElement('li');
    li.className   = 'layer-item';
    li.textContent = '（文字・図形レイヤーはありません）';
    layerList.appendChild(li);
  }
}

// レイヤーパネルのドラッグ&ドロップ
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

// ===== ステージ描画 =====

function renderStage() {
  const page = slides[idx];
  output.textContent    = page.text || '（空）';
  output.style.fontSize = Number(fontSize.value) + 'px';
  editor.value          = page.text || '';
  badge.textContent     = String(idx + 1).padStart(2, '0');
  counter.textContent   = `Page ${idx + 1} / ${slides.length}`;

  clearCharLayer();

  const raster    = page.raster;
  const hasRaster = raster && getRasterItems(raster).length > 0;

  if (hasRaster) {
    buildCharLayerFromRaster(raster);
    setupDrawCanvas();
  } else {
    mode = 'text';
    output.style.visibility = 'visible';
    if (drawCanvas && drawCtx) drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  }

  renderRail();
  persist();
  updateLayerAndCodeUI();
  renderEssayOnStage();
}

// ===== 図形をCanvasに描画（サムネイル共用） =====

function drawShapeOnCtx(ctx, shape, scale, offsetX, offsetY) {
  const baseColor = shape.color || getInkColor();
  const cx = offsetX + shape.logicX * scale;
  const cy = offsetY + shape.logicY * scale;
  const w  = (shape.baseW || 0) * scale;
  const h  = (shape.baseH || 0) * scale;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();

  if (shape.type === 'circleFill' || shape.type === 'circleRing') {
    const r = Math.min(w, h) / 2;
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    if (shape.type === 'circleFill') { ctx.fillStyle = baseColor; ctx.fill(); }
    else { ctx.strokeStyle = baseColor; ctx.lineWidth = 2; ctx.stroke(); }
  } else if (shape.type === 'square') {
    const s = Math.min(w, h);
    ctx.rect(-s / 2, -s / 2, s, s); ctx.fillStyle = baseColor; ctx.fill();
  } else if (shape.type === 'triangle') {
    ctx.moveTo(0, -h / 2); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2);
    ctx.closePath(); ctx.fillStyle = baseColor; ctx.fill();
  } else if (shape.type === 'fullrect') {
    ctx.rect(-w / 2, -h / 2, w, h); ctx.fillStyle = baseColor; ctx.fill();
  } else if (shape.type === 'textbox') {
    ctx.fillStyle = baseColor;
    const fs = (h || 40) * 0.6;
    ctx.font = `${fs}px "Noto Sans JP", system-ui, -apple-system, "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(shape.text || '', -w / 2, -h / 2, w);
  }
  ctx.restore();
}

// ===== サムネイルレール描画 =====

function updateStagePageName() {
  if (!stagePageName) return;
  const page = slides[idx];
  if (!page) { stagePageName.textContent = ''; return; }
  stagePageName.style.display = '';
  stagePageName.textContent = page.name || `Page ${idx + 1}`;
}

function beginStagePageNameEdit() {
  if (!stagePageName) return;
  const page = slides[idx];
  if (!page) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'stage-page-name-input';
  input.value = page.name || '';
  input.placeholder = `Page ${idx + 1}`;
  stagePageName.style.display = 'none';
  stagePageName.parentNode.appendChild(input);
  input.focus();
  input.select();
  const commit = () => {
    page.name = input.value.trim();
    input.remove();
    persist();
    updateStagePageName();
    renderRail();
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter')  { ev.preventDefault(); input.blur(); }
    if (ev.key === 'Escape') { input.value = page.name || ''; input.blur(); }
  });
}

if (stagePageName) {
  stagePageName.addEventListener('click', e => {
    e.stopPropagation();
    beginStagePageNameEdit();
  });
}

function renderRail() {
  updateStagePageName();
  rail.innerHTML = '';

  slides.forEach((page, i) => {
    const t = document.createElement('div');
    t.className = 'thumb' + (i === idx ? ' active' : '');
    t.draggable = true;

    const raster = page.raster;
    const layers = raster ? getRasterItems(raster) : [];

    if (layers.length > 0) {
      const canvas = document.createElement('canvas');
      canvas.width  = THUMB_W;
      canvas.height = THUMB_H;
      canvas.style.width  = '100%';
      canvas.style.height = '100%';
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#d6d6d6';
      ctx.fillRect(0, 0, THUMB_W, THUMB_H);

      const scaleX  = THUMB_W / LOGICAL_W;
      const scaleY  = THUMB_H / LOGICAL_H;
      const scale   = Math.min(scaleX, scaleY);
      const offsetX = (THUMB_W - LOGICAL_W * scale) / 2;
      const offsetY = (THUMB_H - LOGICAL_H * scale) / 2;

      layers.forEach(layer => {
        if (layer.kind === 'char') {
          const x    = offsetX + layer.logicX * scale;
          const y    = offsetY + layer.logicY * scale;
          const size = layer.baseSize * scale;
          const col  = layer.color || getInkColor();
          ctx.font          = `${size}px "Noto Sans JP", system-ui, -apple-system, "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif`;
          ctx.fillStyle     = col;
          ctx.textAlign     = 'center';
          ctx.textBaseline  = 'middle';
          ctx.fillText(layer.ch, x, y);
        } else if (layer.kind === 'image') {
          const image = new Image();
          image.src = layer.src;
          image.onload = () => {
            const cx = offsetX + layer.logicX * scale;
            const cy = offsetY + layer.logicY * scale;
            ctx.drawImage(image, cx - (layer.baseW || 0) * scale / 2, cy - (layer.baseH || 0) * scale / 2,
              (layer.baseW || 0) * scale, (layer.baseH || 0) * scale);
          };
        } else if (layer.kind === 'shape') {
          drawShapeOnCtx(ctx, layer, scale, offsetX, offsetY);
        } else if (layer.kind === 'stroke') {
          const pts = layer.points || [];
          if (pts.length > 1) {
            ctx.strokeStyle = layer.color || getInkColor();
            ctx.lineWidth   = (layer.width || 4) * scale;
            ctx.lineCap     = 'round';
            ctx.lineJoin    = 'round';
            ctx.beginPath();
            pts.forEach((pt, pi) => {
              const sx = offsetX + pt.x * scale;
              const sy = offsetY + pt.y * scale;
              if (pi === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
            });
            ctx.stroke();
          }
        }
      });

      t.appendChild(canvas);
    } else if (page.essayText) {
      const canvas = document.createElement('canvas');
      canvas.width  = THUMB_W;
      canvas.height = THUMB_H;
      canvas.style.width  = '100%';
      canvas.style.height = '100%';
      renderEssayThumbnail(canvas.getContext('2d'), THUMB_W, THUMB_H, page.essayText);
      t.appendChild(canvas);
    } else {
      const tt = document.createElement('div');
      tt.className   = 'ttext';
      tt.textContent = page.text || '（空）';
      t.appendChild(tt);
    }

    const id = document.createElement('div');
    id.className   = 'idx';
    id.textContent = String(i + 1).padStart(2, '0');
    t.appendChild(id);

    // ページ名ラベル
    const nameEl = document.createElement('div');
    nameEl.className = 'thumb-name';
    nameEl.textContent = page.name || `Page ${i + 1}`;
    nameEl.title = 'Click to rename';

    nameEl.addEventListener('click', e => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.type      = 'text';
      input.className = 'thumb-name-input';
      input.value     = page.name || '';
      input.placeholder = `Page ${i + 1}`;
      nameEl.replaceWith(input);
      input.focus();
      input.select();
      const commit = () => {
        page.name = input.value.trim();
        persist();
        renderRail();
      };
      input.addEventListener('blur',    commit);
      input.addEventListener('keydown', ev => {
        if (ev.key === 'Enter')  { ev.preventDefault(); input.blur(); }
        if (ev.key === 'Escape') { input.value = page.name || ''; input.blur(); }
      });
    });

    // サムネイルクリック → ページジャンプ
    t.addEventListener('click', () => {
      if (i === idx) return;
      commitInline();
      idx = i;
      stageSelected = false;
      clearSelectedObj();
      renderStage();
    });

    // ドラッグ&ドロップ（サムネイル順番入れ替え）
    t.addEventListener('dragstart', e => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(i));
      setTimeout(() => t.classList.add('dragging'), 0);
    });
    t.addEventListener('dragend', () => t.classList.remove('dragging'));
    t.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      t.classList.add('drag-over');
    });
    t.addEventListener('dragleave', () => t.classList.remove('drag-over'));
    t.addEventListener('drop', e => {
      e.preventDefault();
      t.classList.remove('drag-over');
      const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (isNaN(fromIndex) || fromIndex === i) return;
      pushUndoState();
      const moved = slides.splice(fromIndex, 1)[0];
      slides.splice(i, 0, moved);
      idx = slides.indexOf(moved);
      clearSelectedObj();
      renderStage();
    });

    const wrap = document.createElement('div');
    wrap.appendChild(t);
    wrap.appendChild(nameEl);
    rail.appendChild(wrap);
  });
}
