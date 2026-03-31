# 縦書き紙芝居エディタ

## プロジェクト概要
ブラウザで動く縦書き紙芝居エディタ。HTML / CSS / Vanilla JS のみ（サーバー不要）。
ページごとにテキスト・画像・図形・手書きを配置し、`.kmshb`（zip）形式でファイル保存できる。

## ファイル構成
```
c:/diaryWeb/
├── index.html       # エントリーポイント。UIレイアウトとパネル定義
├── css/style.css    # 全スタイル。レスポンシブ対応済み（@media含む）
└── js/app.js        # アプリロジック全体（約2000行）
```

## 技術スタック
- **JSZip 3.10.1**（CDN）：`.kmshb` ファイルの zip 生成・読込
- **IndexedDB**：自動保存ストレージ（旧 localStorage からマイグレーション済み）
- **Noto Sans JP**（Google Fonts）：縦書きフォント
- ライブラリ追加は原則禁止

## 主要な定数・概念
| 定数 | 値 | 説明 |
|------|-----|------|
| `LOGICAL_W / LOGICAL_H` | 1080 / 720 | 論理キャンバスサイズ（実際の表示サイズとは別） |
| `THUMB_W / THUMB_H` | 200 / 133 | サムネイルサイズ |
| `IDB_KEY` | `'default'` | IndexedDB の保存キー |
| `LS_KEY` | `'kamishibai_pages_v8'` | 旧 localStorage キー（マイグレーション用のみ） |

## データ構造
各スライドは `slides[]` 配列で管理。1スライドの構造：
```js
{
  text: string,         // テキストモードの本文
  raster: {             // ラスタライズ後のレイヤーデータ
    layers: [
      { kind: 'char', ch, logicX, logicY, baseSize, color, ... },
      { kind: 'image', src, logicX, logicY, baseW, baseH, ... },
      { kind: 'shape', shape, logicX, logicY, baseSize, color, ... },
      { kind: 'stroke', points: [{x,y}], color, width, ... },
    ]
  }
}
```

## ファイル保存（.kmshb）
- zip 内構成： `data.json`（スライドデータ）＋ `images/img_N.ext`（抽出した画像）
- 画像は Base64 → 実ファイルに変換して保存、読込時に Base64 へ復元
- ファイル名・保存先は `showSaveFilePicker`（非対応ブラウザは `<a download>` フォールバック）

## 表示切替（パネル / UI）
- `data-target` 属性で対象要素を指定した `.view-toggle` ボタンで表示/非表示
- `panel-hidden` クラスで非表示（`display: none !important`）
- 対象：OBJECTS パネル / LAYERS パネル / CANVAS CODE パネル / サムネイル / Usage フッター

## 作業方針
- コメントは日本語で書く
- 新しいライブラリは追加しない
- `app.js` に機能を追加するときは既存の命名規則（camelCase）に合わせる
- CSS 変更時は `@media` クエリの影響範囲も確認する
- `LOGICAL_W / LOGICAL_H` を直接参照し、DOM サイズに依存しない座標計算を行う
