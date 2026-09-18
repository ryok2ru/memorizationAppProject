import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { Switch } from '../components/Switch';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAsync, errorMessage } from '../hooks';
import { useSw } from '../SwContext';
import { listFolders, resetProgress } from '../../db/repo';
import { loadSettings, updateSettings, MAX_CARDS_OPTIONS } from '../../app/settings';
import { exportBackup, importBackup, parseBackup, saveBackupFile, BackupFormatError, type Backup } from '../../app/backup';
import { updateBadge } from '../../app/badge';
import { formatShortDateTime } from '../../domain/dates';
import type { Settings as SettingsType } from '../../domain/types';

const SHORTCUT_STEPS: [string, string][] = [
  ['入力から辞書を取得', '入力: ショートカットの入力'],
  ['リマインダーを検索', 'フィルター: リスト が VocaVault、かつ 完了済み が いいえ'],
  ['リマインダーを削除', '対象: #2 の結果（前回分を消す。確認が出たら「削除」）'],
  ['辞書の値を取得', 'キー: items、対象: #1 の辞書'],
  ['各項目を繰り返す', '対象: #4 の値'],
  ['　辞書の値を取得', 'キー: at、対象: 繰り返し項目'],
  ['　日付', '「日付を指定」に #6 の値（形式 yyyy-MM-dd HH:mm。解釈されない場合は「日付をフォーマット」でカスタム形式 yyyy-MM-dd HH:mm を指定して変換する）'],
  ['　辞書の値を取得', 'キー: title、対象: 繰り返し項目'],
  ['　新規リマインダーを追加', 'タイトル: #8、リスト: VocaVault、アラート: 日時 = #7'],
  ['繰り返しの終了', ''],
];

const TEST_JSON =
  '{"v":1,"list":"VocaVault","items":[{"at":"2026-09-19 08:00","title":"テスト通知 1"},{"at":"2026-09-20 08:00","title":"テスト通知 2"}]}';

