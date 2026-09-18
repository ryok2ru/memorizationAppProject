# VocaVault 設計書（個人利用 PWA 版）

Version 1.0　2026年9月18日

| 項目 | 内容 |
|---|---|
| 対象 | 英単語学習アプリ VocaVault を、本人1人が iPhone で使う PWA として作り直す |
| 位置づけ | 本書が唯一の正となる設計書。`docx/archive/` の旧3書（`requirements.md` = 旧要件定義書 v1.5、`screens.md` = 旧画面設計書 v1.7、`architecture.md` = 旧技術設計書 v1.4）は参考資料であり、本書と食い違う場合は本書を優先する |
| 参考資料 | `docx/Spaced Repetition in Vocabulary Learning.pdf`（記憶科学と間隔反復の調査資料） |
| 実装形態 | 本書を GitHub リポジトリにコミットし、クラウド上の自律エージェントが質問なしで実装を完走できる粒度で記述する |

---

## 目次

1. 概要と前提
2. 機能一覧
3. アーキテクチャと技術スタック
4. データモデル
5. FSRS スケジューリング
6. 学習セッション仕様
7. 画面仕様
8. PWA 仕様
9. 通知連携
10. 設定とデータ管理
11. 非機能要件
12. テストと完了条件
13. 開発・ビルド・デプロイ手順
14. 実機確認項目
15. 旧設計からの変更対照表
16. 未確定事項と将来候補
- 付録A. リポジトリ直下に置く CLAUDE.md の内容
- 付録B. 型定義と Dexie スキーマの原文

---

## 1. 概要と前提

### 1-1. 目的

FSRS（Free Spaced Repetition Scheduler）で復習日を決める英単語帳を、iPhone のホーム画面から起動する PWA として実装する。利用者は作者本人のみ。

### 1-2. 前提（変更不可）

| 前提 | 内容 |
|---|---|
| 利用者 | 本人1人。アカウント、ログイン、権限、課金は存在しない |
| 端末 | iPhone のみ。Safari から「ホーム画面に追加」した状態で使う。PC や Android は考慮しない |
| 費用 | ゼロ。有料サービス、有料 API、有料プランは使わない |
| データの置き場所 | 端末内の IndexedDB のみ。サーバーもクラウド同期も持たない。複数端末での共有はしない |
| バックアップ | 本人が JSON を書き出して保管する。復元は JSON の読み込みで行う |
| 外部通信 | 初回ロードと更新時に静的ファイルを取得するだけ。それ以外の通信はしない |
| 通知 | Web にはスケジュール型のローカル通知が無い。iOS の Shortcuts とリマインダーを使って実現する（第9章） |
| オフライン | 一度インストールすれば、通信なしで全機能が動く |

### 1-3. 用語

| 用語 | 定義 |
|---|---|
| カード | 単語1件に付随する FSRS の記憶状態。本書では単語レコードに内包する |
| state | FSRS の学習状態。0 = New（未学習）、1 = Learning（学習中）、2 = Review（復習段階）、3 = Relearning（再学習中） |
| due | 次回復習日時（ミリ秒のエポック値） |
| 今日 | 端末のローカル時刻での当日 0:00 から 23:59:59.999 まで |
| 今日の復習数 | state ≠ 0 かつ due ≤ 今日の終わり の単語数 |
| 復習セッション | 今日の復習数が 1 以上のときに始めるセッション |
| New のみセッション | 今日の復習数が 0 で state = 0 の単語があるときに始めるセッション |
| ストリーク | 学習記録（ReviewLog）がある日が途切れず続いている日数 |

---

## 2. 機能一覧

「初期実装」は最初のリリースに含める。「あとで」は含めないが設計上の障害を作らない。「やらない」は今後も実装しない。旧 F-ID は `docx/archive/requirements.md`（旧要件定義書 v1.5）の機能番号。

| ID | 機能 | 区分 | 理由・備考 | 旧 F-ID |
|---|---|---|---|---|
| W-01 | 単語の登録・編集・削除 | 初期実装 | 基本機能 | F01, F02, F03 |
| W-02 | 単語一覧（英語・日本語訳・状態アイコン・復習予定日） | 初期実装 | 復習予定日の相対表示は追加要望 | F04, F06 |
| W-03 | 一覧のフィルター（すべて / 要復習 / 習得済み） | 初期実装 | | F04-2 |
| W-04 | 単語の検索 | 初期実装 | | F05 |
| W-05 | CSV / TSV 取込 | 初期実装 | 数千語を手入力しないため | F09 |
| F-01 | フォルダの作成・編集・削除・一覧 | 初期実装 | | F10, F11, F12, F13 |
| F-02 | フォルダの並び替え | あとで | sortOrder は保持するが UI は作らない | F14 |
| S-01 | フラッシュカード学習（4段階評価、ボタンとスワイプ） | 初期実装 | | F15, F16 |
| S-02 | タイプ入力学習（英→日、日→英） | 初期実装 | | F17, F18 |
| S-03 | 復習セッションと New のみセッション | 初期実装 | | F19 |
| S-04 | 進捗表示（残り / 完了） | 初期実装 | | F20 |
| S-05 | セッション結果画面 | 初期実装 | 紙吹雪は入れない | F21 |
| S-06 | 学習モード選択と全フォルダ一括 | 初期実装 | | F22 |
| A-01 | FSRS による次回復習日の算出、初期状態、ReviewLog 記録、復習対象の抽出 | 初期実装 | ts-fsrs を使う | F23, F24, F25, F26 |
| A-02 | FSRS パラメータの個人最適化 | あとで | fsrs-browser が候補。ReviewLog を ts-fsrs の形式で保存しておく | F27 |
| A-03 | 85% ルールによる難易度調整 | やらない | FSRS がカード単位で適応するため不要 | F28 |
| N-01 | 「今日の学習を終える」ボタンと通知予約 | 初期実装 | Shortcuts 経由でリマインダーに予約 | F29, F31 |
| N-02 | アプリバッジに今日の復習数 | 初期実装 | | 新規 |
| N-03 | 通知許可のソフトプロンプト | やらない | 本人が使うだけ | F30 |
| N-04 | 復習完了後の通知キャンセル | やらない | 完了ボタンで予約を作り直すので不要 | F32 |
| H-01 | ホームの今日の復習サマリー | 初期実装 | | F33 |
| H-02 | ストリーク表示 | 初期実装 | | F33 |
| H-03 | 状態別の件数と割合 | 初期実装 | 追加要望。ホームとフォルダ画面に横棒で表示 | F34 の簡易版 |
| H-04 | 統計ダッシュボード、ストリーク詳細、記憶状態詳細 | あとで | | F34, F35, F36 |
| C-01 | 1セッションの最大枚数と表示順の設定 | 初期実装 | 既定 30 枚 | F38 |
| C-02 | 進捗リセット（フォルダ単位 / 全体） | 初期実装 | ストリークの3層表示は入れない | F39 |
| C-03 | JSON バックアップの書き出しと読み込み | 初期実装 | クラウド同期の代替 | F40 の代替 |
| C-04 | 通知時刻と予約日数の設定 | 初期実装 | | F37 |
| P-01 | インストール、オフライン動作、更新通知 | 初期実装 | | 新規 |
| X-01 | 例文フィールド | やらない | メモで代替 | F07 |
| X-02 | 発音再生 | やらない | | F08 |
| X-03 | クラウド同期 | やらない | | F40 |

---

## 3. アーキテクチャと技術スタック

### 3-1. 構成

静的ファイルとして配信する単一ページアプリ。ブラウザ内で完結し、サーバー側のコードは持たない。

