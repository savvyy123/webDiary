// ==================================================
//  events.js  マウス・キーボード・ボタン・UI全イベント・初期化
// ==================================================

// ===== マウス（オブジェクト操作 / 手書き） =====

document.addEventListener('mousemove', e => {
  // 手書き中
  if (drawing && drawMode && mode === 'raster' && drawCanvas && drawCtx) {
    const { lx, ly } = screenToLogical(e.clientX, e.clientY);
    if (currentStroke) {
      const pts = currentStroke.points;
      const last = pts[pts.length - 1];
      const dx = lx - last.x;
      const dy = ly - last.y;
      if (dx * dx + dy * dy > 0.5 * 0.5) {
        pts.push({ x: lx, y: ly });
        redrawStrokes();
      }
    }
    return;
  }

  // サイズ変更
  if (resizingObj && mode === 'raster') {
    const dy = e.clientY - resizeStartScreenY;
    const factor = 1 - dy / 200;
    let newSize = Math.max(16, Math.min(800, resizeStartSize * factor));

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
      if (resizingObj.kind === 'image') {
        resizingObj.el.style.width  = `${d.baseW}px`;
        resizingObj.el.style.height = `${d.baseH}px`;
      } else {
        const oldEl = resizingObj.el;
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

  // オブジェクト移動（視覚スケールを使ってズーム時も正確に動く）
  if (!draggingObj || mode !== 'raster') return;
  const { rect } = getStageTransform();
  const dxLogic = (e.clientX - dragStartScreenX) / (rect.width  / LOGICAL_W);
  const dyLogic = (e.clientY - dragStartScreenY) / (rect.height / LOGICAL_H);
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

// ===== ダブルクリックで画像挿入 =====

stage.addEventListener('dblclick', e => {
  if (e.target !== stage && e.target !== stageInner) return;
  if (mode !== 'raster') enterRasterMode();

  const { rect, scale, offsetX, offsetY } = getStageTransform();
  const lx = (e.clientX - rect.left - offsetX) / scale;
  const ly = (e.clientY - rect.top  - offsetY) / scale;

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
  reader.onload = ev => insertImageAt(logicX, logicY, ev.target.result);
  reader.readAsDataURL(file);
});

// ===== ボタンイベント =====

addOneBtn.addEventListener('click', addOne);
duplicateBtn.addEventListener('click', duplicate);
deleteBtn.addEventListener('click', remove);
prevBtn.addEventListener('click', prev);
nextBtn.addEventListener('click', next);

rasterizeBtn.addEventListener('click', () => {
  if (!rasterizeSelectedTextbox()) enterRasterMode();
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

toolTextBtn.addEventListener('click', () => { enterRasterMode(); addTextboxFromTool(); });

// カラー
colorSwatches.forEach(btn => btn.addEventListener('click', () => setCurrentColor(btn.dataset.color)));
customColor.addEventListener('input', e => setCurrentColor(e.target.value));

// スナップ
snapCenterToggle.addEventListener('change', e => { snapCenterEnabled = e.target.checked; });

// 手書きモード
drawModeToggle.addEventListener('change', e => {
  drawMode = e.target.checked;
  if (!drawCanvas && drawMode) setupDrawCanvas();
  if (drawCanvas) drawCanvas.style.pointerEvents = drawMode ? 'auto' : 'none';
  if (!drawMode) { drawing = false; currentStroke = null; }
});

// ===== キーボードショートカット =====

window.addEventListener('keydown', e => {
  const tag      = (document.activeElement?.tagName || '').toLowerCase();
  const isInput  = tag === 'input' || tag === 'textarea';
  const isEditable = document.activeElement?.isContentEditable;

  // Undo / Redo
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
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

  // Enter: ステージクリック後 → テキスト編集
  if (e.key === 'Enter' && stageSelected && !output.isContentEditable && !isInput && !isEditable) {
    e.preventDefault();
    if (mode === 'raster') exitRasterMode();
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
        const toDelete = new Set(selectedSet.filter(o => !o.data.locked).map(o => o.data));
        r.layers = r.layers.filter(layer => !toDelete.has(layer));
      }
      selectedSet.forEach(obj => {
        if (obj.data.locked) return;
        if (obj.el && obj.el.parentNode) obj.el.parentNode.removeChild(obj.el);
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
  if (e.key === 'ArrowLeft'  || e.key === 'PageUp')   prev();

  // F: フルスクリーン（エッセイページでは Shift+E と同じ）
  if (e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    if (slides[idx] && slides[idx].essayText) {
      toggleEssayMode();
    } else {
      toggleFullscreen();
    }
  }

  // Shift+E: エッセイモード切替
  if (e.shiftKey && (e.key === 'e' || e.key === 'E')) {
    e.preventDefault();
    toggleEssayMode();
  }
});

// ===== フルスクリーン =====

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    if (stage && stage.requestFullscreen) {
      stage.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    }
  } else {
    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }
}

window.addEventListener('resize', () => {
  if (essayMode) { resizeEssayCanvas(); renderEssayCanvas(); }
  renderEssayOnStage();
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

// ===== ズーム / パン =====

function applyStageViewTransform() {
  stageInner.style.transform = (stageZoom === 1.0 && stagePanX === 0 && stagePanY === 0)
    ? ''
    : `translate(${stagePanX}px, ${stagePanY}px) scale(${stageZoom})`;
  updateSpritePositions();
  resizeAndRedrawDrawCanvas();
}

function zoomStageAt(deltaY, cx, cy) {
  const factor  = deltaY > 0 ? 0.85 : (1 / 0.85);
  const newZoom = Math.min(8, Math.max(0.1, stageZoom * factor));

  const innerRect = stageInner.getBoundingClientRect();
  const nLeft = innerRect.left - stagePanX;
  const nTop  = innerRect.top  - stagePanY;
  const lx = (cx - innerRect.left) / stageZoom;
  const ly = (cy - innerRect.top)  / stageZoom;

  stagePanX = cx - nLeft - lx * newZoom;
  stagePanY = cy - nTop  - ly * newZoom;
  stageZoom = newZoom;
  applyStageViewTransform();
}

// Shift + スクロールでズーム
document.querySelector('main').addEventListener('wheel', e => {
  if (!e.shiftKey) return;
  e.preventDefault();
  zoomStageAt(e.deltaY, e.clientX, e.clientY);
}, { passive: false });

// 中ボタン長押しでパン
document.addEventListener('mousedown', e => {
  if (e.button !== 1) return;
  e.preventDefault();
  isMiddlePanning    = true;
  middlePanStartX    = e.clientX;
  middlePanStartY    = e.clientY;
  middlePanStartPanX = stagePanX;
  middlePanStartPanY = stagePanY;
  stage.classList.add('is-panning');
});

document.addEventListener('mousemove', e => {
  if (!isMiddlePanning) return;
  stagePanX = middlePanStartPanX + (e.clientX - middlePanStartX);
  stagePanY = middlePanStartPanY + (e.clientY - middlePanStartY);
  applyStageViewTransform();
});

document.addEventListener('mouseup', e => {
  if (e.button === 1 && isMiddlePanning) {
    isMiddlePanning = false;
    stage.classList.remove('is-panning');
  }
});

// ===== パネルドラッグ =====

function isMobileLayout() {
  return window.matchMedia('(max-width: 768px)').matches;
}

function makePanelDraggable(panel) {
  if (!panel) return;
  const handle = panel.querySelector('.panel-drag-handle');
  if (!handle) return;

  let offsetX = 0, offsetY = 0, panelZoom = 1, dragging = false;

  // 小画面：タップで開閉
  handle.addEventListener('click', () => {
    if (!isMobileLayout()) return;
    document.querySelectorAll('.object-panel, .layers-panel, .code-panel').forEach(p => {
      if (p !== panel) p.classList.remove('panel-open');
    });
    panel.classList.toggle('panel-open');
  });

  handle.addEventListener('mousedown', e => {
    if (isMobileLayout()) return;
    dragging = true;
    const rect = panel.getBoundingClientRect();
    // CSS zoom（body.mac でパネルが縮小）を検出
    panelZoom = rect.width / (panel.offsetWidth || rect.width) || 1;
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    handle.style.cursor = 'grabbing';
    panel.style.bottom = 'auto'; // bottom 固定を解除
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    // ビューポートpx → レイアウトpx に変換
    panel.style.left = `${(e.clientX - offsetX) / panelZoom}px`;
    panel.style.top  = `${(e.clientY - offsetY) / panelZoom}px`;
  });

  document.addEventListener('mouseup', () => {
    dragging = false;
    handle.style.cursor = 'grab';
  });
}

// ===== 表示切替バー =====

const VIEW_STORAGE_KEY = 'kamishibai_view_toggles';

function loadViewToggles() {
  try { return JSON.parse(localStorage.getItem(VIEW_STORAGE_KEY) || 'null'); }
  catch (_) { return null; }
}

function saveViewToggles(state) {
  localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(state));
}

(function initViewToggles() {
  const saved = loadViewToggles() || {};
  document.querySelectorAll('.view-toggle').forEach(btn => {
    const el = document.getElementById(btn.dataset.target);
    if (!el) return;
    if (saved[btn.dataset.target] === false) {
      el.classList.add('panel-hidden');
      btn.classList.remove('active');
    }
    btn.addEventListener('click', () => {
      const isVisible = !el.classList.contains('panel-hidden');
      el.classList.toggle('panel-hidden', isVisible);
      btn.classList.toggle('active', !isVisible);
      const current = loadViewToggles() || {};
      current[btn.dataset.target] = !isVisible;
      saveViewToggles(current);
    });
  });
})();

// ===== 初期化 =====

(async () => {
  const loaded = await load();
  if (!loaded) renderStage();
})();

makePanelDraggable(document.getElementById('objectPanel'));
makePanelDraggable(document.getElementById('panelLayers'));
makePanelDraggable(document.getElementById('panelCode'));
