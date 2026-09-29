/**
 * 選択モードの「すべて選択 / 選択解除」（7-2 のフォルダ、7-3 の単語一覧）。
 * ids は画面に出ている行の id。対象外の選択には触れない。
 */

/** ids が 1 件以上あり、すべて選択済みなら true（ボタンを「選択解除」にする） */
export const allSelected = (selected: ReadonlySet<string>, ids: readonly string[]): boolean =>
  ids.length > 0 && ids.every((id) => selected.has(id));

/** すべて選択済みなら ids を外し、それ以外なら ids を加えた新しい Set を返す */
export function toggleAll(selected: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  const next = new Set(selected);
  if (allSelected(selected, ids)) for (const id of ids) next.delete(id);
  else for (const id of ids) next.add(id);
  return next;
}