```
GitHub Pages（静的配信）
   │ 初回ロード・更新時のみ
   ▼
iPhone Safari（ホーム画面に追加）
   ├─ Service Worker（アプリシェルをキャッシュ。オフライン起動）
   ├─ アプリ本体（React）
   ├─ IndexedDB（単語・フォルダ・学習履歴・設定）
   └─ 「今日の学習を終える」→ shortcuts:// → Shortcuts → リマインダー（通知）
```

### 3-2. 技術スタック

| 用途 | 採用 | 版 | 備考 |
|---|---|---|---|
| 言語 | TypeScript | 5.x | `strict: true` |
| UI | React | 18.x | 関数コンポーネントとフックのみ |
| ルーティング | react-router-dom | 6.x | HashRouter を使う。GitHub Pages で直接アクセスしても 404 にならない |
| ビルド | Vite | 5.x 以上 | |
| PWA | vite-plugin-pwa | 最新 | Workbox でアプリシェルを precache |
| DB | Dexie | 4.x | IndexedDB のラッパー |
| FSRS | ts-fsrs | 5.4.x | FSRS-6。MIT |
| テスト | Vitest | 最新 | `fake-indexeddb` を DB テストに使う |
| CSS | 素の CSS | | UI ライブラリは使わない。CSS 変数で配色を定義 |
| ID | `crypto.randomUUID()` | | |

依存パッケージはこれ以上増やさない。必要になった場合は CLAUDE.md の方針に従い最小のものを選ぶ。

### 3-3. レイヤーと責務

| レイヤー | ディレクトリ | 責務 | 依存してよいもの |
|---|---|---|---|
| UI | `src/ui/` | 画面、コンポーネント、ルーティング | app、domain の型 |
| アプリケーション | `src/app/` | セッション進行、キュー構築、通知予約 JSON、統計、バックアップ、CSV | domain、db |
| ドメイン | `src/domain/` | 型、FSRS ラッパー、正規化、バリデーション、日付計算 | ts-fsrs のみ |
| DB | `src/db/` | Dexie の定義とリポジトリ関数 | domain の型、dexie |

UI から db を直接呼ばない。app 層の関数を経由する。

### 3-4. リポジトリ構成

```
/
├─ .github/workflows/deploy.yml
├─ CLAUDE.md                      （付録A）
├─ README.md
├─ docx/                          （本書と参考資料）
├─ index.html
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ vitest.config.ts
├─ public/
│   ├─ icons/icon-192.png
│   ├─ icons/icon-512.png
│   ├─ icons/icon-512-maskable.png
│   └─ apple-touch-icon.png       （180x180）
└─ src/
    ├─ main.tsx
    ├─ App.tsx                    （ルーター定義）
    ├─ domain/
    │   ├─ types.ts               （付録B）
    │   ├─ fsrs.ts                （ts-fsrs ラッパー）
    │   ├─ normalize.ts
    │   ├─ validation.ts
    │   └─ dates.ts
    ├─ db/
    │   ├─ db.ts                  （付録B）
    │   └─ repo.ts                （CRUD とクエリ）
    ├─ app/
    │   ├─ queue.ts               （キュー構築）
    │   ├─ session.ts             （セッション状態と評価処理）
    │   ├─ streak.ts
    │   ├─ stats.ts               （状態別集計、今日の復習数）
    │   ├─ notify.ts              （予約 JSON と shortcuts URL）
    │   ├─ badge.ts
    │   ├─ backup.ts
    │   ├─ csv.ts
    │   └─ settings.ts
    ├─ ui/
    │   ├─ screens/
    │   │   ├─ Home.tsx
    │   │   ├─ WordList.tsx
    │   │   ├─ WordForm.tsx
    │   │   ├─ ModeSelect.tsx
    │   │   ├─ Flashcard.tsx
    │   │   ├─ Typing.tsx
    │   │   ├─ Result.tsx
    │   │   └─ Settings.tsx
    │   ├─ components/            （SummaryCard, StateBar, ProgressBar, ConfirmDialog, EmptyState, UpdateBanner）
    │   └─ styles/                （tokens.css, base.css）
    └─ sw（vite-plugin-pwa が生成。手書きしない）
```

テストは対象ファイルの隣に `*.test.ts` として置く。

### 3-5. package.json のスクリプト

| スクリプト | 内容 |
|---|---|
| `dev` | `vite` |
| `build` | `tsc --noEmit && vite build` |
| `preview` | `vite preview` |
| `test` | `vitest run` |
| `test:watch` | `vitest` |

---

## 4. データモデル

### 4-1. テーブル一覧

| テーブル | 主キー | 内容 |
|---|---|---|
| `folders` | id | フォルダ |
| `words` | id | 単語。FSRS のカード状態を内包する |
| `reviewLogs` | id | 評価のたびに追記する学習履歴。追記専用 |
| `settings` | id | 設定。レコードは `id = "app"` の1件のみ |

旧設計では Word と FSRSCard を別エンティティにしていたが、1対1なので1レコードに統合する。

### 4-2. Folder

| 属性 | 型 | 説明 |
|---|---|---|
| id | string | UUID |
| name | string | 1〜50 文字。trim 後に非空。大文字小文字を区別せず一意 |
| createdAt | number | 作成日時（ms） |
| sortOrder | number | 表示順。作成時は既存の最大値 + 1。並び替え UI は作らない |

### 4-3. Word

| 属性 | 型 | 説明 |
|---|---|---|
| id | string | UUID |
| folderId | string | 所属フォルダ |
| englishTerm | string | 1〜200 文字。trim 後に非空 |
| japaneseDefinition | string | 1〜500 文字。カンマ区切りで複数候補を書ける |
| memo | string | 0〜1000 文字 |
| createdAt | number | 作成日時（ms） |
| updatedAt | number | 更新日時（ms） |
| due | number | 次回復習日時（ms）。ts-fsrs の `Card.due` を数値化したもの |
| stability | number | 安定性 |
| difficulty | number | 難易度 |
| elapsed_days | number | ts-fsrs の同名フィールド |
| scheduled_days | number | 同上 |
| learning_steps | number | 同上 |
| reps | number | 同上 |
| lapses | number | 同上 |
| state | 0 \| 1 \| 2 \| 3 | 学習状態 |
| last_review | number \| null | 最終評価日時（ms）。未評価なら null |

`due` 以降は ts-fsrs の `Card` 型と1対1に対応させ、`toCard(word)` と `fromCard(word, card)` で相互変換する（第5章）。新規登録時は `createEmptyCard(now)` の値を入れる。

### 4-4. ReviewLog

ts-fsrs の `ReviewLog` 型をそのまま保存し、`id` と `wordId` を足す。将来の個人最適化（fsrs-browser）にそのまま渡せる形にしておく。

| 属性 | 型 | 説明 |
|---|---|---|
| id | string | UUID |
| wordId | string | 対象単語 |
| rating | 1 \| 2 \| 3 \| 4 | Again / Hard / Good / Easy |
| state | 0〜3 | 評価前の状態 |
| due | number | 評価前の due（ms） |
| stability | number | 評価前の安定性 |
| difficulty | number | 評価前の難易度 |
| elapsed_days | number | |
| last_elapsed_days | number | |
| scheduled_days | number | |
| learning_steps | number | |
| review | number | 評価日時（ms） |

単語を削除したときは、その単語の ReviewLog も削除する。進捗リセットでは削除しない。

### 4-5. Settings（id = "app"）

