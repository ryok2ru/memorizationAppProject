import { useEffect, useId, useRef, useState, type Ref } from 'react';
import { useCloseOnOutside } from './modal';
import { LIMITS } from '../../domain/types';
import { DEFAULT_LABELS, type Labels } from '../../domain/labels';
import { validateFolderLabel } from '../../domain/validation';

export interface FolderDialogValue {
  name: string;
  labels: Labels;
}

interface Props {
  open: boolean;
  title: string;
  /** 編集なら今の値。追加なら省略し、名前は空、項目名は「表」「裏」 */
  initial?: FolderDialogValue;
  confirmLabel?: string;
  /** フォルダ名の検証。null なら OK */
  validateName: (name: string) => string | null;
  onConfirm: (value: FolderDialogValue) => void;
  onCancel: () => void;
}

/** フォルダの追加・編集ダイアログ（7-2）。フォルダ名と、カードの表・裏の項目名を入れる。外側タップはキャンセルと同じ（7-9） */
export function FolderDialog({ open, title, initial, confirmLabel = '保存', validateName, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  // 追加と編集の 2 つを同時に置くので、見出しの id は重ならないように作る
  const titleId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      setName(initial?.name ?? '');
      setFront(initial?.labels.front ?? DEFAULT_LABELS.front);
      setBack(initial?.labels.back ?? DEFAULT_LABELS.back);
      setTouched(false);
      el.showModal();
      setTimeout(() => nameRef.current?.focus(), 0);
    } else if (!open && el.open) el.close();
  }, [open, initial]);

  const outside = useCloseOnOutside(onCancel);

  const errors = {
    name: validateName(name),
    front: validateFolderLabel(front, '表の項目名'),
    back: validateFolderLabel(back, '裏の項目名'),
  };
  const valid = !errors.name && !errors.front && !errors.back;

  const submit = () => {
    setTouched(true);
    if (!valid) return;
    onConfirm({ name: name.trim(), labels: { front: front.trim(), back: back.trim() } });
  };

  const field = (label: string, value: string, set: (v: string) => void, error: string | null, max: number, inputRef?: Ref<HTMLInputElement>) => (
    <label className="field">
      <span>{label}</span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        maxLength={max}
        onChange={(e) => {
          set(e.target.value);
          setTouched(true);
        }}
      />
      {touched && error && <p className="error">{error}</p>}
    </label>
  );

  return (
    <dialog
      ref={ref}
      onCancel={(e) => { e.preventDefault(); onCancel(); }}
      {...outside}
      aria-labelledby={titleId}
    >
      <h2 id={titleId}>{title}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        {field('フォルダ名', name, setName, errors.name, LIMITS.folderName, nameRef)}
        {field('表の項目名', front, setFront, errors.front, LIMITS.folderLabel)}
        {field('裏の項目名', back, setBack, errors.back, LIMITS.folderLabel)}
        <p className="small muted" style={{ margin: 0 }}>
          項目名はカードの入力欄や学習モードの名前に使います（例: 英単語 / 日本語訳、用語 / 説明）
        </p>
        <div className="btn-row">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            キャンセル
          </button>
          <button type="submit" className="btn-primary" disabled={!valid}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
