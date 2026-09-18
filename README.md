# VocaVault

FSRS で復習日を決める英単語学習 PWA。iPhone の Safari から「ホーム画面に追加」して使う、本人 1 人向けのアプリ。仕様は `docx/VocaVault_PWA_v1.0.md`、実装時の判断は `docx/implementation-notes.md`。

## 開発

```
npm install
npm run dev       # 開発サーバー
npm test          # ユニットテスト（vitest run）
npm run build     # 型チェックとビルド（dist/）
npm run preview   # ビルド結果の確認
npm run icons     # public/ のアイコン PNG を再生成
```

Node.js 20 以上。

## デプロイ

`main` に push すると `.github/workflows/deploy.yml` が GitHub Pages にデプロイする。リポジトリの Settings → Pages で Source を「GitHub Actions」にしておく。