| 属性 | 型 | 既定値 | 説明 |
|---|---|---|---|
| id | "app" | | 固定 |
| maxCardsPerSession | number | 30 | 10〜100、10 刻み |
| cardOrder | "dueFirst" \| "random" | "dueFirst" | モード選択画面のシャッフルトグルの初期値 |
| notifyEnabled | boolean | false | 通知予約を行うか |
| notifyTime | string | "08:00" | HH:MM（24時間） |
| notifyDays | number | 7 | 予約日数。1〜30 |
| lastNotifyScheduledAt | number \| null | null | 最後に「今日の学習を終える」を押した日時 |
| lastNotifyItemCount | number | 0 | そのとき予約した件数 |
| schemaVersion | number | 1 | バックアップ JSON の互換確認用 |

### 4-6. インデックス

| テーブル | インデックス | 用途 |
|---|---|---|
| folders | sortOrder | 一覧の並び |
| words | folderId | フォルダ内一覧 |
| words | due | 復習対象の抽出、通知予約の計算 |
| words | state | New の抽出、状態別集計 |
| words | [folderId+due] | フォルダ内の復習対象 |
| words | [folderId+state] | フォルダ内の New と状態別集計 |
| reviewLogs | wordId | 単語削除時のカスケード |
| reviewLogs | review | ストリーク計算 |

検索（英語・日本語訳の部分一致）はフォルダ内の単語をメモリに読み込んでフィルターする。数千語なら十分速い。

### 4-7. スキーマ更新の方針

Dexie の `version(n).stores()` を増やしていく。既存レコードの変換が必要なら `upgrade()` に書く。バックアップ JSON の `schemaVersion` は Dexie のバージョンと同じ番号にする。

---

## 5. FSRS スケジューリング

### 5-1. 方針

ts-fsrs をそのまま使う。旧設計の自前実装と独自ルール（Easy 成熟度ゲート、New から Easy を Learning 経由にする変更）は採用しない。理由は、旧設計の数式が参照実装と一致しておらず、独自ルールに記憶効果の裏付けがないため（第15章）。

### 5-2. 設定値

```ts
import { fsrs, generatorParameters } from 'ts-fsrs';

export const scheduler = fsrs(generatorParameters({
  request_retention: 0.9,
  maximum_interval: 36500,
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: ['10m'],
  relearning_steps: ['10m'],
}));
```

| 項目 | 値 | 理由 |
|---|---|---|
| パラメータ w | ts-fsrs の既定値（FSRS-6、21 個） | 公開データで最適化された値 |
| request_retention | 0.9 | FSRS の標準 |
| enable_short_term | true | 学習直後の再出題を FSRS の枠内で扱う。4状態が自然に発生し、状態表示に使える |
| learning_steps | 10 分 1 段 | 新しい単語はセッション内で 1 回再出題されてから Review に進む。調査資料が推奨する学習直後の再想起に対応する |
| relearning_steps | 10 分 1 段 | Again の単語はセッション内で 1 回再出題されてから復帰する |
| enable_fuzz | false | 個人の小規模データでは不要 |

### 5-3. 評価値と状態

| 評価 | ts-fsrs の Rating | UI 表示 | 色 |
|---|---|---|---|
| Again | 1 | もう一度 | Again 色 |
| Hard | 2 | 難しい | Hard 色 |
| Good | 3 | 普通 | Good 色 |
| Easy | 4 | 簡単 | Easy 色 |

| state | 名前 | アイコン | 説明 |
|---|---|---|---|
| 0 | New | ⬜ | 未学習 |
| 1 | Learning | 🟡 | 学習中（初回評価後、10 分ステップ待ち） |
| 2 | Review | 🟢 | 復習段階 |
| 3 | Relearning | 🔴 | Again 後の再学習中 |

状態遷移は ts-fsrs に任せる。概略: New → Good/Hard → Learning（10 分後）→ Good/Hard/Easy → Review。New → Easy → Review。Review → Again → Relearning（10 分後）→ Good/Hard/Easy → Review。Learning/Relearning → Again → 同じ状態でステップをやり直し。

### 5-4. ラッパー（`src/domain/fsrs.ts`）

| 関数 | 内容 |
|---|---|
| `toCard(word): Card` | Word の FSRS 項目を ts-fsrs の Card に変換。`due`、`last_review` は `new Date(ms)` |
| `fromCard(word, card): Word` | Card の値を Word に書き戻す。日時は `getTime()` |
| `newCardFields(now): Pick<Word, FSRS項目>` | `createEmptyCard(new Date(now))` の値を数値化して返す。登録時と進捗リセット時に使う |
| `rate(word, rating, now): { word: Word; log: ReviewLog }` | `scheduler.next(toCard(word), new Date(now), rating)` を呼び、更新後の Word と保存用 ReviewLog を返す。副作用なし |
| `preview(word, now): Record<Rating, { due: number; label: string }>` | `scheduler.repeat()` の結果から4評価の次回日時とラベル（「10分後」「今日」「3日後」）を返す |
| `retrievability(word, now): number` | `scheduler.get_retrievability(card, date, false)` |

プレビューのラベル: due − now が 60 分未満なら「N分後」、当日中なら「今日」、それ以外は `scheduled_days` を使って「N日後」。

### 5-5. 計算異常時の扱い

`rate()` の結果に NaN か Infinity が含まれる場合は、その評価を保存せず、直前の状態を維持し、`console.error` に出す。UI には「保存に失敗しました」と表示して次のカードへ進む。

---

## 6. 学習セッション仕様

### 6-1. セッションの種類とコンテキスト

| コンテキスト | 起点 | 対象 | 結果画面の「もう一度」 |
|---|---|---|---|
| 全フォルダ復習 | ホームのサマリーカード | 全単語のうち state ≠ 0 かつ due ≤ 今日の終わり | 同条件で再構築 |
| 全フォルダ New のみ | ホームのサマリーカード（復習 0 件のとき） | 全単語のうち state = 0 | 同条件で再構築 |
| フォルダ復習 | フォルダ画面の開始ボタン | そのフォルダの state ≠ 0 かつ due ≤ 今日の終わり | 同条件で再構築 |
| フォルダ New のみ | フォルダ画面の開始ボタン（復習 0 件のとき） | そのフォルダの state = 0 | 同条件で再構築 |

### 6-2. キュー構築（`src/app/queue.ts`）

1. 復習対象を due 昇順で取得する。0 件なら New を createdAt 昇順で取得し、種類を「New のみ」にする。どちらも 0 件なら空キューを返す。
2. 設定の `maxCardsPerSession` で先頭から切り詰める。復習と New のみの両方に適用する。
3. モード選択画面のシャッフルトグルが ON なら Fisher-Yates でシャッフルする。
4. 単語 id の配列を返す。

上限は初回出題の枚数に対するもので、セッション内の再出題（6-3）は数えない。

### 6-3. セッションの進行（`src/app/session.ts`）

セッション状態はメモリ上に持つ。ページを再読み込みしたらホームに戻る（評価は保存済みなので失われない）。

```ts
interface SessionState {
  context: SessionContext;                 // 6-1 の4種
  mode: 'flashcard' | 'enToJa' | 'jaToEn';
  queue: string[];                         // 単語 id。末尾に再出題分を追加する
  index: number;                           // 次に出す位置
  items: Record<string, { firstRating?: Rating; shownCount: number }>;
  startedAt: number;
  finishedAt?: number;
  endedEarly: boolean;
}
```

評価 `rate(wordId, rating)` の処理:

1. `domain/fsrs.rate()` で更新後の Word と ReviewLog を得る。
2. Dexie のトランザクションで Word の更新と ReviewLog の追加を同時に保存する。**この保存は評価のたびに即時に行う。**
3. `items[wordId].firstRating` が未設定なら今回の評価を入れる。
4. 更新後の state が 1 か 3（10 分ステップ待ち）なら、`wordId` をキューの末尾に追加する。
5. `index` を 1 進める。`index >= queue.length` ならセッション完了。

