import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FavoriteButton } from '../components/FavoriteButton';
import { ImportScreen } from './Import';
import { movedMessage } from './WordList';
import { errorMessage } from '../hooks';
import { createWord, deleteWord, getWord, getWordImage, listFolders, setFavorite, updateWordText, type WordImageInput } from '../../db/repo';
import { ImageLoadError, resizeImage } from '../../app/image';
import { updateBadge } from '../../app/badge';
import { importResultMessage, importText, type ImportOptions, type ImportSettings } from '../../app/csv';
import { loadSettings, requestPersistentStorage, updateSettings } from '../../app/settings';
import { isWordValid, trimWord, validateWord } from '../../domain/validation';
import { LIMITS, type Folder, type ImageSide } from '../../domain/types';
import { folderLabels } from '../../domain/labels';

/** バイト列を表示用の object URL にする。data が変わるか画面を離れたら解放する */
function useObjectUrl(image: WordImageInput | null): string | null {
  const data = image?.data;
  const type = image?.type;
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!data) {
      setUrl(null);
      return undefined;
    }
    const u = URL.createObjectURL(new Blob([data], { type }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [data, type]);
  return url;
}

/** 画像が変わったか（7-4）。差し替え・削除・表示する面の変更 */
export function imageChanged(before: WordImageInput | null, after: WordImageInput | null): boolean {
  return before?.data !== after?.data || before?.side !== after?.side;
}

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
  // 画像（4-8）。保存ボタンで本文と一緒に保存し、変更はキャンセル時の破棄確認の対象にする
  const [initialImage, setInitialImage] = useState<WordImageInput | null>(null);
  const [image, setImage] = useState<WordImageInput | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);
  const imageUrl = useObjectUrl(image);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      listFolders(),
      isEdit ? getWord(wordId) : Promise.resolve(undefined),
      isEdit ? getWordImage(wordId) : Promise.resolve(undefined),
    ]).then(([list, w, img]) => {
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
      if (img) {
        const v: WordImageInput = { data: img.data, type: img.type, side: img.side };
        setInitialImage(v);
        setImage(v);
      }
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [isEdit, wordId, navigate]);

  // 入力欄の見出しは選んでいるフォルダの項目名。フォルダを変えるとその場で切り替わる（7-4）
  const labels = folderLabels(folders.find((f) => f.id === form.folderId));
  const errors = validateWord(form, labels);
  const canSave = isWordValid(form) && !imageBusy;
  const dirty =
    form.folderId !== initial.folderId ||
    form.englishTerm !== initial.englishTerm ||
    form.japaneseDefinition !== initial.japaneseDefinition ||
    form.memo !== initial.memo ||
    imageChanged(initialImage, image);
  /** キャンセル・削除の戻り先: 元のフォルダ */
  const backTo = `/folders/${initial.folderId}`;
  /** 保存・取込の後の戻り先: 選んだフォルダ（移動した場合は移動先） */
  const savedTo = `/folders/${form.folderId}`;

  const onSave = async () => {
    if (!canSave) return;
    const value = trimWord(form);
    // 画像は変えたときだけ書く（null = 削除）。変えていなければ undefined で触れない
    const imageArg = imageChanged(initialImage, image) ? image : undefined;
    try {
      if (isEdit) {
        // folderId も一緒に更新する。FSRS の状態と ReviewLog は変えない
        await updateWordText(wordId, { ...value, folderId: form.folderId }, Date.now(), imageArg);
      } else {
        requestPersistentStorage();
        await createWord({ folderId: form.folderId, ...value }, Date.now(), imageArg);
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

  // ---------- 画像（4-8）。選んだら長辺 1280px の JPEG に縮小して持つ ----------

  const onPickImage = async (file: File | undefined) => {
    if (imageRef.current) imageRef.current.value = '';
    if (!file) return;
    setImageBusy(true);
    try {
      const { data, type } = await resizeImage(file);
      setImage({ data, type, side: image?.side ?? 'back' });
      setMessage(null);
    } catch (e) {
      console.error(e);
      setMessage(e instanceof ImageLoadError ? e.message : errorMessage(e));
    } finally {
      setImageBusy(false);
    }
  };

  const onImageSide = (side: ImageSide) => {
    if (image && image.side !== side) setImage({ ...image, side });
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
        labels={labels}
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
        title={isEdit ? 'カードを編集' : 'カードを追加'}
        left={
          <button type="button" className="btn-text" onClick={onCancel}>
            キャンセル
          </button>
        }
        right={
          <>
            {/* ☆ はタイトルの右（上部バーの右の領域の先頭）。編集のときだけ出す（7-4） */}
            {isEdit && loaded && <FavoriteButton favorite={favorite} onToggle={() => void onToggleFavorite()} />}
            <button type="button" className="btn-text" disabled={!canSave || !loaded} onClick={onSave} style={{ fontWeight: 600 }}>
              保存
            </button>
          </>
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
          <span>{labels.front}（必須）</span>
          <input
            type="text"
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
          <span>{labels.back}（必須）</span>
          <input
            type="text"
            placeholder="カンマ区切りで複数の答えを書けます"
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
        <div className="field image-field" data-testid="image-field">
          <span>画像（任意）</span>
          {image && imageUrl && <img className="card-image" src={imageUrl} alt="カードの画像" data-testid="image-preview" />}
          {image && (
            <>
              <div className="segmented" role="group" aria-label="画像を表示する面">
                {(['front', 'back'] as ImageSide[]).map((side) => (
                  <button key={side} type="button" aria-pressed={image.side === side} onClick={() => onImageSide(side)} data-testid={`image-side-${side}`}>
                    {side === 'front' ? labels.front : labels.back}と一緒に表示
                  </button>
                ))}
              </div>
              <span className="small muted">
                フラッシュカードでは、{labels.front}を選ぶと表面から、{labels.back}を選ぶと答えを表示したときに出ます。
              </span>
            </>
          )}
          {imageBusy ? (
            <span className="small muted" role="status">
              画像を読み込んでいます…
            </span>
          ) : (
            <div className="btn-row">
              <button type="button" className="btn-outline" onClick={() => imageRef.current?.click()} data-testid="image-pick">
                {image ? '画像を変更' : '画像を選ぶ'}
              </button>
              {image && (
                <button type="button" className="btn-outline-danger" onClick={() => setImage(null)} data-testid="image-remove">
                  画像を削除
                </button>
              )}
            </div>
          )}
          <input
            ref={imageRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            aria-label="画像ファイル"
            data-testid="image-file"
            onChange={(e) => void onPickImage(e.target.files?.[0])}
          />
        </div>
        {!isEdit && (
          <>
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
          </>
        )}
        <button type="submit" className="btn-primary" disabled={!canSave || !loaded}>
          保存
        </button>
      </form>

      {isEdit && (
        <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)}>
          このカードを削除
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
        title="カードを削除"
        message="このカードと学習履歴を削除します。よろしいですか？"
        confirmLabel="削除"
        danger
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
