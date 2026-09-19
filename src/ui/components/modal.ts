import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

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

/** getBoundingClientRect() のうち判定に使う 4 辺だけ */
export interface Edges {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * 点が矩形の外側かどうか。<dialog> の背景（::backdrop）のタップは dialog 要素自身に届くが、
 * dialog には 20px の余白があり、その余白を押したときも同じ要素に届く。
 * 余白は中身の一部なので、target ではなく座標で内外を判定する
 */
export function isOutside(edges: Edges, x: number, y: number): boolean {
  return x < edges.left || x > edges.right || y < edges.top || y > edges.bottom;
}

/**
 * 外側タップの判定（7-9）。押し始めと離した位置の両方が外側だったときだけ閉じる。
 * 中身の上で押し始めて外側で離した場合（文字の選択やスワイプの流れ）は閉じない
 */
export function outsidePress() {
  let startedOutside = false;
  return {
    /** 押し始め。外側で始まったかを覚える */
    start(outside: boolean): void {
      startedOutside = outside;
    },
    /** 指が離れた（または押下が取り消された）。閉じるなら true */
    end(outside: boolean): boolean {
      const close = startedOutside && outside;
      startedOutside = false;
      return close;
    },
  };
}

/**
 * <dialog> の外側（背景の暗い部分）をタップしたらキャンセルと同じ動作で閉じる（7-9）。
 * 戻り値をそのまま <dialog> に展開して使う。取込画面は全画面の作業なので対象外。
 * キーボードの Enter は pointer イベントを出さないので、ここでは誤って閉じない
 */
export function useCloseOnOutside(onClose: () => void) {
  const press = useRef<ReturnType<typeof outsidePress>>();
  if (!press.current) press.current = outsidePress();
  const at = (e: ReactPointerEvent<HTMLDialogElement>) =>
    isOutside(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY);
  return {
    onPointerDown: (e: ReactPointerEvent<HTMLDialogElement>) => press.current!.start(at(e)),
    onPointerUp: (e: ReactPointerEvent<HTMLDialogElement>) => {
      if (press.current!.end(at(e))) onClose();
    },
    onPointerCancel: () => press.current!.end(false),
  };
}