再出題は due を待たずに順番が来たら出す（学習中カードを前倒しで出す扱い）。キューの最後の1枚が再出題になった場合は連続して同じ単語が出るが、許容する。

途中終了（画面の ✕）: 確認ダイアログの後、`endedEarly = true` で結果画面へ。評価済みの分はすでに保存されている。未評価の単語は何もしない。

### 6-4. モード別の操作

**フラッシュカード**

| 操作 | 処理 |
|---|---|
| 表面をタップ | 裏面に反転。裏面には英単語（小）、日本語訳（大）、メモ（灰色）を表示 |
| 評価ボタン（4つ） | 各ボタンに `preview()` のラベルを表示。裏面のときだけ有効 |
| スワイプ | 下 = Again、左 = Hard、右 = Good、上 = Easy。移動量 60px 以上で確定。スワイプ中は方向に応じたラベルを重ねて表示。裏面のときだけ有効 |

**タイプ入力**

| 操作 | 処理 |
|---|---|
| 出題 | 英→日: 英単語を表示。日→英: 日本語訳を表示。入力欄に自動フォーカス |
| 判定（確認ボタンまたは Return） | 6-5 の判定。正解なら緑のチェックと正解、不正解なら赤の ✕ と正解（全候補）と入力値を表示 |
| 正解後 | Good と Easy の 2 ボタンを表示。選んだ評価で `rate()` |
| 不正解後 | 「次へ」ボタン。Again で `rate()`（再出題される） |
| スキップ | Hard で `rate()` |

入力欄の属性: 英→日は `lang="ja"`。日→英は `lang="en"`、`autoCapitalize="off"`、`autoCorrect="off"`、`spellCheck={false}`。

### 6-5. 正誤判定と正規化（`src/domain/normalize.ts`）

| モード | 手順 |
|---|---|
| 英→日 | 登録された日本語訳を `,`、`、`、`，` で分割し、各候補と入力値の両方に `normalizeJa()` を適用し、いずれかと完全一致すれば正解 |
| 日→英 | 英単語と入力値の両方に `normalizeEn()` を適用し、完全一致すれば正解 |

```ts
export const normalizeJa = (s: string) => s.trim().normalize('NFKC');
export const normalizeEn = (s: string) => s.trim().normalize('NFC').toLowerCase();
export const splitCandidates = (def: string) =>
  def.split(/[,、，]/).map(normalizeJa).filter((c) => c.length > 0);
```

NFKC により、全角英数字と記号は半角に、半角カタカナは全角カタカナになる。ひらがなとカタカナは統一しない（登録時の表記が正）。

### 6-6. 結果の集計

| 項目 | 定義 |
|---|---|
| 評価内訳 | `items` の `firstRating` を Again / Hard / Good / Easy で数える。再出題分は数えない |
| 正答率 | (Good + Easy) ÷ (Again + Hard + Good + Easy) × 100。小数点以下切り捨て |
| 所要時間 | `finishedAt − startedAt`。「3分22秒」形式 |
| 次回最も早い復習日 | 評価した単語の更新後 due の最小値。今日中なら「今日」、それ以外は「M月D日（N日後）」 |
| ストリーク更新 | セッション完了後に `streak.ts` を再計算し、当日初の学習なら「🔥 N日連続学習！」を表示 |

### 6-7. ストリーク（`src/app/streak.ts`）

1. `reviewLogs.review` をローカル日付キー（YYYY-MM-DD）に変換し、集合にする。
2. 今日から過去へ遡り、連続している日数を `current` とする。今日の記録がなければ昨日から遡る。
3. `isActiveToday` = 今日の記録がある。
4. `isBroken` = 今日も昨日も記録がなく、集合が空でない。このとき `current` は 0。
5. 表示: 集合が空なら「最初の学習を始めましょう！」。`isBroken` なら「昨日は学習をお休みしました。今日から再開しましょう！」。それ以外は「🔥 N日連続学習中！」。

ReviewLog が数万件になっても、`review` インデックスで全件の日付だけを読めば十分速い。キャッシュは作らない。

---

## 7. 画面仕様

### 7-1. 画面一覧とルート（HashRouter）

| 画面 | ルート | 説明 |
|---|---|---|
| ホーム | `#/` | サマリー、ストリーク、状態別割合、フォルダ一覧、学習を終えるボタン |
| 単語一覧 | `#/folders/:folderId` | 検索、フィルター、一覧、開始ボタン、取込 |
| 単語フォーム | `#/folders/:folderId/words/new`、`#/words/:wordId` | 登録と編集 |
| モード選択 | `#/study/select?scope=all` または `?scope=<folderId>` | 3 モードとシャッフル |
| フラッシュカード | `#/study/flashcard` | セッション状態がなければホームへ |
| タイプ入力 | `#/study/typing` | 同上 |
| 結果 | `#/study/result` | 同上 |
| 設定 | `#/settings` | |

共通: 画面上部にタイトルと戻るボタン（ホーム以外）。ホームの右上に設定アイコン。最大幅 480px で中央寄せ。

### 7-2. ホーム

| 要素 | 仕様 |
|---|---|
| サマリーカード | 3 分岐。①復習あり: 「今日の復習: N語」「予想時間: 約M分」（M = ceil(N × 30 ÷ 60)）。タップで全フォルダ復習のモード選択へ。②復習 0 件で New あり: 「新しい単語を学習しましょう（N語）」。予想時間なし。タップで全フォルダ New のみへ。③どちらも 0: 「今日の復習はありません」。タップ不可 |
| ストリーク | 6-7 の 3 パターン |
| 状態別割合 | 全単語の state 別件数と割合を 4 色の横棒で表示。下に凡例（New N / Learning N / Review N / Relearning N）。単語 0 件なら非表示 |
| フォルダ一覧 | 各行: フォルダ名、総単語数、今日の復習数。タップで単語一覧へ。行右端の「…」で編集（名前変更ダイアログ）と削除（確認ダイアログ。配下の単語と履歴も削除） |
| フォルダ追加 | 右上の「＋」。名前入力ダイアログ。バリデーションは 4-2 |
| 学習を終える | 「今日の学習を終える」ボタン。通知が ON のときだけ表示。押すと第9章の処理。下に「最終予約: M/D HH:MM、N日分」または「まだ予約していません」 |
| 空状態 | フォルダ 0 件: 「フォルダがありません。＋で追加してください」 |

### 7-3. 単語一覧

| 要素 | 仕様 |
|---|---|
| 検索欄 | 英語と日本語訳の部分一致。入力から 300ms 後に絞り込み。空なら全件 |
| フィルター | 「すべて」「要復習」「習得済み」。すべて = 全件、due 昇順。要復習 = state ≠ 0 かつ due ≤ 今日の終わり、due 昇順。習得済み = state = 2 かつ stability ≥ 30、createdAt 降順 |
| 件数表示 | フィルターか検索が効いているとき「N語中M語を表示中」 |
| 状態別割合 | このフォルダの単語で 7-2 と同じ横棒 |
| 一覧の行 | 英単語、日本語訳、状態アイコン、復習予定。復習予定: state = 0 は「未学習」、due の日付が今日より前は「N日超過」、今日は「今日」、明日は「明日」、それ以外は「N日後」。タップで編集へ |
| 単語追加 | 右上の「＋」 |
| 取込 | 右上メニューの「CSV/TSV 取込」。10-3 |
| 開始ボタン | 画面下部に固定。復習あり: 「学習開始（N語）」。復習 0 で New あり: 「新しい単語を学習（N語）」。どちらも 0: 非活性 |
| 空状態 | 「単語がありません。＋で追加するか取込してください」 |

