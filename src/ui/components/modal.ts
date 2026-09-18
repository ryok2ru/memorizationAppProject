/**
 * open に合わせて <dialog> を showModal() / close() する。
 * 開いたときはフォーカスをダイアログ自身に置く。showModal() は最初のボタンにフォーカスを置き、
 * Safari はそれをキーボード操作と同じ「可視」のフォーカスとして扱うので、タップで開いてもフォーカス枠が出てしまうため
 */
export function syncModal(el: HTMLDialogElement | null, open: boolean): void {
  if (!el) return;
  if (open && !el.open) {
    el.showModal();
    el.focus();
  } else if (!open && el.open) {
    el.close();
  }
}
