import { countDueWords } from '../db/repo';

type BadgeNavigator = Navigator & {
  setAppBadge?: (n?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/** 今日の復習数をアプリバッジに反映する。未対応なら何もしない */
export async function updateBadge(now = Date.now()): Promise<void> {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as BadgeNavigator;
  if (!('setAppBadge' in nav) || typeof nav.setAppBadge !== 'function') return;
  try {
    const n = await countDueWords(null, now);
    if (n > 0) await nav.setAppBadge(n);
    else if (typeof nav.clearAppBadge === 'function') await nav.clearAppBadge();
    else await nav.setAppBadge(0);
  } catch (e) {
    console.warn('badge update failed', e);
  }
}
