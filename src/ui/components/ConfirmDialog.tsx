import { useEffect, useRef } from 'react';
import { syncModal, useCloseOnOutside } from './modal';

interface Props {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** <dialog> を使った確認ダイアログ。フォーカスはダイアログ内に閉じ込められる。外側タップはキャンセルと同じ（7-9） */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel = 'キャンセル',
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => syncModal(ref.current, open), [open]);
  const outside = useCloseOnOutside(onCancel);
  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      onCancel={(e) => { e.preventDefault(); onCancel(); }}
      {...outside}
      aria-labelledby="confirm-title"
    >
      {title && <h2 id="confirm-title">{title}</h2>}
      <p>{message}</p>
      <div className="btn-row">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
