import { afterEach, describe, expect, it, vi } from 'vitest';
import { badgePermission, requestBadgePermission } from './badge';

describe('badge permission', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Notification が無ければ unsupported', async () => {
    vi.stubGlobal('Notification', undefined);
    expect(badgePermission()).toBe('unsupported');
    expect(await requestBadgePermission()).toBe('unsupported');
  });

  it('現在の許可の状態を返す', () => {
    vi.stubGlobal('Notification', { permission: 'denied' });
    expect(badgePermission()).toBe('denied');
  });

  it('許可を求めて、許可されたらバッジを更新する', async () => {
    const requestPermission = vi.fn(async () => 'granted');
    const clearAppBadge = vi.fn(async () => {});
    vi.stubGlobal('Notification', { permission: 'default', requestPermission });
    vi.stubGlobal('navigator', { setAppBadge: vi.fn(async () => {}), clearAppBadge });
    expect(await requestBadgePermission()).toBe('granted');
    expect(requestPermission).toHaveBeenCalledTimes(1);
    // カードが無いので今日の復習数は 0。バッジを消す
    expect(clearAppBadge).toHaveBeenCalledTimes(1);
  });

  it('拒否されたらバッジを更新しない', async () => {
    const setAppBadge = vi.fn(async () => {});
    const clearAppBadge = vi.fn(async () => {});
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn(async () => 'denied') });
    vi.stubGlobal('navigator', { setAppBadge, clearAppBadge });
    expect(await requestBadgePermission()).toBe('denied');
    expect(setAppBadge).not.toHaveBeenCalled();
    expect(clearAppBadge).not.toHaveBeenCalled();
  });

  it('許可を求める途中で失敗したら、その時点の状態を返す', async () => {
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: vi.fn(async () => {
        throw new Error('x');
      }),
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await requestBadgePermission()).toBe('default');
  });
});
