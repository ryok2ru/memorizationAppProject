# 実装メモ（初期実装）

設計書 `docx/VocaVault_PWA_v1.0.md` を正として実装した際の、差異・判断・未確認事項の記録。

## 設計書との差異

- **FSRS の learning_steps を `['10m']` から `['10m', '10m']` に変更**（`src/domain/fsrs.ts`）。ts-fsrs 5.4.2 の `BasicLearningStepsStrategy` は、New カードで Good を押すと「次のステップ」に進む扱いで、ステップが 1 段だと Good で直接 Review（2 日後）に進む。設計書 5-2 の理由欄「新しい単語はセッション内で 1 回再出題されてから Review に進む」、5-3 の遷移「New → Good → Learning（10 分後）→ Good → Review」、12-1 のテスト「New に Good で state = 1 と due が約 10 分後」を満たすため、学習ステップを 2 段にした。副作用として New に Hard を押した場合は 10 分後 → もう 1 度 10 分後 → Review と 2 回再出題される。`relearning_steps` は `['10m']` のままで、Review → Again → Relearning（10 分後）→ Good → Review と設計どおり 1 回再出題になる。設計書の文字どおり `['10m']` に戻す場合はこの 1 行を変更し、`fsrs.test.ts` の「New + Good」の期待値を state = 2 に直せばよい。
- **`index.html` に `<link rel="icon" href="icons/icon-192.png">` を追加**。8-2 の head には無いが、ブラウザが自動要求する `/favicon.ico` の 404 を避けるため。外部通信は増えない。
- **Vitest は 3.x**。4.x は npm 10.9 の依存解決バグ（`Cannot read properties of null (reading 'edgesOut')`）でインストールできなかった。Vite 7.3、@vitejs/plugin-react 5.2、TypeScript 5.9、React 18.3、react-router-dom 6.30、Dexie 4.4、ts-fsrs 5.4.2、vite-plugin-pwa 1.3、fake-indexeddb 6.2。
- **アプリ情報のバージョン**は Vite の `define` で `__APP_VERSION__` に `package.json` の version を注入して表示する。
- **`SessionState` に `lastDue: Record<string, number>` を追加**。結果画面の「次回最も早い復習日」（6-6）に必要な「評価した単語の更新後 due」を持つため。`context` は `{ scope: 'all' | folderId, kind: 'review' | 'new' }` で 6-1 の 4 種を表す。
- **リポジトリ構成に無いファイルを追加**: `src/ui/hooks.ts`（セッション購読・非同期ロード）、`src/ui/useStudy.ts`（学習画面共通の評価・保存・終了処理）、`src/ui/SwContext.tsx`（更新通知を設定画面と共有）、`src/ui/components/Header.tsx`、`InputDialog.tsx`（フォルダ名入力）、`Switch.tsx`。`scripts/gen-icons.mjs`（PNG 生成。zlib のみで依存追加なし。`npm run icons`）。生成した PNG はリポジトリに含めた。
- **DB リポジトリに追加した関数**: `countReviewsBetween`（結果画面の「当日初の学習」判定用）、`readSnapshot` / `replaceAll` / `clearAll`（バックアップ用）。

## 自分で判断した点

- 単語フォームの「必須項目が空」は保存ボタンの非活性だけで示し、赤字は文字数超過のときだけ出す（7-4 は「超過項目の下に赤字で理由」）。
- フォルダ行の「…」は `<dialog>` のアクションシート（名前を変更 / 削除 / キャンセル）。
- モード選択でキューが空のときのタイトルは復習側の文言（「全フォルダを復習する」「学習を始める（フォルダ名）」）。
- 単語一覧の検索は英語・日本語訳を小文字化した部分一致。300ms のデバウンス。
- 結果画面の「当日初の学習」は、セッション開始時刻より前に当日の ReviewLog が無かったかどうかで判定する。
- フラッシュカードのスワイプは Pointer Events で実装。8px 未満の移動はタップとして反転に使う。移動量 60px 以上で方向確定。表面ではスワイプもボタンも無効。
- タイプ入力では判定後にメモを表示する（設計書に記載なし。表面では見せない）。
- 結果画面で 1 枚も評価していないときの「次回最も早い復習日」は「—」。
- 10-4 の「書き込み失敗は 1 回再試行」は評価保存（`rateAndSave`）に実装。その他の書き込みは失敗時にメッセージを表示するだけ。`QuotaExceededError` は「端末の空き容量が不足しています」。
- バックアップ読み込み時の settings は既定値とマージし、`id` と `schemaVersion` を固定する。
- 通知の `finishToday()` は設計どおり `lastNotifyScheduledAt` / `lastNotifyItemCount` を保存してから URL を開く。件数 0 の日は項目に含めないため、`lastNotifyItemCount` は「項目のある日数」になる。
- `npm run build` の `base` は `BASE_PATH` 環境変数（既定 `/`）。GitHub Actions では `/<リポジトリ名>/`。
- 8-5 の永続化要求は、最初のフォルダ作成または単語登録時に一度だけ呼ぶ。
- バッジ更新は起動時（ホーム表示時）、セッション完了時、単語の追加・削除・取込・進捗リセット・バックアップ読み込み時に行う。

## 確認できなかった点

- iPhone 実機の挙動全般（standalone 表示、共有シートからの「ファイルに保存」、`shortcuts://` URL の起動、アプリバッジ、`visualViewport` によるスクロール調整、`lang` 属性によるキーボード切替、ダークモードの実機表示）。第 14 章の項目は利用者確認。
- `navigator.share` によるファイル共有: ヘッドレス Chromium では `canShare` が無いため `<a download>` の経路のみ確認した。
- `navigator.setAppBadge`: ヘッドレス Chromium では未対応のため no-op になることのみ確認。
- Service Worker の更新バナー: 登録は確認したが、2 回目のデプロイで `needRefresh` が立つ流れは再現していない。
- GitHub Actions のデプロイ: ワークフローは設計書 13-3 のとおりに置いたが、main へのマージ後にしか実行されない。Settings → Pages の Source を「GitHub Actions」にする作業は手動。
- Shortcut「VocaVault通知」本体（9-6 のとおりエージェントは作成・検証できない）。

## ヘッドレスブラウザで確認した内容（12-2 の 3）

`npm run preview` に対して Playwright（Chromium）で、ホーム表示 → フォルダ作成（重複名の拒否） → 単語登録 3 件（文字数超過の赤字と保存非活性、変更破棄の確認） → 検索・フィルター・件数表示 → CSV 取込（BOM、ヘッダー、引用符内カンマ、重複、形式エラーの件数報告）と TSV 取込 → 単語の編集と削除 → 設定変更（最大枚数、表示順、通知 ON、時刻、日数）の永続化 → フラッシュカード 1 周（表面でボタン無効、反転、プレビューラベル、右スワイプ = Good、結果画面、ストリーク表示） → 英→日タイプ入力 1 周（不正解の ✕ と正解表示、正解の ✓、スキップ、`lang` 属性） → 日→英の途中終了 → バックアップ書き出し（ファイル名と内容） → 進捗リセット → 不正ファイルの拒否とバックアップ読み込みによる復元 → フォルダ名変更 → ダークモードの背景色 → 320px 幅で横スクロールなし → `sw.js` と `manifest.webmanifest` の配信と Service Worker 登録、を確認した（70 項目すべて成功、ページエラーなし）。
