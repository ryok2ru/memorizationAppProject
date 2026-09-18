import {
  fsrs,
  generatorParameters,
  createEmptyCard,
  type Card,
  type Grade as TsGrade,
} from 'ts-fsrs';
import type { Word, FsrsFields, ReviewLog, Grade } from './types';
import { GRADES } from './types';
import { endOfDay } from './dates';

export const scheduler = fsrs(
  generatorParameters({
    request_retention: 0.9,
    maximum_interval: 36500,
    enable_fuzz: false,
    enable_short_term: true,
    // 設計書 5-2 は ['10m'] だが、ts-fsrs 5.4 では 1 段だと New に Good で
    // 直接 Review に進み、5-3 / 12-1 の「10 分後に 1 回再出題」にならない。
    // 2 段にすると Good で 10 分後に再出題され、次の Good で Review に進む。
    learning_steps: ['10m', '10m'],
    relearning_steps: ['10m'],
  }),
);

export function toCard(w: FsrsFields): Card {
  return {
    due: new Date(w.due),
    stability: w.stability,
    difficulty: w.difficulty,
    elapsed_days: w.elapsed_days,
    scheduled_days: w.scheduled_days,
    learning_steps: w.learning_steps,
    reps: w.reps,
    lapses: w.lapses,
    state: w.state,
    last_review: w.last_review == null ? undefined : new Date(w.last_review),
  };
}

export function fromCard(c: Card): FsrsFields {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as FsrsFields['state'],
    last_review: c.last_review ? c.last_review.getTime() : null,
  };
}

export const newCardFields = (now: number): FsrsFields => fromCard(createEmptyCard(new Date(now)));

export const FSRS_KEYS: readonly (keyof FsrsFields)[] = [
  'due',
  'stability',
  'difficulty',
  'elapsed_days',
  'scheduled_days',
  'learning_steps',
  'reps',
  'lapses',
  'state',
  'last_review',
];

/** 数値項目に NaN / Infinity が含まれていないか */
export function isFinitePayload(fields: FsrsFields, log: ReviewLog): boolean {
  const nums = [
    fields.due,
    fields.stability,
    fields.difficulty,
    fields.elapsed_days,
    fields.scheduled_days,
    fields.learning_steps,
    fields.reps,
    fields.lapses,
    log.due,
    log.stability,
    log.difficulty,
    log.elapsed_days,
    log.last_elapsed_days,
    log.scheduled_days,
    log.learning_steps,
    log.review,
  ];
  if (fields.last_review != null) nums.push(fields.last_review);
  return nums.every((n) => Number.isFinite(n));
}

export function rate(word: Word, grade: Grade, now: number): { word: Word; log: ReviewLog } {
  const { card, log } = scheduler.next(toCard(word), new Date(now), grade as TsGrade);
  return {
    word: { ...word, ...fromCard(card), updatedAt: now },
    log: {
      id: crypto.randomUUID(),
      wordId: word.id,
      rating: log.rating as Grade,
      state: log.state as FsrsFields['state'],
      due: log.due.getTime(),
      stability: log.stability,
      difficulty: log.difficulty,
      elapsed_days: log.elapsed_days,
      last_elapsed_days: log.last_elapsed_days,
      scheduled_days: log.scheduled_days,
      learning_steps: log.learning_steps,
      review: log.review.getTime(),
    },
  };
}

export interface PreviewItem {
  due: number;
  label: string;
}

/** due − now が 60 分未満なら「N分後」、当日中なら「今日」、それ以外は scheduled_days で「N日後」 */
export function previewLabel(due: number, scheduledDays: number, now: number): string {
  const diffMin = (due - now) / 60000;
  if (diffMin < 60) return `${Math.max(1, Math.round(diffMin))}分後`;
  if (due <= endOfDay(now)) return '今日';
  return `${Math.max(1, Math.round(scheduledDays))}日後`;
}

export function preview(word: Word, now: number): Record<Grade, PreviewItem> {
  const record = scheduler.repeat(toCard(word), new Date(now));
  const result = {} as Record<Grade, PreviewItem>;
  for (const g of GRADES) {
    const { card } = record[g as TsGrade];
    const due = card.due.getTime();
    result[g] = { due, label: previewLabel(due, card.scheduled_days, now) };
  }
  return result;
}

export function retrievability(word: Word, now: number): number {
  return scheduler.get_retrievability(toCard(word), new Date(now), false);
}
