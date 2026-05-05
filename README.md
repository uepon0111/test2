# GitHub Pages 動画再生ページ

## ファイル構成
- `index.html` : 画面の骨組み
- `styles.css` : 白基調・再生画面の黒背景・レスポンシブレイアウト
- `storage.js` : IndexedDB への保存・読み出し・削除
- `app.js` : 一覧画面、再生画面、タグ編集、マーカー、ループ制御

## 使い方
1. このフォルダを GitHub Pages の公開対象に置く
2. `index.html` を開く
3. 「追加」から動画を登録する

## 保存内容
- 動画本体: IndexedDB
- 表示名、タグ、マーカー、ループ区間: IndexedDB
- service worker / cache API は使っていないため、削除時はオブジェクト URL を破棄し、DB からも削除する