### 7-4. 単語フォーム

| 要素 | 仕様 |
|---|---|
| タイトル | 新規: 「単語を追加」。編集: 「単語を編集」 |
| 英単語 | 必須。`lang="en"`、autoCapitalize/autoCorrect/spellCheck を無効。200 文字まで |
| 日本語訳 | 必須。プレースホルダー「例: 曖昧な,あいまいな（カンマ区切りで複数可）」。500 文字まで |
| メモ | 任意。複数行。1000 文字まで |
| 保存 | 必須項目が trim 後に空、または文字数超過なら非活性。超過項目の下に赤字で理由を表示。新規は `newCardFields()` を付けて保存 |
| キャンセル | 変更があれば「変更を破棄しますか？」 |
| 削除（編集時） | 赤字ボタン。確認後に単語と ReviewLog を削除して一覧へ |

### 7-5. モード選択

| 要素 | 仕様 |
|---|---|
| タイトル | 全フォルダ復習: 「全フォルダを復習する」。全フォルダ New: 「全フォルダ — 新しい単語を学習」。フォルダ復習: 「学習を始める（フォルダ名）」。フォルダ New: 「学習を始める（フォルダ名）— 新しい単語を学習」 |
| サマリー | 復習: 「復習 N語」と予想時間。New のみ: 「新しい単語を学習: N語」（予想時間なし） |
| モードボタン | 「フラッシュカード」「英→日 入力」「日→英 入力」。キューが空なら全て非活性で「学習できる単語がありません」 |
| シャッフル | トグル。初期値は設定の cardOrder（random なら ON）。ここでの変更は設定に保存しない |
| 戻る | 遷移元（ホームかフォルダ）へ |

### 7-6. フラッシュカード / タイプ入力

| 要素 | 仕様 |
|---|---|
| 進捗 | 上部に「残り N枚 / 完了 M枚」と横棒。残り = queue.length − index、完了 = 評価済みの単語数（再出題は数えない） |
| 本体 | 6-4 |
| 終了 | 右上の ✕ → 「セッションを終了しますか？」→ 結果画面 |

### 7-7. 結果

| 要素 | 仕様 |
|---|---|
| 見出し | 完了: 「セッション完了！」。途中終了: 「お疲れ様でした」 |
| 内訳 | Again / Hard / Good / Easy の件数を 4 色の横棒と数字で表示 |
| 正答率、所要時間、次回最も早い復習日 | 6-6 |
| ストリーク | 当日初の学習なら「🔥 N日連続学習！」 |
| 学習を終える | 通知が ON のとき「今日の学習を終える」ボタン（第9章）。ホームと同じ処理 |
| ホームへ | ホームへ戻る |
| もう一度 | 同じコンテキストでモード選択へ |

### 7-8. 設定

| セクション | 項目 |
|---|---|
| 学習 | 1セッションの最大枚数（10〜100、10 刻み、既定 30）。カード表示順の既定（復習優先 / ランダム） |
| 通知 | 通知予約 ON/OFF。通知時刻（time 入力、既定 08:00）。予約日数（1〜30、既定 7）。最終予約の表示。「Shortcut の設定方法」を開くと第9章 9-4 の手順を画面内に表示 |
| データ | バックアップを書き出す。バックアップを読み込む。CSV/TSV 取込の説明。進捗リセット（フォルダ選択または「すべて」→ 確認 → 実行） |
| アプリ情報 | バージョン（package.json の version）。ライセンス表記: ts-fsrs（MIT）、Dexie（Apache-2.0）、vite-plugin-pwa（MIT）。更新があれば「更新して再読み込み」ボタン |

### 7-9. 共通コンポーネント

| 名前 | 用途 |
|---|---|
| SummaryCard | ホームの 3 分岐カード |
| StateBar | 状態別割合の横棒と凡例 |
| ProgressBar | 学習画面の進捗 |
| ConfirmDialog | 削除、終了、リセット、破棄の確認。`<dialog>` 要素を使う |
| EmptyState | 空状態の文言 |
| UpdateBanner | Service Worker の更新通知 |

### 7-10. 配色（CSS 変数）

| 変数 | Light | Dark | 用途 |
|---|---|---|---|
| --accent | #2E5090 | #5B8FD4 | ボタン、選択状態 |
| --again | #FF3B30 | #FF453A | Again、不正解、Relearning |
| --hard | #FF9500 | #FF9F0A | Hard、Learning |
| --good | #34C759 | #30D158 | Good、正解、Review |
| --easy | #007AFF | #0A84FF | Easy |
| --bg | #FFFFFF | #000000 | 背景 |
| --fg | #1C1C1E | #F2F2F7 | 文字 |
| --muted | #8E8E93 | #8E8E93 | 補助文字 |

`prefers-color-scheme: dark` で Dark の値に切り替える。New 状態の色は `--muted`。

---

## 8. PWA 仕様

### 8-1. Manifest（vite-plugin-pwa の `manifest` に指定）

| 項目 | 値 |
|---|---|
| name / short_name | VocaVault |
| lang | ja |
| start_url / scope | `./` |
| display | standalone |
| background_color | #FFFFFF |
| theme_color | #2E5090 |
| icons | `icons/icon-192.png`（192）、`icons/icon-512.png`（512）、`icons/icon-512-maskable.png`（512、purpose: maskable） |

アイコンは単色背景に白の「V」を描いた PNG を生成して置く（ビルド時に生成しても、リポジトリに含めてもよい）。

### 8-2. index.html の head

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="VocaVault" />
<link rel="apple-touch-icon" href="apple-touch-icon.png" />
<meta name="theme-color" content="#2E5090" />
```

### 8-3. Service Worker

| 項目 | 内容 |
|---|---|
| 生成 | vite-plugin-pwa（`registerType: 'prompt'`）。手書きしない |
| precache | ビルド成果物の js / css / html / svg / png / woff2 |
| ナビゲーション | `navigateFallback: 'index.html'` |
| 更新 | `useRegisterSW()` の `needRefresh` が true になったら UpdateBanner に「新しいバージョンがあります」と「更新」ボタンを表示。押すと `updateServiceWorker(true)` |
| オフライン | precache のみで全画面が動く。外部リソースは読み込まない（フォントも同梱しない） |

### 8-4. vite.config.ts の要点

```ts
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png'],
      manifest: { /* 8-1 */ },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
});
```

### 8-5. ストレージの永続化

初回にユーザー操作（最初のフォルダ作成など）が起きたとき、一度だけ `navigator.storage?.persist?.()` を呼ぶ。結果は無視してよい。

### 8-6. iOS Safari 固有の扱い

| 事項 | 対応 |
|---|---|
| インストール | `beforeinstallprompt` は無い。ホームで「Safari の共有メニューから『ホーム画面に追加』」の案内を、standalone でない場合にだけ表示する（`window.matchMedia('(display-mode: standalone)')`） |
| セーフエリア | `padding: env(safe-area-inset-*)` を上下に適用 |
| 高さ | `100dvh` を使う |
| キーボード | タイプ入力画面は `visualViewport` の `resize` で入力欄が隠れないようスクロール位置を調整する |
| データ消失 | ブラウザタブで使うと未使用 7 日で消える可能性があるため、ホーム画面追加を前提にする。加えてバックアップの書き出しを設定画面で案内する |
| ファイル書き出し | 10-2 |
| URL スキーム | `window.location.href = 'shortcuts://...'` で開く。iOS の確認ダイアログが出る |

### 8-7. アプリバッジ

`'setAppBadge' in navigator` のときだけ動作する。起動時、セッション完了時、単語の追加・削除・取込・リセット時に「今日の復習数」を `navigator.setAppBadge(n)` で設定し、0 なら `navigator.clearAppBadge()`。バックグラウンドでは更新されないことを設定画面の説明に書く。

---

## 9. 通知連携

### 9-1. 仕組み

Web にはスケジュール型のローカル通知が無いため、iOS の Shortcuts とリマインダーを使う。

1. 利用者は PWA の設定で通知時刻と予約日数を決める。
2. 学習を終えたら「今日の学習を終える」ボタンを押す。
3. PWA は翌日から予約日数分の「その日の通知時刻までに溜まる復習数」を計算し、JSON にして `shortcuts://run-shortcut` で Shortcut「VocaVault通知」に渡す。
4. Shortcut は前回作ったリマインダーを消し、各日のリマインダーをアラート日時付きで作る。
5. リマインダーがその時刻に通知する。

