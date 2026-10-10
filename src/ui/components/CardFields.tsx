import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { WordImageInput } from '../../db/repo';
import { ImageLoadError, resizeImage } from '../../app/image';
import { errorMessage } from '../hooks';
import { isWordValid, trimWord, validateWord, type WordInput } from '../../domain/validation';
import { LIMITS, type Folder, type ImageSide } from '../../domain/types';
import { folderLabels, type Labels } from '../../domain/labels';

/** カードの入力欄の値（7-4）。folderId は所属フォルダ */
export interface CardFormValue extends WordInput {
  folderId: string;
}

export const EMPTY_CARD_FORM: CardFormValue = { folderId: '', englishTerm: '', japaneseDefinition: '', memo: '' };

/** バイト列を表示用の object URL にする。data が変わるか画面を離れたら解放する */
export function useObjectUrl(image: { data: ArrayBuffer; type: string } | null): string | null {
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

/**
 * カードの入力の状態（単語フォーム 7-4、カード詳細画面の編集と「カードにする」7-12 で共通）。
 * 初期値との差（破棄の確認に使う）と、保存できるかを持つ
 */
export function useCardEditor() {
  const [initial, setInitial] = useState<CardFormValue>(EMPTY_CARD_FORM);
  const [form, setForm] = useState<CardFormValue>(EMPTY_CARD_FORM);
  const [initialImage, setInitialImage] = useState<WordImageInput | null>(null);
  const [image, setImage] = useState<WordImageInput | null>(null);
  const [imageBusy, setImageBusy] = useState(false);

  const reset = (value: CardFormValue, img: WordImageInput | null) => {
    setInitial(value);
    setForm(value);
    setInitialImage(img);
    setImage(img);
  };
  const dirty =
    form.folderId !== initial.folderId ||
    form.englishTerm !== initial.englishTerm ||
    form.japaneseDefinition !== initial.japaneseDefinition ||
    form.memo !== initial.memo ||
    imageChanged(initialImage, image);
  return {
    initial,
    form,
    setForm,
    image,
    setImage,
    imageBusy,
    setImageBusy,
    reset,
    dirty,
    canSave: isWordValid(form) && !imageBusy && form.folderId !== '',
    /** trim した本文 */
    value: () => trimWord(form),
    /** 画像は変えたときだけ書く（null = 削除）。変えていなければ undefined で触れない */
    imageArg: (): WordImageInput | null | undefined => (imageChanged(initialImage, image) ? image : undefined),
  };
}

export type CardEditor = ReturnType<typeof useCardEditor>;

interface Props {
  editor: CardEditor;
  folders: Folder[];
  disabled?: boolean;
  /** 画像を読めなかったときなどの文面 */
  onMessage: (message: string | null) => void;
  /** 画像の欄の下に置くもの（単語フォームの取込への導線） */
  children?: ReactNode;
}

/** カードの入力欄（7-4 のフォルダ・{表}・{裏}・メモ・画像）。見出しは選んでいるフォルダの項目名 */
export function CardFields({ editor, folders, disabled = false, onMessage, children }: Props) {
  const { form, setForm, image, setImage, imageBusy, setImageBusy } = editor;
  const imageRef = useRef<HTMLInputElement>(null);
  const imageUrl = useObjectUrl(image);
  // 入力欄の見出しは選んでいるフォルダの項目名。フォルダを変えるとその場で切り替わる（7-4）
  const labels: Labels = folderLabels(folders.find((f) => f.id === form.folderId));
  const errors = validateWord(form, labels);

  // 画像（4-8）。選んだら長辺 1280px の JPEG に縮小して持つ
  const onPickImage = async (file: File | undefined) => {
    if (imageRef.current) imageRef.current.value = '';
    if (!file) return;
    setImageBusy(true);
    try {
      const { data, type } = await resizeImage(file);
      setImage({ data, type, side: image?.side ?? 'back' });
      onMessage(null);
    } catch (e) {
      console.error(e);
      onMessage(e instanceof ImageLoadError ? e.message : errorMessage(e));
    } finally {
      setImageBusy(false);
    }
  };

  const onImageSide = (side: ImageSide) => {
    if (image && image.side !== side) setImage({ ...image, side });
  };

  const showError = (key: keyof typeof errors) => {
    const msg = errors[key];
    if (!msg) return null;
    // 未入力は保存ボタンの非活性で示し、超過だけ赤字にする
    if (form[key].trim().length === 0) return null;
    return <p className="error">{msg}</p>;
  };

  return (
    <>
      <label className="field">
        <span>フォルダ</span>
        <select value={form.folderId} disabled={disabled} onChange={(e) => setForm({ ...form, folderId: e.target.value })} data-testid="folder-select">
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
      {children}
    </>
  );
}
