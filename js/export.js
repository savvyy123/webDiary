// ==================================================
//  export.js  ファイル保存・読み込み・画像書き出し
// ==================================================

// ===== ファイル保存ダイアログ =====

async function saveWithPicker(blob, suggestedName, fileTypes) {
  // File System Access API 対応ブラウザ → ネイティブ保存ダイアログ
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName, types: fileTypes });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false; // ユーザーキャンセル
    }
  }
  // フォールバック：通常ダウンロード
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(a.href);
  return true;
}

// ===== スライドを Canvas にレンダリング =====

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('画像の読み込みに失敗'));
    img.src = src;
  });
}

async function renderSlideToCanvas(slideIndex) {
  const canvas = document.createElement('canvas');
  canvas.width = LOGICAL_W;
  canvas.height = LOGICAL_H;
  const ctx = canvas.getContext('2d');

  // 背景：設定色で塗りつぶし
  ctx.fillStyle = canvasBgColor || '#ffffff';
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

  const page = slides[slideIndex];
  const raster = page.raster;
  const layers = raster ? getRasterItems(raster) : [];

  if (layers.length > 0) {
    // ラスタライズ済み：全レイヤーを描画
    for (const layer of layers) {
      // 回転対応: レイヤーに rotation があれば ctx を回転
      const rot = layer.rotation || 0;
      if (rot) {
        ctx.save();
        ctx.translate(layer.logicX || 0, layer.logicY || 0);
        ctx.rotate(rot * Math.PI / 180);
        ctx.translate(-(layer.logicX || 0), -(layer.logicY || 0));
      }
      if (layer.kind === 'char') {
        ctx.fillStyle = layer.color || getInkColor();
        ctx.font = `${layer.baseSize}px "Noto Sans JP", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(layer.ch, layer.logicX, layer.logicY);
      } else if (layer.kind === 'image') {
        try {
          const img = await loadImage(layer.src);
          const w = layer.baseW || 200;
          const h = layer.baseH || 200;
          ctx.drawImage(img, layer.logicX - w / 2, layer.logicY - h / 2, w, h);
        } catch (_) { /* broken image はスキップ */ }
      } else if (layer.kind === 'shape') {
        drawShapeOnCtx(ctx, layer, 1, 0, 0);
      } else if (layer.kind === 'stroke') {
        const pts = layer.points || [];
        if (pts.length > 1) {
          ctx.strokeStyle = layer.color || getInkColor();
          ctx.lineWidth = layer.width || 4;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          pts.forEach((pt, i) => {
            if (i === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          });
          ctx.stroke();
        }
      }
      if (rot) ctx.restore();
    }
  } else if (page.essayText) {
    // エッセイモード：原稿用紙をレンダリング
    ctx.fillStyle = '#fffef5';
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    drawEssayGrid(ctx, LOGICAL_W, LOGICAL_H, page.essayText, { padX: 36, padY: 28 });
  } else {
    // テキストモード：縦書きレンダリング
    const text = page.text || '';
    if (text) {
      const fs = Number(fontSize.value) || 64;
      const charH = fs * 1.2;
      const charW = fs * 1.1;
      const usableHeight = LOGICAL_H * 0.8;
      const topBase = (LOGICAL_H - usableHeight) / 2;
      const maxRows = Math.max(1, Math.floor(usableHeight / charH));

      const chars = [];
      let col = 0, row = 0;
      for (const ch of text) {
        if (ch === '\n') { col++; row = 0; continue; }
        chars.push({ ch, col, row });
        row++;
        if (row >= maxRows) { row = 0; col++; }
      }

      const totalCols = chars.length ? (chars[chars.length - 1].col + 1) : 1;
      const totalWidth = totalCols * charW;
      const leftBase = (LOGICAL_W + totalWidth) / 2 - charW;

      ctx.fillStyle = getInkColor();
      ctx.font = `${fs}px "Noto Sans JP", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      chars.forEach(info => {
        const x = leftBase - info.col * charW + charW / 2;
        const y = topBase + info.row * charH + charH / 2;
        ctx.fillText(info.ch, x, y);
      });
    }
  }

  return canvas;
}

// ページ番号・名前からファイル名を生成
function getPageFilename(i) {
  const num = String(i + 1).padStart(2, '0');
  const name = (slides[i].name || '').trim();
  const safeName = name.replace(/[\\/:*?"<>|]/g, '');
  return safeName ? `${num}_${safeName}.png` : `kamishibai_${num}.png`;
}

// ===== イベントハンドラ =====

// .kmshb ファイル書き出し
exportBtn.addEventListener('click', async () => {
  try {
    exportBtn.disabled = true;
    exportBtn.textContent = 'Saving…';

    const zip = new JSZip();
    const exportSlides = JSON.parse(JSON.stringify(slides));
    const imgFolder = zip.folder('images');
    let imgIndex = 0;

    exportSlides.forEach(slide => {
      if (!slide.raster || !slide.raster.layers) return;
      slide.raster.layers.forEach(layer => {
        if (layer.kind === 'image' && layer.src && layer.src.startsWith('data:')) {
          const match = layer.src.match(/^data:image\/(\w+);base64,(.+)$/);
          if (match) {
            const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
            const filename = `img_${imgIndex}.${ext}`;
            imgFolder.file(filename, match[2], { base64: true });
            layer.src = `images/${filename}`;
            imgIndex++;
          }
        }
      });
    });

    const data = { version: 1, slides: exportSlides, idx, fontSize: Number(fontSize.value) };
    zip.file('data.json', JSON.stringify(data, null, 2));

    const blob = await zip.generateAsync({ type: 'blob' });
    await saveWithPicker(blob, 'kamishibai.kmshb', [
      { description: '紙芝居プロジェクト', accept: { 'application/octet-stream': ['.kmshb'] } }
    ]);
  } catch (err) {
    console.error(err);
    alert('ファイル保存に失敗しました');
  } finally {
    exportBtn.disabled = false;
    exportBtn.textContent = 'SaveProject';
  }
});

importBtn.addEventListener('click', () => importFile.click());

importFile.addEventListener('change', async e => {
  const f = e.target.files?.[0];
  if (!f) return;

  try {
    let st;

    if (f.name.endsWith('.json')) {
      st = JSON.parse(await f.text());
    } else {
      const zip = await JSZip.loadAsync(f);
      const dataFile = zip.file('data.json');
      if (!dataFile) throw new Error('data.json が見つかりません');
      st = JSON.parse(await dataFile.async('string'));

      if (Array.isArray(st.slides)) {
        for (const slide of st.slides) {
          if (!slide.raster || !slide.raster.layers) continue;
          for (const layer of slide.raster.layers) {
            if (layer.kind === 'image' && layer.src && !layer.src.startsWith('data:')) {
              const imgFile = zip.file(layer.src);
              if (imgFile) {
                const base64 = await imgFile.async('base64');
                const ext = layer.src.split('.').pop().toLowerCase();
                const mime = ext === 'jpg' ? 'jpeg' : ext;
                layer.src = `data:image/${mime};base64,${base64}`;
              }
            }
          }
        }
      }
    }

    pushUndoState();
    restoreFromState(st);
  } catch (err) {
    console.error(err);
    alert('ファイルの読み込みに失敗しました');
  }

  importFile.value = '';
});

// 現在ページを PNG で保存
exportImageBtn.addEventListener('click', async () => {
  try {
    exportImageBtn.disabled = true;
    exportImageBtn.textContent = 'drawing…';

    const canvas = await renderSlideToCanvas(idx);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

    await saveWithPicker(blob, getPageFilename(idx), [
      { description: 'PNG画像', accept: { 'image/png': ['.png'] } }
    ]);
  } catch (err) {
    console.error(err);
    alert('画像の保存に失敗しました');
  } finally {
    exportImageBtn.disabled = false;
    exportImageBtn.textContent = 'SaveAsPNG';
  }
});

// 全ページをまとめて ZIP 保存
exportAllImagesBtn.addEventListener('click', async () => {
  try {
    exportAllImagesBtn.disabled = true;

    const zip = new JSZip();
    for (let i = 0; i < slides.length; i++) {
      exportAllImagesBtn.textContent = `描画中… ${i + 1}/${slides.length}`;
      const canvas = await renderSlideToCanvas(i);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      zip.file(getPageFilename(i), blob);
    }

    exportAllImagesBtn.textContent = 'zip creating…';
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    await saveWithPicker(zipBlob, 'kamishibai_images.zip', [
      { description: 'ZIP アーカイブ', accept: { 'application/zip': ['.zip'] } }
    ]);
  } catch (err) {
    console.error(err);
    alert('まとめて保存に失敗しました');
  } finally {
    exportAllImagesBtn.disabled = false;
    exportAllImagesBtn.textContent = 'SaveAllPNGs';
  }
});