費用も外部サービスも通信も不要。PWA に戻る必要はない。

### 9-2. 各日の件数の意味

日 d（1 ≤ d ≤ 予約日数）の件数 = 「これ以上学習しなかった場合に、日 d の通知時刻までに due になっている単語数」。state ≠ 0 かつ due ≤（今日 + d 日の通知時刻）で数える。期限切れの持ち越しを含む。

- 翌日分（d = 1）は学習を終えた時点の状態から計算するので正確。
- 2 日目以降は「学習を怠った場合」の見込み。学習してボタンを押せば全日程を作り直すので、見込みは常に最新の評価結果で上書きされる。
- 件数が 0 の日は項目に含めない。

### 9-3. PWA 側の処理（`src/app/notify.ts`）

```ts
interface NotifyItem { at: string; title: string }          // at は "YYYY-MM-DD HH:MM"（ローカル時刻）
interface NotifyPayload { v: 1; list: 'VocaVault'; items: NotifyItem[] }

export function buildNotifyPayload(words: Word[], settings: Settings, now: number): NotifyPayload;
export function buildShortcutUrl(payload: NotifyPayload): string;
```

- 本文: d = 1 は「今日は N語の復習があります」。d ≥ 2 は「復習が溜まっています。今日は N語」。
- URL: `shortcuts://run-shortcut?name=${encodeURIComponent('VocaVault通知')}&input=text&text=${encodeURIComponent(JSON.stringify(payload))}`
- ボタンを押したら `lastNotifyScheduledAt = now`、`lastNotifyItemCount = items.length` を保存してから URL を開く。
- 通知が OFF のときはボタン自体を表示しない。
- ホームには「最終予約: M/D HH:MM、N日分」を表示し、最終予約から 2 日以上経っていれば「予約を更新しましょう」を添える。

例:

```json
{"v":1,"list":"VocaVault","items":[
  {"at":"2026-09-19 08:00","title":"今日は12語の復習があります"},
  {"at":"2026-09-20 08:00","title":"復習が溜まっています。今日は20語"}
]}
```

### 9-4. Shortcut「VocaVault通知」の作り方（利用者が一度だけ行う）

事前準備: リマインダーアプリでリスト「VocaVault」を作る。

Shortcuts アプリで新規ショートカットを作り、名前を `VocaVault通知` にして、次のアクションを順に追加する。

| # | アクション | 設定 |
|---|---|---|
| 1 | 入力から辞書を取得 | 入力: ショートカットの入力 |
| 2 | リマインダーを検索 | フィルター: リスト が VocaVault、かつ 完了済み が いいえ |
| 3 | リマインダーを削除 | 対象: #2 の結果（前回分を消す。確認が出たら「削除」） |
| 4 | 辞書の値を取得 | キー: items、対象: #1 の辞書 |
| 5 | 各項目を繰り返す | 対象: #4 の値 |
| 6 | 　辞書の値を取得 | キー: at、対象: 繰り返し項目 |
| 7 | 　日付 | 「日付を指定」に #6 の値（形式 yyyy-MM-dd HH:mm として解釈される。解釈されない場合は「日付をフォーマット」でカスタム形式 `yyyy-MM-dd HH:mm` を指定して変換する） |
| 8 | 　辞書の値を取得 | キー: title、対象: 繰り返し項目 |
| 9 | 　新規リマインダーを追加 | タイトル: #8、リスト: VocaVault、アラート: 日時 = #7 |
| 10 | 繰り返しの終了 | |

初回実行時にリマインダーへのアクセスを求められたら許可する。Shortcuts の設定で「ショートカットの共有」に関する制限がある場合は解除する。

動作確認用の JSON（PWA を使わずに試す）: Shortcuts の「テキスト」アクションに次を入れ、「ショートカットを実行」で `VocaVault通知` に渡す。

```json
{"v":1,"list":"VocaVault","items":[{"at":"2026-09-19 08:00","title":"テスト通知 1"},{"at":"2026-09-20 08:00","title":"テスト通知 2"}]}
```

### 9-5. 操作の流れとタップ数

「今日の学習を終える」→ iOS の「"ショートカット"で開きますか？」で「開く」→ Shortcut が実行 → 削除の確認が出れば「削除」→ 終了。追加のタップは 1〜2 回。

### 9-6. 制約

| 制約 | 扱い |
|---|---|
| Shortcut はエージェントが作成も検証もできない | 9-4 の手順とテスト JSON で利用者が確認する（第14章） |
| 通知をタップするとリマインダーが開く | PWA は開かない。許容する |
| ボタンを押し忘れると件数が古くなる | 前回分の通知は続く。ホームで更新を促す |
| 予約日数を超えて放置すると通知が止まる | 設定で最大 30 日まで伸ばせる |

---

## 10. 設定とデータ管理

### 10-1. 進捗リセット

| 項目 | 内容 |
|---|---|
| 対象 | フォルダ 1 つ、または「すべてのデータ」 |
| 確認 | 「進捗をリセットしますか？単語データは保持されます。」 |
| 処理 | 対象単語の FSRS 項目を `newCardFields(now)` で初期化。ReviewLog は削除しない。1 トランザクションで行う |
| 後処理 | バッジ更新 |

### 10-2. JSON バックアップ

**書き出し**

```ts
interface Backup {
  app: 'VocaVault';
  schemaVersion: 1;
  exportedAt: number;
  folders: Folder[];
  words: Word[];
  reviewLogs: ReviewLog[];
  settings: Settings;
}
```

ファイル名 `vocavault-backup-YYYYMMDD-HHMM.json`。`navigator.canShare?.({ files: [file] })` が true なら `navigator.share()` で共有シートを出し（「ファイルに保存」で iCloud Drive などに保存できる）、そうでなければ `<a download>` で保存する。

**読み込み**

`<input type="file" accept="application/json,.json">` で選択。`app` と `schemaVersion` を確認し、不一致なら「このファイルは読み込めません」。確認ダイアログ「現在のデータをすべて置き換えます。よろしいですか？」の後、全テーブルを消して書き込む（置き換えのみ。マージはしない）。完了後にバッジ更新とホームへ遷移。

### 10-3. CSV / TSV 取込（`src/app/csv.ts`）

| 項目 | 内容 |
|---|---|
| 入力 | `<input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain">` |
| 文字コード | UTF-8。先頭の BOM は無視 |
| 区切り | 1 行目にタブがあればタブ、なければカンマ |
| 列 | 英単語、日本語訳、メモ（任意）。1 行目が `英単語`、`englishTerm`、`english` のいずれかで始まればヘッダーとして読み飛ばす |
| 引用 | ダブルクォートで囲まれた項目内の区切り文字と改行を許す。`""` は `"` |
| 検証 | 4-3 のバリデーション。違反行はスキップし件数を報告 |
| 重複 | 同じフォルダに大文字小文字を無視して同じ英単語があればスキップ |
| 結果 | 「N件を取り込みました（スキップ M件: 重複 a件、形式エラー b件）」 |
| 保存 | 1 トランザクションでまとめて追加。`newCardFields()` を付与 |

