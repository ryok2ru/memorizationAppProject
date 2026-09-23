export type CardState = 0 | 1 | 2 | 3; // New, Learning, Review, Relearning
export type Grade = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

/**
 * 集計・抽出・学習セッションの対象範囲（6-1、7-2）。
 * 'all' = 全フォルダ、'favorites' = お気に入り（favorite = true）だけ、それ以外はフォルダ id。
 */
export type Scope = 'all' | 'favorites' | (string & {});

export const FAVORITES: Scope = 'favorites';

/** scope が指すフォルダ id（全フォルダ・お気に入りなら null） */
export const scopeFolderId = (scope: Scope): string | null => (scope === 'all' || scope === FAVORITES ? null : scope);

/** scope がお気に入りだけを見るか */
export const isFavoritesScope = (scope: Scope): boolean => scope === FAVORITES;

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
  sortOrder: number;
}

export interface FsrsFields {
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: CardState;
  last_review: number | null;
}

export interface Word extends FsrsFields {
  id: string;
  folderId: string;
  englishTerm: string;
  japaneseDefinition: string;
  memo: string;
  /** お気に入り（☆）。既定 false（4-3） */
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ReviewLog {
  id: string;
  wordId: string;
  rating: Grade;
  state: CardState;
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  last_elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  review: number;
}

/** CSV / TSV 取込の区切り文字 */
export type ImportDelimiter = ',' | '\t' | ';';
/** 取込時の列の割り当て */
export type ImportColumnRole = 'en' | 'ja' | 'memo' | 'skip';

export interface Settings {
  id: 'app';
  maxCardsPerSession: number; // 10..100 step 10, default 30
  cardOrder: 'dueFirst' | 'random';
  notifyEnabled: boolean;
  notifyTime: string; // "HH:MM"
  notifyDays: number; // 1..30, default 7
  lastNotifyScheduledAt: number | null;
  lastNotifyItemCount: number;
  importDelimiter: ImportDelimiter; // 最後に使った区切り文字
  importHasHeader: boolean; // 最後に使った「1行目は見出し」
  importColumns: ImportColumnRole[]; // 最後に使った列の割り当て（左から）
  calendarStartDate: number | null; // カレンダーの表示開始日時（7-11）。null なら全期間
  schemaVersion: 2;
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  maxCardsPerSession: 30,
  cardOrder: 'dueFirst',
  notifyEnabled: false,
  notifyTime: '08:00',
  notifyDays: 7,
  lastNotifyScheduledAt: null,
  lastNotifyItemCount: 0,
  importDelimiter: ',',
  importHasHeader: false,
  importColumns: ['en', 'ja', 'memo'],
  calendarStartDate: null,
  schemaVersion: 2,
};

export const LIMITS = {
  englishTerm: 200,
  japaneseDefinition: 500,
  memo: 1000,
  folderName: 50,
  masteredStability: 30,
} as const;

export const GRADES: readonly Grade[] = [1, 2, 3, 4];

/** 評価ボタンの表示（5-3）。フラッシュカード、タイプ入力、結果画面で共通 */
export const GRADE_NAMES: Record<Grade, string> = {
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
};

export const STATE_NAMES: Record<CardState, string> = {
  0: 'New',
  1: 'Learning',
  2: 'Review',
  3: 'Relearning',
};

export const STATE_ICONS: Record<CardState, string> = {
  0: '⬜',
  1: '🟡',
  2: '🟢',
  3: '🔴',
};
