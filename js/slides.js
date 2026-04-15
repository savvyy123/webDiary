// ==================================================
//  slides.js  ページ操作・テキスト編集・保存・読み込み
// ==================================================

// ===== ページ操作 =====

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

// ===== 保存 / 読み込み =====

function persist() {
  const data = { slides, idx, fontSize: Number(fontSize.value) };
  idbSave(data).catch(err => console.warn('IndexedDB save failed:', err));
}

function restoreFromState(st) {
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
}

async function load() {
  // 1) IndexedDB から読み込み
  try {
    const st = await idbLoad();
    if (st && (st.slides || Array.isArray(st))) {
      restoreFromState(st);
      return true;
    }
  } catch (e) {
    console.warn('IndexedDB load failed:', e);
  }

  // 2) localStorage からマイグレーション
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return false;
  try {
    const st = JSON.parse(raw);
    restoreFromState(st);
    persist(); // IndexedDB に移行保存
    return true;
  } catch (e) {
    console.warn(e);
    return false;
  }
}

// ===== テキスト編集 =====

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
  if (e.target === stage || e.target === stageInner) {
    clearSelectedObj();
  }
  stageSelected = true;
});
