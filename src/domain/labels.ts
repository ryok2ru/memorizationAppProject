import type { Folder, Scope } from './types';
import { scopeFolderId } from './types';

/** カードの表と裏の項目名（4-2） */
export interface Labels {
  front: string;
  back: string;
}

/** 新しいフォルダの項目名 */
export const DEFAULT_LABELS: Labels = { front: '表', back: '裏' };

/** 項目名を持つ前（DB v4 以前、項目名の無いバックアップ）のフォルダの項目名 */
export const LEGACY_LABELS: Labels = { front: '英単語', back: '日本語訳' };

/** フォルダの項目名。フォルダが無い、または値が欠けていれば DEFAULT_LABELS */
export function folderLabels(folder?: Pick<Folder, 'frontLabel' | 'backLabel'>): Labels {
  return {
    front: folder?.frontLabel || DEFAULT_LABELS.front,
    back: folder?.backLabel || DEFAULT_LABELS.back,
  };
}

/**
 * 学習の対象範囲の項目名（7-5、7-6）。フォルダならそのフォルダの項目名。
 * 全フォルダ・お気に入りは、全フォルダの項目名が同じならそれ、違えば DEFAULT_LABELS
 */
export function labelsForScope(scope: Scope, folders: Folder[]): Labels {
  const id = scopeFolderId(scope);
  if (id != null) return folderLabels(folders.find((f) => f.id === id));
  const all = folders.map((f) => folderLabels(f));
  if (all.length === 0) return DEFAULT_LABELS;
  const [first] = all;
  return all.every((l) => l.front === first.front && l.back === first.back) ? first : DEFAULT_LABELS;
}
