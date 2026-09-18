import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  /** aria-label */
  label: string;
  title?: string;
  onClose: () => void;
  children: ReactNode;
}

/** <dialog> を使ったアクションシート。子要素にボタンを並べ、末尾にキャンセルを付ける */
export function ActionSheet({ open, label, title, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {title && <h2>{title}</h2>}
      <div className="sheet-actions">
        {children}
        <button type="button" className="btn-secondary" onClick={onClose}>
          キャンセル
        </button>
      </div>
    </dialog>
  );
}
