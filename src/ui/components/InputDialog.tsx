import { useEffect, useRef, useState } from 'react';
import { useCloseOnOutside } from './modal';

interface Props {
  open: boolean;
  title: string;
  initialValue?: string;
  placeholder?: string;
  maxLength?: number;
  confirmLabel?: string;
  /** null なら OK。文字列ならエラー表示 */
  validate?: (value: string) => string | null;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

/** 1 行入力のダイアログ（フォルダ名など）。外側タップはキャンセルと同じ（7-9） */
export function InputDialog({
  open,
  title,
  initialValue = '',
  placeholder,
  maxLength,
  confirmLabel = '保存',
  validate,
  onConfirm,
  onCancel,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      setValue(initialValue);
      setTouched(false);
      el.showModal();
      setTimeout(() => inputRef.current?.focus(), 0);
    } else if (!open && el.open) el.close();
  }, [open, initialValue]);

  const outside = useCloseOnOutside(onCancel);

  const error = validate ? validate(value) : value.trim().length === 0 ? '入力してください' : null;

  const submit = () => {
    setTouched(true);
    if (error) return;
    onConfirm(value.trim());
  };

  return (
    <dialog
      ref={ref}
      onCancel={(e) => { e.preventDefault(); onCancel(); }}
      {...outside}
      aria-labelledby="input-title"
    >
      <h2 id="input-title">{title}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          aria-label={title}
          onChange={(e) => {
            setValue(e.target.value);
            setTouched(true);
          }}
        />
        {touched && error && <p className="error">{error}</p>}
        <div className="btn-row">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            キャンセル
          </button>
          <button type="submit" className="btn-primary" disabled={!!error}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
