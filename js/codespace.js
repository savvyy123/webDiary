// ==================================================
//  codespace.js  Code Space（p5.js コードエディタ）
// ==================================================

// デフォルトテンプレート
const P5_DEFAULT_CODE = 
`setup = function() {
  createCanvas(400, 400);
  noLoop();
};

draw = function() {
  clear(); // Background transparent
  fill('#1e88e5');
  noStroke();
  ellipse(200, 200, 200, 200);
};`;

canvasCode.value = P5_DEFAULT_CODE;

// Tab キーでインデント挿入（フォーカス移動を防ぐ）
canvasCode.addEventListener('keydown', e => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const start = canvasCode.selectionStart;
    const end   = canvasCode.selectionEnd;
    canvasCode.value = canvasCode.value.substring(0, start) + '  ' + canvasCode.value.substring(end);
    canvasCode.selectionStart = canvasCode.selectionEnd = start + 2;
  }
});

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

// p5 スケッチを実行して dataUrl を返す共通ルーチン
function runSketchToDataUrl(onSuccess, btn, runningLabel, idleLabel) {
  const code = canvasCode.value.trim();
  if (!code) return;

  clearCodeError();
  btn.disabled = true;
  btn.textContent = runningLabel;

  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
  document.body.appendChild(container);

  let p5inst = null;
  let captured = false;

  function cleanup() {
    if (p5inst) { try { p5inst.remove(); } catch (_) {} p5inst = null; }
    if (container.parentNode) document.body.removeChild(container);
    btn.disabled = false;
    btn.textContent = idleLabel;
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
      onSuccess(dataUrl);
    } catch (captureErr) {
      showCodeError('capture error: ' + captureErr.message);
    } finally {
      cleanup();
    }
  }

  try {
    // with(p) で p. を省略可能にする
    // setup/draw を先に定義しておき、with 内の代入が p に届くようにする
    const sketchFn = new Function('p', 'p.setup=function(){};p.draw=function(){};with(p){\n' + code + '\n}');
    p5inst = new p5(function(p) {
      sketchFn(p);
      const origDraw = p.draw;
      p.draw = function() {
        if (origDraw) origDraw.call(p);
        setTimeout(doCapture, 0);
      };
    }, container);
    setTimeout(() => { if (!captured) doCapture(); }, 800);
  } catch (err) {
    showCodeError('error: ' + err.message);
    cleanup();
  }
}

// プレビュー：パネル内に表示のみ
previewCodeBtn.addEventListener('click', () => {
  codePreviewArea.style.display = 'none';
  runSketchToDataUrl((dataUrl) => {
    codePreviewImg.src = dataUrl;
    codePreviewArea.style.display = 'block';
  }, previewCodeBtn, 'previewing…', 'preview');
});

// 生成：ステージに追加＋プレビュー表示
generateCodeBtn.addEventListener('click', () => {
  codePreviewArea.style.display = 'none';
  runSketchToDataUrl((dataUrl) => {
    if (mode !== 'raster') enterRasterMode();
    insertImageAt(LOGICAL_W / 2, LOGICAL_H / 2, dataUrl);
    codePreviewImg.src = dataUrl;
    codePreviewArea.style.display = 'block';
  }, generateCodeBtn, 'creating…', 'create');
});

// ===== コピーボタン =====

copyCodeBtn.addEventListener('click', () => {
  const text = canvasCode.value || '';
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      copyCodeBtn.textContent = 'copied';
      setTimeout(() => { copyCodeBtn.textContent = 'copy'; }, 1200);
    }).catch(() => {
      canvasCode.select();
      document.execCommand('copy');
    });
  } else {
    canvasCode.select();
    document.execCommand('copy');
  }
});
