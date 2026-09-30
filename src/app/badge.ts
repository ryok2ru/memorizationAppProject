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
    const n = await countDueWords('all', now);
    if (n > 0) await nav.setAppBadge(n);
    else if (typeof nav.clearAppBadge === 'function') await nav.clearAppBadge();
    else await nav.setAppBadge(0);
  } catch (e) {
    console.warn('badge update failed', e);
  }
}

/**
 * バッジの表示に要る許可の状態（8-7）。iOS はホーム画面に追加したアプリでだけ Notification があり、
 * 通知の許可が無いとバッジが出ない。unsupported = Notification が無い（Safari のタブなど）
 */
export type BadgePermission = 'granted' | 'denied' | 'default' | 'unsupported';

export function badgePermission(): BadgePermission {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

/** 通知の許可を求め、許可されたらバッジを更新する。ボタンを押したときだけ呼ぶ（iOS はユーザー操作の中でしか許可を出せない） */
export async function requestBadgePermission(now = Date.now()): Promise<BadgePermission> {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    const result = await Notification.requestPermission();
    if (result === 'granted') await updateBadge(now);
    return result;
  } catch (e) {
    console.warn('notification permission failed', e);
    return badgePermission();
  }
}
