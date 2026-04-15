// ==================================================
//  codespace.js  Code Space（p5.js コードエディタ）
// ==================================================

// デフォルトテンプレート
const P5_DEFAULT_CODE = `// p. でp5.jsの関数を呼びます
// 背景を透明にしたい場合は p.clear() を使います
p.setup = function() {
  p.createCanvas(400, 400);
  p.noLoop();
};

p.draw = function() {
  p.clear(); // 透明背景
  p.fill('#1e88e5');
  p.noStroke();
  p.ellipse(200, 200, 200, 200);
};`;

canvasCode.value = P5_DEFAULT_CODE;

// ===== エラー表示ヘルパー =====

function showCodeError(msg) {
  codeErrorMsg.textContent = msg;
  codeErrorMsg.classList.add('visible');
}

function clearCodeError() {
  codeErrorMsg.textContent = '';
  codeErrorMsg.classList.remove('visible');
}

// ===== 生成ボタン：p5 スケッチ実行 → スライドに追加 =====

generateCodeBtn.addEventListener('click', () => {
  const code = canvasCode.value.trim();
  if (!code) return;

  clearCodeError();
  codePreviewArea.style.display = 'none';
  generateCodeBtn.disabled = true;
  generateCodeBtn.textContent = '生成中…';

  // p5.js 実行用の一時コンテナ（画面外）
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
  document.body.appendChild(container);

  let p5inst = null;
  let captured = false;

  function cleanup() {
    if (p5inst) { try { p5inst.remove(); } catch (_) {} p5inst = null; }
    if (container.parentNode) document.body.removeChild(container);
    generateCodeBtn.disabled = false;
    generateCodeBtn.textContent = '生成';
  }

  function doCapture() {
    if (captured) return;
    captured = true;

    try {
      if (p5inst) p5inst.noLoop();
      const cnv = container.querySelector('canvas');
      if (!cnv) {
        showCodeError('キャンバスが見つかりません。p.createCanvas() を呼んでいるか確認してください。');
        cleanup();
        return;
      }

      const dataUrl = cnv.toDataURL('image/png');

      // ラスタモードでなければ切り替える
      if (mode !== 'raster') enterRasterMode();

      // 現在のスライドの中央にオブジェクトとして追加
      insertImageAt(LOGICAL_W / 2, LOGICAL_H / 2, dataUrl);

      // パネル内にプレビューを表示（追加完了の確認用）
      codePreviewImg.src = dataUrl;
      codePreviewArea.style.display = 'block';

    } catch (captureErr) {
      showCodeError('キャプチャエラー: ' + captureErr.message);
    } finally {
      cleanup();
    }
  }

  try {
    const sketchFn = new Function('p', code);

    p5inst = new p5(function(p) {
      sketchFn(p);

      // p.draw をラップして描画完了後にキャプチャ
      const origDraw = p.draw;
      p.draw = function() {
        if (origDraw) origDraw.call(p);
        // 描画コンテキストを汚さないよう setTimeout(0) で非同期実行
        setTimeout(doCapture, 0);
      };
    }, container);

    // draw 未定義やごく稀な遅延に備えたフォールバック
    setTimeout(() => { if (!captured) doCapture(); }, 800);

  } catch (err) {
    showCodeError('コードエラー: ' + err.message);
    cleanup();
  }
});

// ===== コピーボタン =====

copyCodeBtn.addEventListener('click', () => {
  const text = canvasCode.value || '';
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      copyCodeBtn.textContent = 'コピー済み';
      setTimeout(() => { copyCodeBtn.textContent = 'コピー'; }, 1200);
    }).catch(() => {
      canvasCode.select();
      document.execCommand('copy');
    });
  } else {
    canvasCode.select();
    document.execCommand('copy');
  }
});