export function Settings() {
  const navigate = useNavigate();
  const sw = useSw();
  const { data, reload } = useAsync(async () => {
    const [settings, folders] = await Promise.all([loadSettings(), listFolders()]);
    return { settings, folders };
  }, []);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingBackup, setPendingBackup] = useState<Backup | null>(null);
  const [resetTarget, setResetTarget] = useState<string>('all');
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async (patch: Partial<SettingsType>) => {
    try {
      await updateSettings(patch);
      reload();
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };

  const onExport = async () => {
    try {
      const { text, fileName } = await exportBackup();
      const how = await saveBackupFile(text, fileName);
      setMessage(how === 'share' ? '共有シートから保存してください' : `${fileName} を保存しました`);
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };

  const onPickBackup = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    try {
      const backup = parseBackup(await file.text());
      setPendingBackup(backup);
    } catch (e) {
      setMessage(e instanceof BackupFormatError ? e.message : 'このファイルは読み込めません');
    }
  };

  const onImport = async () => {
    const backup = pendingBackup;
    setPendingBackup(null);
    if (!backup) return;
    try {
      await importBackup(backup);
      await updateBadge();
      navigate('/', { replace: true });
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };

  const onReset = async () => {
    setConfirmReset(false);
    try {
      const n = await resetProgress(resetTarget === 'all' ? null : resetTarget);
      await updateBadge();
      setMessage(`${n}語の進捗をリセットしました`);
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };

  if (!data) return <div className="screen"><Header title="設定" back="/" /></div>;
  const s = data.settings;

  return (
    <div className="screen">
      <Header title="設定" back="/" />

      {message && (
        <div className="notice" role="status" data-testid="settings-message">
          {message}
        </div>
      )}

      <section className="section">
        <h2>学習</h2>
        <div className="card">
          <label className="setting-row">
            <span>1セッションの最大枚数</span>
            <select
              value={s.maxCardsPerSession}
              onChange={(e) => void save({ maxCardsPerSession: Number(e.target.value) })}
              data-testid="max-cards"
            >
              {MAX_CARDS_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}枚
                </option>
              ))}
            </select>
          </label>
          <label className="setting-row">
            <span>カード表示順の既定</span>
            <select value={s.cardOrder} onChange={(e) => void save({ cardOrder: e.target.value as SettingsType['cardOrder'] })} data-testid="card-order">
              <option value="dueFirst">復習優先</option>
              <option value="random">ランダム</option>
            </select>
          </label>
        </div>
      </section>

      <section className="section">
        <h2>通知</h2>
        <div className="card">
          <div className="setting-row">
            <span>通知予約</span>
            <Switch checked={s.notifyEnabled} onChange={(v) => void save({ notifyEnabled: v })} label="通知予約" />
          </div>
          <label className="setting-row">
            <span>通知時刻</span>
            <input type="time" value={s.notifyTime} onChange={(e) => e.target.value && void save({ notifyTime: e.target.value })} />
          </label>
          <label className="setting-row">
            <span>予約日数（1〜30）</span>
            <input
              type="number"
              min={1}
              max={30}
              value={s.notifyDays}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= 1 && n <= 30) void save({ notifyDays: n });
              }}
            />
          </label>
          <p className="small muted" style={{ margin: 0 }}>
            {s.lastNotifyScheduledAt == null
              ? 'まだ予約していません'
              : `最終予約: ${formatShortDateTime(s.lastNotifyScheduledAt)}、${s.lastNotifyItemCount}日分`}
          </p>
          <p className="small muted" style={{ margin: 0 }}>
            通知はホームか結果画面の「今日の学習を終える」で iOS の Shortcuts に渡し、リマインダーに予約します。
            アプリバッジの復習数はアプリを開いたときにだけ更新され、バックグラウンドでは変わりません。
          </p>
          <details>
            <summary>Shortcut の設定方法</summary>
            <p className="small">事前準備: リマインダーアプリでリスト「VocaVault」を作る。</p>
            <p className="small">
              Shortcuts アプリで新規ショートカットを作り、名前を <code>VocaVault通知</code> にして、次のアクションを順に追加する。
            </p>
            <ol>
              {SHORTCUT_STEPS.map(([action, detail], i) => (
                <li key={i}>
                  <strong>{action}</strong>
                  {detail && <> — {detail}</>}
                </li>
              ))}
            </ol>
            <p className="small">
              初回実行時にリマインダーへのアクセスを求められたら許可する。Shortcuts の設定で「ショートカットの共有」に関する制限がある場合は解除する。
            </p>
            <p className="small">動作確認用の JSON（「テキスト」アクションに入れ、「ショートカットを実行」で VocaVault通知 に渡す）:</p>
            <pre>{TEST_JSON}</pre>
          </details>
        </div>
      </section>

      <section className="section">
        <h2>データ</h2>
        <div className="card">
          <button type="button" className="btn-secondary" onClick={onExport} data-testid="export-backup">
            バックアップを書き出す
          </button>
          <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}>
            バックアップを読み込む
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            aria-label="バックアップファイル"
            data-testid="backup-file"
            onChange={(e) => void onPickBackup(e.target.files?.[0])}
          />
          <p className="small muted" style={{ margin: 0 }}>
            ブラウザのタブで使うとデータが消えることがあります。ホーム画面に追加して使い、定期的にバックアップを書き出してください。
          </p>
          <p className="small muted" style={{ margin: 0 }}>
            CSV/TSV 取込は各フォルダの画面の右上メニューから行います。列は「英単語, 日本語訳, メモ（任意）」で、1 行目にタブがあればタブ区切り、なければカンマ区切りとして読みます。
            日本語訳にカンマ区切りの複数候補を書く場合、CSV ではダブルクォートで囲みます（例: <code>ambiguous,"曖昧な,あいまいな"</code>）。TSV ならそのまま書けます。
          </p>
          <label className="setting-row">
            <span>進捗リセット</span>
            <select value={resetTarget} onChange={(e) => setResetTarget(e.target.value)} data-testid="reset-target">
              <option value="all">すべて</option>
              {data.folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn-danger" onClick={() => setConfirmReset(true)} data-testid="reset-progress">
            進捗をリセット
          </button>
        </div>
      </section>

      <section className="section">
        <h2>アプリ情報</h2>
        <div className="card">
          <div className="setting-row">
            <span>バージョン</span>
            <span>{__APP_VERSION__}</span>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            ライセンス: ts-fsrs（MIT）、Dexie（Apache-2.0）、vite-plugin-pwa（MIT）
          </p>
          {sw.needRefresh && (
            <button type="button" className="btn-primary" onClick={sw.update}>
              更新して再読み込み
            </button>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={pendingBackup != null}
        title="バックアップを読み込む"
        message="現在のデータをすべて置き換えます。よろしいですか？"
        confirmLabel="置き換える"
        danger
        onConfirm={onImport}
        onCancel={() => setPendingBackup(null)}
      />
      <ConfirmDialog
        open={confirmReset}
        title="進捗リセット"
        message="進捗をリセットしますか？単語データは保持されます。"
        confirmLabel="リセット"
        danger
        onConfirm={onReset}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