日本語訳にカンマ区切りの複数候補を書く場合は、CSV ではダブルクォートで囲む。TSV ならそのまま書ける。設定画面の説明にこの旨を書く。

### 10-4. エラーの扱い

| 事象 | 対応 |
|---|---|
| IndexedDB の書き込み失敗 | 1 回再試行。失敗したら「保存に失敗しました」を表示。学習中は次のカードへ進める |
| 容量超過（QuotaExceededError） | 「端末の空き容量が不足しています」を表示 |
| FSRS の計算異常 | 5-5 |
| 取込・読み込みの形式不正 | 該当メッセージを表示し、何も書き込まない |
| Service Worker の更新失敗 | 何もしない。次回起動で再試行される |
| Word に FSRS 項目が欠けている | 読み込み時に `newCardFields()` で補い、`console.warn` |

---

## 11. 非機能要件

| 項目 | 要件 |
|---|---|
| 対応環境 | iOS 16.4 以降の Safari。ホーム画面に追加した状態 |
| 語彙数 | 5,000 語で、一覧表示と検索の応答が 100ms 以内。復習対象の抽出はインデックスを使う |
| 起動 | オフラインでも 2 秒以内にホームを表示 |
| 保存 | 評価 1 件の保存は 50ms 以内 |
| 画面幅 | 320〜480px で崩れない。横向きは考慮しない |
| アクセシビリティ | ボタンは 44px 以上。全ボタンにテキストか `aria-label`。ダイアログは `<dialog>` でフォーカスを閉じ込める。ダークモード対応 |
| 依存 | 実行時依存は react、react-dom、react-router-dom、dexie、ts-fsrs のみ |

---

## 12. テストと完了条件

### 12-1. ユニットテスト（Vitest）

| 対象 | テスト内容 |
|---|---|
| `domain/normalize.ts` | 全角英数字、半角カタカナ、前後空白、候補分割（`,`、`、`、`，`）、ひらがなとカタカナを区別すること、日→英の大文字小文字 |
| `domain/validation.ts` | 各項目の上限と trim 後の非空、フォルダ名の大小無視重複 |
| `domain/fsrs.ts` | New に Good で state = 1 と due が約 10 分後、Learning に Good で state = 2 と due が 1 日以上先、Review に Again で state = 3 と lapses + 1、New に Easy で state = 2、preview が 4 件のラベルを返す、toCard/fromCard の往復 |
| `domain/dates.ts` | 日付キー、今日の終わり、相対表示（超過 / 今日 / 明日 / N日後） |
| `app/queue.ts` | 復習優先、New へのフォールバック、上限の切り詰め、シャッフル時に要素集合が同じ |
| `app/session.ts` | 初回評価のみ集計、Learning への遷移で末尾に再出題、完了判定、途中終了、正答率 |
| `app/streak.ts` | 空、連続、昨日まで、途切れ |
| `app/notify.ts` | 各日の件数（持ち越し含む）、0 件の日の除外、本文の書き分け、時刻の反映、URL エンコード、予約日数の上限 |
| `app/csv.ts` | カンマ / タブ判定、ヘッダー判定、引用符、重複、形式エラーの件数 |
| `app/backup.ts` | 書き出しと読み込みの往復、schemaVersion 不一致の拒否 |
| `db/repo.ts` | fake-indexeddb 上で、フォルダ削除のカスケード、復習対象クエリ、進捗リセット |

### 12-2. 完了条件

1. `npm run build` がエラーなく終わり、`dist/` に `sw.js` と `manifest.webmanifest` がある。
2. `npm test` が全件成功する。
3. `npm run preview` でホームが表示され、フォルダ作成、単語登録、フラッシュカード 1 周、タイプ入力 1 周、結果表示、設定変更、バックアップ書き出しと読み込み、CSV 取込がブラウザで通る（エージェントはヘッドレスブラウザまたは手動相当の確認を行う）。
4. 本書第 7 章の各画面の要素がすべて存在する。
5. 第 15 章の対照表にある「初期実装」がすべて実装されている。

### 12-3. 手動確認チェックリスト（利用者がデプロイ後に行う）

第 14 章。

---

## 13. 開発・ビルド・デプロイ手順

### 13-1. 前提

- Node.js 20 以上。
- GitHub の公開リポジトリ（GitHub Pages を無料で使うため）。リポジトリ名を `vocavault` とすると、公開 URL は `https://<user>.github.io/vocavault/` になる。

### 13-2. 初期化

```
npm create vite@latest . -- --template react-ts
npm install react-router-dom dexie ts-fsrs
npm install -D vite-plugin-pwa vitest fake-indexeddb @types/node
```

### 13-3. GitHub Actions（`.github/workflows/deploy.yml`）

