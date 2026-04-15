// ==================================================
//  state.js  DOM参照・グローバル状態変数
// ==================================================

// ===== DOM 参照 =====
const editor    = document.getElementById('editor');
const output    = document.getElementById('output');
const fontSize  = document.getElementById('fontSize');
const badge     = document.getElementById('badge');
const counter   = document.getElementById('counter');
const rail      = document.getElementById('rail');
const stage     = document.querySelector('.stage');
const stageInner = document.getElementById('stageInner');

// ツールバー
const addOneBtn     = document.getElementById('addOne');
const duplicateBtn  = document.getElementById('duplicate');
const deleteBtn     = document.getElementById('delete');
const prevBtn       = document.getElementById('prev');
const nextBtn       = document.getElementById('next');
const exportBtn     = document.getElementById('export');
const importBtn     = document.getElementById('import');
const importFile    = document.getElementById('importFile');
const rasterizeBtn  = document.getElementById('rasterize');
const backToTextBtn = document.getElementById('backToText');

// OBJECTツール
const toolTextBtn        = document.getElementById('toolTextBtn');
const toolTextInput      = document.getElementById('toolTextInput');

// カラー
const colorSwatches = document.querySelectorAll('.color-swatch');
const customColor   = document.getElementById('customColor');

// SNAP / DRAW
const snapCenterToggle = document.getElementById('snapCenterToggle');
const drawModeToggle   = document.getElementById('drawModeToggle');

// レイヤーパネル / Code Space パネル
const layerList       = document.getElementById('layerList');
const canvasCode      = document.getElementById('canvasCode');
const copyCodeBtn     = document.getElementById('copyCode');
const generateCodeBtn = document.getElementById('generateCode');
const previewCodeBtn  = document.getElementById('previewCode');
const codePreviewArea = document.getElementById('codePreviewArea');
const codePreviewImg  = document.getElementById('codePreviewImg');
const codeErrorMsg    = document.getElementById('codeErrorMsg');

// 画像挿入 / 書き出し
const imageFile          = document.getElementById('imageFile');
const exportImageBtn     = document.getElementById('exportImage');
const exportAllImagesBtn = document.getElementById('exportAllImages');

// ===== スライドデータ =====
// slides[i] = { text, raster: { fontSize, layers:[layer...] } | null, name, essayText }
// layer = { kind:'char'|'image'|'shape'|'stroke', ... }
let slides = [{ text: '文字を視る', raster: null }];
let idx    = 0;

// ===== モード =====
let mode          = 'text'; // 'text' | 'raster'
let stageSelected = false;

// ===== ラスタオブジェクト =====
let charLayer   = null;
let charObjects = []; // { el, data, kind }

// ===== ドラッグ / リサイズ =====
let draggingObj       = null;
let dragStartScreenX  = 0;
let dragStartScreenY  = 0;
let dragStartLogicX   = 0;
let dragStartLogicY   = 0;

let sizeEditMode      = false;
let resizingObj       = null;
let resizeStartScreenY = 0;
let resizeStartSize    = 0;

// ===== 選択 =====
let selectedObj = null;
let selectedSet = [];

// ===== レイヤー並べ替え =====
let currentLayerItems = [];
let dragLayerIndex    = null;

// ===== Undo / Redo =====
let undoStack   = [];
let redoStack   = [];
let isRestoring = false;

// ===== カラー =====
let currentColor = getInkColor(); // constants.js で定義

// ===== スナップ =====
let snapCenterEnabled = false;

// ===== 画像挿入（ダブルクリック） =====
let pendingImagePos = null;

// ===== 手書きモード =====
let drawMode      = false; // ON/OFF
let drawing       = false; // 描画中
let erasing       = false; // 消しゴム中（Shift押下）
let currentStroke = null;  // 現在の1本の線レイヤー
let drawCanvas    = null;
let drawCtx       = null;

// ===== ズーム / パン =====
let stageZoom         = 1.0;
let stagePanX         = 0;
let stagePanY         = 0;
let isMiddlePanning   = false;
let middlePanStartX   = 0;
let middlePanStartY   = 0;
let middlePanStartPanX = 0;
let middlePanStartPanY = 0;
