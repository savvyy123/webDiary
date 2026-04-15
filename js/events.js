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

  // Shift+Ctrl+K: キャンバス設定モーダル
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    openCanvasSettings();
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

async function toggleFullscreen() {
  const overlay = document.getElementById('fullscreenOverlay');
  const img     = document.getElementById('fullscreenImg');
  if (!overlay || !img) return;

  if (!document.fullscreenElement) {
    try {
      const canvas = await renderSlideToCanvas(idx);
      img.src = canvas.toDataURL('image/png');
    } catch (_) { return; }
    overlay.classList.remove('fullscreen-hidden');
    if (overlay.requestFullscreen) {
      overlay.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    }
  } else {
    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }
}

// フルスクリーン解除時にオーバーレイを閉じる
function _handleFSChange() {
  const overlay = document.getElementById('fullscreenOverlay');
  if (!overlay) return;
  if (!document.fullscreenElement) overlay.classList.add('fullscreen-hidden');
}
document.addEventListener('fullscreenchange', _handleFSChange);
document.addEventListener('webkitfullscreenchange', _handleFSChange);

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

// ===== 本体ディスプレイの移動 / 拡大 =====
// stageInner（出力矩形）を .stage 内で自由に移動・ズームする。
// stageZoom / stagePanX / stagePanY は「contain 基準サイズからの追加変換」。

function fitInnerToStage() {
  // .stage 内に contain する stageInner の基底サイズを決定
  const sRect = stage.getBoundingClientRect();
  if (sRect.width === 0 || sRect.height === 0) return;
  const targetRatio = LOGICAL_W / LOGICAL_H;
  let w = sRect.width;
  let h = w / targetRatio;
  if (h > sRect.height) { h = sRect.height; w = h * targetRatio; }
  stageInner.style.width  = w + 'px';
  stageInner.style.height = h + 'px';
  applyStageViewTransform();
}

function applyStageViewTransform() {
  // 中央寄せ (-50%, -50%) → pan → 中央基準の scale
  stageInner.style.transform =
    `translate(-50%, -50%) translate(${stagePanX}px, ${stagePanY}px) scale(${stageZoom})`;
  updateSpritePositions();
  resizeAndRedrawDrawCanvas();
}

function zoomStageAt(deltaY, cx, cy) {
  const factor  = deltaY > 0 ? 0.9 : (1 / 0.9);
  const newZoom = Math.min(8, Math.max(0.2, stageZoom * factor));
  // ポインタ下の点を固定してズーム
  const innerRect = stageInner.getBoundingClientRect();
  const lx = (cx - innerRect.left) / stageZoom;
  const ly = (cy - innerRect.top)  / stageZoom;
  const newLeft = cx - lx * newZoom;
  const newTop  = cy - ly * newZoom;
  stagePanX += newLeft - innerRect.left;
  stagePanY += newTop  - innerRect.top;
  stageZoom  = newZoom;
  applyStageViewTransform();
}

// ステージ上のホイールでズーム（Shift 不要）
stage.addEventListener('wheel', e => {
  e.preventDefault();
  zoomStageAt(e.deltaY, e.clientX, e.clientY);
}, { passive: false });

// ステージ背景または本体ディスプレイ余白をドラッグで移動
let innerDragging = false;
let innerDragStartX = 0, innerDragStartY = 0;
let innerDragStartPanX = 0, innerDragStartPanY = 0;

stage.addEventListener('mousedown', e => {
  // 左クリックのみ。スプライト上は通常のドラッグを優先するので stage/stageInner 直接のみ
  if (e.button !== 0) return;
  if (e.target !== stage && e.target !== stageInner) return;
  innerDragging = true;
  innerDragStartX = e.clientX;
  innerDragStartY = e.clientY;
  innerDragStartPanX = stagePanX;
  innerDragStartPanY = stagePanY;
  stage.classList.add('is-panning');
});

document.addEventListener('mousemove', e => {
  if (!innerDragging) return;
  stagePanX = innerDragStartPanX + (e.clientX - innerDragStartX);
  stagePanY = innerDragStartPanY + (e.clientY - innerDragStartY);
  applyStageViewTransform();
});

