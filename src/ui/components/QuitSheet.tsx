import { useEffect, useRef } from 'react';
import { syncModal } from './modal';

interface Props {
  open: boolean;
  /** 評価が 0 件なら「結果を破棄して終了」は非活性（6-3、7-6） */
  canDiscard: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

/**
 * 学習画面の ✕ を押したときの 3 択のシート（6-3、7-6）。
 * 下から出し、フォルダのメニュー（7-2）と同じ枠線付きのボタンを縦に並べる。
 */
export function QuitSheet({ open, canDiscard, onSave, onDiscard, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => syncModal(ref.current, open), [open]);
  return (
    <dialog
      className="sheet"
      ref={ref}
      tabIndex={-1}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      aria-labelledby="quit-title"
      data-testid="quit-sheet"
    >
      <h2 id="quit-title">セッションを終了しますか？</h2>
      <div className="menu-buttons">
        {/* 従来の途中終了と同じ動作。評価済みの分は保存済みで、結果画面へ移る */}
        <button type="button" className="btn-outline" onClick={onSave} data-testid="quit-save">
          結果を保存して終了
        </button>
        {/* このセッションの評価をすべて取り消してモード選択へ戻る */}
        <button type="button" className="btn-outline-danger" disabled={!canDiscard} onClick={onDiscard} data-testid="quit-discard">
          結果を破棄して終了
        </button>
        <button type="button" className="btn-outline-quiet" onClick={onCancel} data-testid="quit-cancel">
          キャンセル
        </button>
      </div>
    </dialog>
  );
}
