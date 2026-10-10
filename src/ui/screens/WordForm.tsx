import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CardFields, useCardEditor } from '../components/CardFields';
import { ImportScreen } from './Import';
import { errorMessage } from '../hooks';
import { createWord, listFolders } from '../../db/repo';
import { updateBadge } from '../../app/badge';
import { importResultMessage, importText, type ImportOptions, type ImportSettings } from '../../app/csv';
import { loadSettings, requestPersistentStorage, updateSettings } from '../../app/settings';
import { type Folder } from '../../domain/types';
import { folderLabels } from '../../domain/labels';

/** 単語フォーム（7-4）。カードの新規作成のみ。既存のカードの表示と編集はカード詳細画面（7-12） */
export function WordForm() {
  const { folderId = '' } = useParams();
  const navigate = useNavigate();
  const editor = useCardEditor();
  const { form, reset } = editor;
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<{ name: string; text: string; saved: ImportSettings } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    void listFolders().then((list) => {
      if (!alive) return;
      setFolders(list);
      // 所属フォルダの初期値は開いた一覧のフォルダ（7-4）
      reset({ folderId, englishTerm: '', japaneseDefinition: '', memo: '' }, null);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
    // reset は描画のたびに作り直されるので依存に入れない。初期化は URL のフォルダが変わったときだけ
  }, [folderId]);

  const labels = folderLabels(folders.find((f) => f.id === form.folderId));
  const canSave = editor.canSave && loaded;
  /** キャンセルの戻り先: 開いた一覧 */
  const backTo = `/folders/${folderId}`;
  /** 保存・取込の後の戻り先: 選んだフォルダ */
  const savedTo = `/folders/${form.folderId}`;

  const onSave = async () => {
    if (!canSave) return;
    try {
      requestPersistentStorage();
      await createWord({ folderId: form.folderId, ...editor.value() }, Date.now(), editor.imageArg());
      await updateBadge();
      navigate(savedTo, { replace: true });
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };

  const onCancel = () => {
    if (editor.dirty) setConfirmDiscard(true);
    else navigate(backTo);
  };

  // ---------- CSV / TSV 取込（10-3）。メモ欄の下のリンクから ----------

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
        labels={labels}
        busy={importing}
        onImport={(o) => void onImport(o)}
        onCancel={() => setImportFile(null)}
      />
    );
  }

  return (
    <div className="screen">
      <Header
        title="カードを追加"
        left={
          <button type="button" className="btn-text" onClick={onCancel}>
            キャンセル
          </button>
        }
        right={
          <button type="button" className="btn-text" disabled={!canSave} onClick={onSave} style={{ fontWeight: 600 }}>
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
        <CardFields editor={editor} folders={folders} disabled={!loaded} onMessage={setMessage}>
          <button type="button" className="link-muted" onClick={() => fileRef.current?.click()} data-testid="import-link">
            複数のカードをまとめて登録する（CSV / TSV 取込）
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
        </CardFields>
        <button type="submit" className="btn-primary" disabled={!canSave}>
          保存
        </button>
      </form>

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
    </div>
  );
}