```yaml
name: deploy
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
        env:
          BASE_PATH: /${{ github.event.repository.name }}/
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

リポジトリの Settings → Pages で Source を「GitHub Actions」にする。

### 13-4. 利用者のセットアップ

1. iPhone の Safari で公開 URL を開き、共有メニューから「ホーム画面に追加」。
2. ホーム画面から起動し、フォルダと単語を作る（または CSV を取り込む）。
3. 設定で通知を ON にし、時刻と日数を決める。
4. 9-4 の手順で Shortcut を作り、テスト JSON で動作を確認する。
5. 学習後に「今日の学習を終える」を押し、翌日の通知を確認する。

---

## 14. 実機確認項目

エージェントは iPhone で検証できない。以下は利用者がデプロイ後に確認する。

| # | 確認内容 | 期待 |
|---|---|---|
| 1 | ホーム画面に追加して起動 | 全画面（standalone）で開き、案内バナーが出ない |
| 2 | 機内モードで起動 | ホームが表示され、学習が一通りできる |
| 3 | 単語登録、フラッシュカード、タイプ入力 | 評価後に一覧の復習予定が変わる |
| 4 | スワイプ評価 | 4 方向が正しい評価になり、表面では反応しない |
| 5 | タイプ入力のキーボード | 英→日で日本語、日→英で英語キーボード。入力欄が隠れない |
| 6 | バックアップの書き出し | 共有シートから「ファイルに保存」できる |
| 7 | バックアップの読み込み | 置き換え後にデータが一致する |
| 8 | CSV 取込 | 件数が報告どおり |
| 9 | Shortcut のテスト JSON | リマインダー VocaVault に 2 件できる |
| 10 | 「今日の学習を終える」 | Shortcuts が開き、リマインダーが予約日数分できる。翌日の指定時刻に通知が届く |
| 11 | 2 回目の「学習を終える」 | 前回分が消えて新しい分だけになる |
| 12 | アプリバッジ | 復習がある日の起動後にアイコンに数字が出る。0 で消える |
| 13 | 更新 | 新しいデプロイ後に「新しいバージョンがあります」が出て、更新で反映される |
| 14 | ダークモード | 配色が切り替わる |

---

## 15. 旧設計からの変更対照表

### 15-1. 方針の変更

| 観点 | 旧設計（archive） | 本書 |
|---|---|---|
| プラットフォーム | iOS 17+ ネイティブ、App Store 配布 | PWA、GitHub Pages、ホーム画面追加 |
| 利用者 | 一般ユーザー | 本人のみ |
| UI | SwiftUI + MVVM + Combine | React + TypeScript |
| 永続化 | Core Data + CloudKit | IndexedDB（Dexie）+ JSON バックアップ |
| 同期 | iCloud 自動同期と競合検知 | なし |
| FSRS | 自前実装 + Easy 成熟度ゲート + New→Easy を Learning 経由 | ts-fsrs（FSRS-6）。独自ルールなし |
| Again の再出題 | セッション内で末尾に再挿入、上限 5 回 | ts-fsrs の 10 分ステップで再出題 |
| 通知 | UserNotifications のローカル通知 + ソフトプロンプト | 「学習を終える」から Shortcuts 経由でリマインダーに予約 + アプリバッジ |
| データモデル | Folder / Word / FSRSCard / ReviewLog の 4 エンティティ | folders / words（カード内包）/ reviewLogs / settings |
| 設定の保存 | UserDefaults 15 キー | settings テーブル 1 レコード |
| セッション上限の既定 | 50 枚 | 30 枚 |
| 文書 | 3 書 + レビュー履歴 | 本書 1 冊 |
| 段階 | Ph.1 / Ph.2 | 初期実装 / あとで / やらない |

### 15-2. 旧設計の FSRS 仕様を採用しない理由

旧技術設計書（`docx/archive/architecture.md`）4-4〜4-6 を参照実装（ts-fsrs 5.4.2、fsrs4anki v6.1.1）と照合した結果:

1. 評価値の添字が 1 段ずれている（参照実装は G = 1〜4、旧設計は 0〜3 を同じ式に代入）。
2. 難易度更新式で平均回帰の重み（w7）と評価の係数（w6）が入れ替わっている。
3. 失敗時の安定性・Hard ペナルティ・Easy ボーナスのパラメータ添字が 1 つずれている。
4. w7 以降の既定値が公開値と一致しない。

これらを直すと参照実装の再実装になるため、ts-fsrs を使う。Easy 成熟度ゲートは、記憶が新しいうちの復習ほど安定性の伸びが小さいという FSRS の性質と逆方向に働くため採用しない。

### 15-3. 旧 F-ID ごとの扱い

第 2 章の表を参照。

---

## 16. 未確定事項と将来候補

### 16-1. 保留

| 事項 | 扱い |
|---|---|
| 課金・アカウント・権限を含む別資料の有無 | 本書では対象外と明記。資料が出てきたら 15-1 に追記する |
| Shortcuts の「リマインダーを削除」の確認ダイアログ | 実機で毎回出る場合は 1 タップを受け入れる。確認なしの方法が見つかれば 9-4 を更新する |

### 16-2. 将来候補（あとで）

| 候補 | メモ |
|---|---|
| FSRS パラメータの個人最適化 | fsrs-browser（BSD-3）で ReviewLog から学習。数千件の履歴が溜まってから |
| 統計画面 | 日別の学習数、安定性の分布 |
| フォルダの並び替え | sortOrder は保持済み |
| 記憶状態の詳細表示 | 単語フォームに安定性、難易度、次回復習日、復習回数 |
| バックアップのマージ読み込み | 現状は置き換えのみ |
| 発音再生 | Web Speech API |

---

## 付録A. リポジトリ直下に置く CLAUDE.md の内容

```markdown
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
```

---

## 付録B. 型定義と Dexie スキーマの原文

### B-1. `src/domain/types.ts`

```ts
export type CardState = 0 | 1 | 2 | 3;          // New, Learning, Review, Relearning
export type Grade = 1 | 2 | 3 | 4;              // Again, Hard, Good, Easy

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
  sortOrder: number;
}

export interface FsrsFields {
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: CardState;
  last_review: number | null;
}

export interface Word extends FsrsFields {
  id: string;
  folderId: string;
  englishTerm: string;
  japaneseDefinition: string;
  memo: string;
  createdAt: number;
  updatedAt: number;
}

export interface ReviewLog {
  id: string;
  wordId: string;
  rating: Grade;
  state: CardState;
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  last_elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  review: number;
}

export interface Settings {
  id: 'app';
  maxCardsPerSession: number;      // 10..100 step 10, default 30
  cardOrder: 'dueFirst' | 'random';
  notifyEnabled: boolean;
  notifyTime: string;              // "HH:MM"
  notifyDays: number;              // 1..30, default 7
  lastNotifyScheduledAt: number | null;
  lastNotifyItemCount: number;
  schemaVersion: 1;
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  maxCardsPerSession: 30,
  cardOrder: 'dueFirst',
  notifyEnabled: false,
  notifyTime: '08:00',
  notifyDays: 7,
  lastNotifyScheduledAt: null,
  lastNotifyItemCount: 0,
  schemaVersion: 1,
};

export const LIMITS = {
  englishTerm: 200,
  japaneseDefinition: 500,
  memo: 1000,
  folderName: 50,
  masteredStability: 30,
} as const;
```

### B-2. `src/db/db.ts`

```ts
import Dexie, { type EntityTable } from 'dexie';
import type { Folder, Word, ReviewLog, Settings } from '../domain/types';

export const db = new Dexie('vocavault') as Dexie & {
  folders: EntityTable<Folder, 'id'>;
  words: EntityTable<Word, 'id'>;
  reviewLogs: EntityTable<ReviewLog, 'id'>;
  settings: EntityTable<Settings, 'id'>;
};

db.version(1).stores({
  folders: 'id, sortOrder',
  words: 'id, folderId, due, state, [folderId+due], [folderId+state]',
  reviewLogs: 'id, wordId, review',
  settings: 'id',
});
```

### B-3. `src/domain/fsrs.ts` の骨子

```ts
import { fsrs, generatorParameters, createEmptyCard, Rating, type Card, type Grade as TsGrade } from 'ts-fsrs';
import type { Word, FsrsFields, ReviewLog, Grade } from './types';

export const scheduler = fsrs(generatorParameters({
  request_retention: 0.9,
  maximum_interval: 36500,
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: ['10m'],
  relearning_steps: ['10m'],
}));

export function toCard(w: FsrsFields): Card {
  return {
    due: new Date(w.due),
    stability: w.stability,
    difficulty: w.difficulty,
    elapsed_days: w.elapsed_days,
    scheduled_days: w.scheduled_days,
    learning_steps: w.learning_steps,
    reps: w.reps,
    lapses: w.lapses,
    state: w.state,
    last_review: w.last_review == null ? undefined : new Date(w.last_review),
  };
}

export function fromCard(c: Card): FsrsFields {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as FsrsFields['state'],
    last_review: c.last_review ? c.last_review.getTime() : null,
  };
}

export const newCardFields = (now: number): FsrsFields => fromCard(createEmptyCard(new Date(now)));

export function rate(word: Word, grade: Grade, now: number): { word: Word; log: ReviewLog } {
  const { card, log } = scheduler.next(toCard(word), new Date(now), grade as TsGrade);
  return {
    word: { ...word, ...fromCard(card), updatedAt: now },
    log: {
      id: crypto.randomUUID(),
      wordId: word.id,
      rating: log.rating as Grade,
      state: log.state as FsrsFields['state'],
      due: log.due.getTime(),
      stability: log.stability,
      difficulty: log.difficulty,
      elapsed_days: log.elapsed_days,
      last_elapsed_days: log.last_elapsed_days,
      scheduled_days: log.scheduled_days,
      learning_steps: log.learning_steps,
      review: log.review.getTime(),
    },
  };
}
```

ts-fsrs の型名や戻り値が上記と異なる場合は、インストールした版の型定義に合わせて修正し、本書の意図（Card との相互変換、`next()` の結果保存）を保つ。

以上