document.addEventListener('mouseup', () => {
  if (innerDragging) {
    innerDragging = false;
    stage.classList.remove('is-panning');
  }
});

window.addEventListener('resize', fitInnerToStage);

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

// ===== キャンバス設定（Shift+Ctrl+K） =====
const CANVAS_SETTINGS_KEY = 'kamishibai_canvas_settings_v1';

function applyCanvasSettings(w, h, bg) {
  LOGICAL_W = w;
  LOGICAL_H = h;
  canvasBgColor = bg;
  const root = document.documentElement.style;
  root.setProperty('--inner-aspect', w + ' / ' + h);
  root.setProperty('--inner-bg', bg);
  // 本体ディスプレイを .stage 内に contain 再配置
  stageZoom = 1.0; stagePanX = 0; stagePanY = 0;
  try { fitInnerToStage && fitInnerToStage(); } catch (_) {}
  try { renderRail && renderRail(); } catch (_) {}
}

function saveCanvasSettings() {
  try {
    localStorage.setItem(CANVAS_SETTINGS_KEY, JSON.stringify({
      w: LOGICAL_W, h: LOGICAL_H, bg: canvasBgColor
    }));
  } catch (_) {}
}

function loadCanvasSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(CANVAS_SETTINGS_KEY) || 'null');
    if (s && s.w && s.h && s.bg) applyCanvasSettings(s.w, s.h, s.bg);
    else applyCanvasSettings(LOGICAL_W, LOGICAL_H, canvasBgColor);
  } catch (_) {
    applyCanvasSettings(LOGICAL_W, LOGICAL_H, canvasBgColor);
  }
}

function openCanvasSettings() {
  const modal = document.getElementById('canvasSettingsModal');
  if (!modal) return;
  document.getElementById('canvasWidthInput').value  = LOGICAL_W;
  document.getElementById('canvasHeightInput').value = LOGICAL_H;
  document.getElementById('canvasBgInput').value     = canvasBgColor;
  modal.classList.remove('usage-hidden');
}

(function initCanvasSettingsModal() {
  const modal = document.getElementById('canvasSettingsModal');
  if (!modal) return;
  const closeBtn = document.getElementById('canvasSettingsCloseBtn');
  const applyBtn = document.getElementById('canvasSettingsApplyBtn');
  const wIn = document.getElementById('canvasWidthInput');
  const hIn = document.getElementById('canvasHeightInput');
  const bgIn = document.getElementById('canvasBgInput');
  const close = () => modal.classList.add('usage-hidden');
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.classList.contains('usage-hidden')) close();
  });
  modal.querySelectorAll('.canvas-settings-presets button').forEach(btn => {
    btn.addEventListener('click', () => {
      const [w, h] = btn.dataset.preset.split('x').map(Number);
      wIn.value = w; hIn.value = h;
    });
  });
  applyBtn.addEventListener('click', () => {
    const w = Math.max(100, Math.min(8000, parseInt(wIn.value, 10) || 1920));
    const h = Math.max(100, Math.min(8000, parseInt(hIn.value, 10) || 1080));
    const bg = bgIn.value || '#d6d6d6';
    applyCanvasSettings(w, h, bg);
    saveCanvasSettings();
    close();
  });
  loadCanvasSettings();
  requestAnimationFrame(() => fitInnerToStage());
})();

// Usage モーダル開閉
(function initUsageModal() {
  const btn = document.getElementById('usageBtn');
  const modal = document.getElementById('usageModal');
  const closeBtn = document.getElementById('usageCloseBtn');
  if (!btn || !modal) return;
  const open  = () => modal.classList.remove('usage-hidden');
  const close = () => modal.classList.add('usage-hidden');
  btn.addEventListener('click', () => {
    modal.classList.contains('usage-hidden') ? open() : close();
  });
  closeBtn && closeBtn.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.classList.contains('usage-hidden')) close();
  });
})();

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
