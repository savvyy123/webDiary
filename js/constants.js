// ==================================================
//  constants.js  定数・IndexedDB・共通ユーティリティ
// ==================================================

const LS_KEY = 'kamishibai_pages_v8'; // localStorage（旧形式、マイグレーション用）

// IndexedDB 定数
const IDB_NAME    = 'kamishibai_db';
const IDB_VERSION = 1;
const IDB_STORE   = 'projects';
const IDB_KEY     = 'default';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  });
}

async function idbSave(data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(data, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function idbLoad() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror   = () => reject(req.error);
  });
}

// 論理座標（レイアウトの基準となる仮想キャンバス）
const LOGICAL_W = 1080;
const LOGICAL_H = 720;

// サムネイルサイズ
const THUMB_W = 200;
const THUMB_H = 133;

// Mac（Retina）では OBJ 初期サイズ・UI を一回り小さく
const isMac = /Macintosh|Mac OS X/.test(navigator.userAgent);
const OBJ_SIZE_SCALE = isMac ? 0.75 : 1.0;
if (isMac) document.body.classList.add('mac');

// インクカラーを CSS 変数から取得（state.js より先に定義が必要）
function getInkColor() {
  return (
    (getComputedStyle(document.body).getPropertyValue('--ink') || '#111111')
      .trim() || '#111111'
  );
}
