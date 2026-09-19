import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FavoriteButton } from '../components/FavoriteButton';
import { ImportScreen } from './Import';
import { movedMessage } from './WordList';
import { errorMessage } from '../hooks';
import { createWord, deleteWord, getWord, listFolders, setFavorite, updateWordText } from '../../db/repo';
import { updateBadge } from '../../app/badge';
import { importResultMessage, importText, type ImportOptions, type ImportSettings } from '../../app/csv';
import { loadSettings, requestPersistentStorage, updateSettings } from '../../app/settings';
import { isWordValid, trimWord, validateWord } from '../../domain/validation';
import { LIMITS, type Folder } from '../../domain/types';

export function WordForm() {
  const { folderId, wordId } = useParams();
  const navigate = useNavigate();
  const isEdit = wordId != null;
  // folderId は所属フォルダ（7-4）。新規は URL のフォルダ、編集は単語の現在のフォルダが初期値
  const [initial, setInitial] = useState({ folderId: folderId ?? '', englishTerm: '', japaneseDefinition: '', memo: '' });
  const [form, setForm] = useState(initial);
  const [folders, setFolders] = useState<Folder[]>([]);
  // ☆ は本文と別に持ち、押した時点で保存する（7-4）。保存ボタンやキャンセルの破棄確認の対象にしない
  const [favorite, setFavoriteState] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<{ name: string; text: string; saved: ImportSettings } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([listFolders(), isEdit ? getWord(wordId) : Promise.resolve(undefined)]).then(([list, w]) => {
      if (!alive) return;
      if (isEdit && !w) {
        navigate('/', { replace: true });
        return;
      }
      setFolders(list);
      if (w) {
        const v = { folderId: w.folderId, englishTerm: w.englishTerm, japaneseDefinition: w.japaneseDefinition, memo: w.memo };
        setInitial(v);
        setForm(v);
        setFavoriteState(w.favorite);
      }
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [isEdit, wordId, navigate]);

  const errors = validateWord(form);
  const canSave = isWordValid(form);
  const dirty =
    form.folderId !== initial.folderId ||
    form.englishTerm !== initial.englishTerm ||
    form.japaneseDefinition !== initial.japaneseDefinition ||
    form.memo !== initial.memo;
  /** キャンセル・削除の戻り先: 元のフォルダ */
  const backTo = `/folders/${initial.folderId}`;
  /** 保存・取込の後の戻り先: 選んだフォルダ（移動した場合は移動先） */
  const savedTo = `/folders/${form.folderId}`;

  const onSave = async () => {
    if (!canSave) return;
    const value = trimWord(form);
    try {
      if (isEdit) {
        // folderId も一緒に更新する。FSRS の状態と ReviewLog は変えない
        await updateWordText(wordId, { ...value, folderId: form.folderId });
      } else {
        requestPersistentStorage();
        await createWord({ folderId: form.folderId, ...value });
        await updateBadge();
      }
      // 編集でフォルダを変えたときは、移動先の一覧で「1件を「フォルダ名」に移動しました」を出す（7-4）
      const dest = folders.find((f) => f.id === form.folderId);
      const moved = isEdit && form.folderId !== initial.folderId && dest != null;
      navigate(savedTo, { replace: true, state: moved ? { toast: movedMessage(1, dest.name) } : null });
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };

  /** ☆ の切り替え（編集のみ）。保存ボタンを押さなくてもその場で反映する（7-4） */
  const onToggleFavorite = async () => {
    if (!isEdit) return;
    const next = !favorite;
    setFavoriteState(next);
    try {
      await setFavorite(wordId, next);
    } catch (e) {
      setFavoriteState(!next);
      setMessage(errorMessage(e));
    }
  };

  const onDelete = async () => {
    setConfirmDelete(false);
    if (!isEdit) return;
    try {
      await deleteWord(wordId);
      await updateBadge();
      navigate(backTo, { replace: true });
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };

  const onCancel = () => {
    if (dirty) setConfirmDiscard(true);
    else navigate(backTo);
  };

  // ---------- CSV / TSV 取込（10-3）。新規のときだけ、メモ欄の下のリンクから ----------

  const onPickFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    try {
      const [text, saved] = await Promise.all([file.text(), loadSettings()]);
      setImportFile({ name: file.name, text, saved });
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };

  const onImport = async (options: ImportOptions) => {
    if (!importFile) return;
    setImporting(true);
    let result: string;
    try {
      await updateSettings({ importDelimiter: options.delimiter, importHasHeader: options.hasHeader, importColumns: options.columns });
      const plan = await importText(importFile.text, form.folderId, options);
      result = importResultMessage(plan);
      await updateBadge();
    } catch (e) {
      result = errorMessage(e);
    }
    // 選んだフォルダの単語一覧に戻って結果を表示する
    navigate(savedTo, { replace: true, state: { message: result } });
  };

  if (importFile) {
    return (
      <ImportScreen
        fileName={importFile.name}
        text={importFile.text}
        saved={importFile.saved}
        busy={importing}
        onImport={(o) => void onImport(o)}
        onCancel={() => setImportFile(null)}
      />
    );
  }

  const showError = (key: keyof typeof errors) => {
    const msg = errors[key];
    if (!msg) return null;
    // 未入力は保存ボタンの非活性で示し、超過だけ赤字にする
    if (form[key].trim().length === 0) return null;
    return <p className="error">{msg}</p>;
  };

  return (
    <div className="screen">
      <Header
        title={isEdit ? '単語を編集' : '単語を追加'}
        // ☆ は編集のときだけ。新規作成では出さない（7-4）
        titleRight={isEdit && loaded ? <FavoriteButton favorite={favorite} onToggle={() => void onToggleFavorite()} /> : undefined}
        left={
          <button type="button" className="btn-text" onClick={onCancel}>
            キャンセル
          </button>
        }
        right={
          <button type="button" className="btn-text" disabled={!canSave || !loaded} onClick={onSave} style={{ fontWeight: 600 }}>
            保存
          </button>
        }
      />

      {message && (
        <div className="notice" role="alert">
          {message}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSave();
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <label className="field">
          <span>フォルダ</span>
          <select value={form.folderId} disabled={!loaded} onChange={(e) => setForm({ ...form, folderId: e.target.value })} data-testid="folder-select">
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>英単語（必須）</span>
          <input
            type="text"
            lang="en"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={form.englishTerm}
            onChange={(e) => setForm({ ...form, englishTerm: e.target.value })}
            aria-invalid={!!errors.englishTerm}
          />
          {showError('englishTerm')}
        </label>
        <label className="field">
          <span>日本語訳（必須）</span>
          <input
            type="text"
            lang="ja"
            placeholder="例: 曖昧な,あいまいな（カンマ区切りで複数可）"
            value={form.japaneseDefinition}
            onChange={(e) => setForm({ ...form, japaneseDefinition: e.target.value })}
            aria-invalid={!!errors.japaneseDefinition}
          />
          {showError('japaneseDefinition')}
        </label>
        <label className="field">
          <span>メモ（任意）</span>
          <textarea value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} aria-invalid={!!errors.memo} />
          {showError('memo')}
          <span className="small muted">
            {form.memo.length} / {LIMITS.memo}
          </span>
        </label>
        {!isEdit && (
          <>
            <button type="button" className="link-muted" onClick={() => fileRef.current?.click()} data-testid="import-link">
              複数の単語をまとめて登録する（CSV / TSV 取込）
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
              style={{ display: 'none' }}
              aria-label="CSV/TSV ファイル"
              data-testid="import-file"
              onChange={(e) => void onPickFile(e.target.files?.[0])}
            />
          </>
        )}
        <button type="submit" className="btn-primary" disabled={!canSave || !loaded}>
          保存
        </button>
      </form>

      {isEdit && (
        <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)}>
          この単語を削除
        </button>
      )}

      <ConfirmDialog
        open={confirmDiscard}
        message="変更を破棄しますか？"
        confirmLabel="破棄"
        danger
        onConfirm={() => {
          setConfirmDiscard(false);
          navigate(backTo);
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="単語を削除"
        message="この単語と学習履歴を削除します。よろしいですか？"
        confirmLabel="削除"
        danger
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
