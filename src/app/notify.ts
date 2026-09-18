import type { Settings, Word } from '../domain/types';
import { addDays, formatNotifyAt, parseHHMM, startOfDay } from '../domain/dates';
import { getSettings, listAllWords, saveSettings } from '../db/repo';

export interface NotifyItem {
  at: string; // "YYYY-MM-DD HH:MM"（ローカル時刻）
  title: string;
}

export interface NotifyPayload {
  v: 1;
  list: 'VocaVault';
  items: NotifyItem[];
}

export const SHORTCUT_NAME = 'VocaVault通知';
export const MAX_NOTIFY_DAYS = 30;

/** 今日 + d 日の通知時刻（ms） */
export function notifyTimeOnDay(now: number, d: number, notifyTime: string): number {
  const { h, m } = parseHHMM(notifyTime);
  const day = new Date(startOfDay(addDays(now, d)));
  day.setHours(h, m, 0, 0);
  return day.getTime();
}

export function buildNotifyPayload(words: Word[], settings: Settings, now: number): NotifyPayload {
  const days = Math.min(MAX_NOTIFY_DAYS, Math.max(1, Math.floor(settings.notifyDays)));
  const reviewed = words.filter((w) => w.state !== 0);
  const items: NotifyItem[] = [];
  for (let d = 1; d <= days; d++) {
    const at = notifyTimeOnDay(now, d, settings.notifyTime);
    const n = reviewed.filter((w) => w.due <= at).length;
    if (n === 0) continue;
    items.push({
      at: formatNotifyAt(at),
      title: d === 1 ? `今日は${n}語の復習があります` : `復習が溜まっています。今日は${n}語`,
    });
  }
  return { v: 1, list: 'VocaVault', items };
}

export function buildShortcutUrl(payload: NotifyPayload): string {
  return `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}&input=text&text=${encodeURIComponent(JSON.stringify(payload))}`;
}

/** 最終予約から 2 日以上経っているか */
export function needsRefresh(lastScheduledAt: number | null, now: number): boolean {
  if (lastScheduledAt == null) return false;
  return now - lastScheduledAt >= 2 * 24 * 60 * 60 * 1000;
}

/**
 * 「今日の学習を終える」: 全単語から予約 JSON を作り、最終予約を保存してから
 * Shortcut の URL を返す。UI は戻り値を window.location.href に入れる。
 */
export async function finishToday(now = Date.now()): Promise<{ url: string; itemCount: number }> {
  const [words, settings] = await Promise.all([listAllWords(), getSettings()]);
  const payload = buildNotifyPayload(words, settings, now);
  await saveSettings({ lastNotifyScheduledAt: now, lastNotifyItemCount: payload.items.length });
  return { url: buildShortcutUrl(payload), itemCount: payload.items.length };
}
