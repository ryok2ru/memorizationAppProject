import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { getSession, subscribeSession } from '../app/session';

export function useSession() {
  return useSyncExternalStore(subscribeSession, getSession, getSession);
}

/** 非同期ローダーの結果と再読み込み関数 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]): { data: T | null; reload: () => void; error: unknown } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let alive = true;
    loader().then(
      (d) => alive && setData(d),
      (e) => {
        console.error(e);
        alive && setError(e);
      },
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);
  return { data, reload, error };
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return true;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true;
}

/** 10-4 のエラーメッセージ */
export function errorMessage(e: unknown): string {
  const name = (e as { name?: string } | null)?.name ?? '';
  const inner = (e as { inner?: { name?: string } } | null)?.inner?.name ?? '';
  if (name === 'QuotaExceededError' || inner === 'QuotaExceededError') return '端末の空き容量が不足しています';
  return '保存に失敗しました';
}
