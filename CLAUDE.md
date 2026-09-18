# VocaVault

英単語学習 PWA。仕様は docx/VocaVault_PWA_v1.0.md が唯一の正。docx/archive/ は旧設計で参考のみ。

## コマンド
- npm run dev      開発サーバー
- npm run build    型チェックとビルド（dist/）
- npm test         ユニットテスト（vitest run）
- npm run preview  ビルド結果の確認

## 方針
- 利用者は本人1人。iPhone Safari のホーム画面追加のみ対応。
- 費用ゼロ。有料サービス、有料 API、サーバーは使わない。
- 実行時依存は react, react-dom, react-router-dom, dexie, ts-fsrs のみ。増やさない。
- 外部通信は静的ファイルの取得のみ。分析、広告、フォント CDN を入れない。
- FSRS は ts-fsrs をそのまま使う。独自の数式やルールを足さない。
- 設計書に書いていないことは、最も単純で削除しやすい実装を選ぶ。質問はできない前提で進め、判断した内容を PR 説明に書く。

## 完了条件
- npm run build と npm test が通る。
- 設計書 12-2 の項目を満たす。
- 設計書 14 章の実機確認は利用者が行うため、対象外。

## やらないこと
- 課金、アカウント、同期、Web Push、サーバー。
- 発音再生、例文フィールド、紙吹雪。
