import type { Settings } from '../domain/types';
import { getSettings, saveSettings } from '../db/repo';
import { MAX_NOTIFY_DAYS } from './notify';

export const MAX_CARDS_OPTIONS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;

export function clampMaxCards(n: number): number {
  const rounded = Math.round(n / 10) * 10;
  return Math.min(100, Math.max(10, rounded));
}

export function clampNotifyDays(n: number): number {
  if (!Number.isFinite(n)) return 7;
  return Math.min(MAX_NOTIFY_DAYS, Math.max(1, Math.floor(n)));
}

export const loadSettings = (): Promise<Settings> => getSettings();

export function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next: Partial<Settings> = { ...patch };
  if (next.maxCardsPerSession != null) next.maxCardsPerSession = clampMaxCards(next.maxCardsPerSession);
  if (next.notifyDays != null) next.notifyDays = clampNotifyDays(next.notifyDays);
  if (next.notifyTime != null && !/^\d{2}:\d{2}$/.test(next.notifyTime)) next.notifyTime = '08:00';
  return saveSettings(next);
}

let persistRequested = false;
/** 8-5: 初回のユーザー操作で一度だけ永続化を要求する */
export function requestPersistentStorage(): void {
  if (persistRequested) return;
  persistRequested = true;
  try {
    void navigator.storage?.persist?.();
  } catch {
    /* ignore */
  }
}
