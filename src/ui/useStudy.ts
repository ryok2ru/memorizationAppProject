import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  applyRating,
  completed,
  currentWordId,
  endEarly,
  getSession,
  isFinished,
  rateAndSave,
  remaining,
  setSession,
  skipCurrent,
  markShown,
  type StudyMode,
} from '../app/session';
import { getWord } from '../db/repo';
import { updateBadge } from '../app/badge';
import type { Grade, Word } from '../domain/types';
import { useSession } from './hooks';

/**
 * 学習画面共通: 現在の単語の読み込み、評価と保存、終了処理。
 * セッションが無い、またはモードが合わなければホームへ戻る。
 */
export function useStudy(expected: (mode: StudyMode) => boolean) {
  const session = useSession();
  const navigate = useNavigate();
  const [word, setWord] = useState<Word | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wordId = session ? currentWordId(session) : undefined;
  const shownKey = session ? `${session.index}:${wordId ?? ''}` : '';

  useEffect(() => {
    if (!session || !expected(session.mode)) {
      navigate('/', { replace: true });
      return;
    }
    if (isFinished(session)) {
      navigate('/study/result', { replace: true });
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, navigate]);

  useEffect(() => {
    if (!wordId) return;
    let alive = true;
    setWord(null);
    void getWord(wordId).then((w) => {
      if (!alive) return;
      if (!w) {
        // 単語が消えていたらスキップ
        const s = getSession();
        if (s) setSession(skipCurrent(s));
        return;
      }
      setWord(w);
      const s = getSession();
      if (s) setSession(markShown(s, wordId));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey]);

  const finish = useCallback(async () => {
    await updateBadge();
    navigate('/study/result', { replace: true });
  }, [navigate]);

  const rate = useCallback(
    async (grade: Grade) => {
      const s = getSession();
      if (!s || !word || busy) return;
      setBusy(true);
      setMessage(null);
      const now = Date.now();
      const result = await rateAndSave(word, grade, now);
      let next;
      if (result.ok) {
        next = applyRating(s, word.id, grade, result.word, now);
      } else {
        setMessage(result.reason === 'quota' ? '端末の空き容量が不足しています' : '保存に失敗しました');
        next = skipCurrent(s, now);
      }
      setSession(next);
      setBusy(false);
      if (isFinished(next)) await finish();
    },
    [word, busy, finish],
  );

  const quit = useCallback(async () => {
    const s = getSession();
    if (!s) return;
    setSession(endEarly(s));
    await finish();
  }, [finish]);

  return {
    session,
    word,
    message,
    busy,
    rate,
    quit,
    remaining: session ? remaining(session) : 0,
    completed: session ? completed(session) : 0,
  };
}
