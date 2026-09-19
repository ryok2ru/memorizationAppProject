import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  applyRating,
  canUndo,
  completed,
  currentWordId,
  discardAndSave,
  endEarly,
  getSession,
  isFinished,
  rateAndSave,
  remaining,
  setSession,
  skipCurrent,
  markShown,
  undoAndSave,
  type StudyMode,
} from '../app/session';
import { getWord, setFavorite } from '../db/repo';
import { updateBadge } from '../app/badge';
import type { Grade, Word } from '../domain/types';
import { useSession } from './hooks';

/**
 * 学習画面共通: 現在の単語の読み込み、評価と保存、取り消し、終了処理。
 * セッションが無い、またはモードが合わなければホームへ戻る。
 */
export function useStudy(expected: (mode: StudyMode) => boolean) {
  const session = useSession();
  const navigate = useNavigate();
  const [word, setWord] = useState<Word | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /**
   * 取り消しで戻った出題位置（cardKey）。フラッシュカードはこの位置を裏面で表示する。
   * セッション（外部ストア）の更新と同じ描画で参照できるよう、state ではなく ref に持ち、setSession の前に書く。
   */
  const restoredKey = useRef<string | null>(null);
  /**
   * 「結果を破棄して終了」でこの画面を離れている途中か。
   * HashRouter の遷移は hashchange を待つので、セッションを捨てた直後にこの画面がもう一度描かれる。
   * その描画で下の useEffect がホームへ戻してしまわないようにする
   */
  const leaving = useRef(false);
  const wordId = session ? currentWordId(session) : undefined;
  /** 出題位置の識別子（index と単語 id）。変わるたびに単語を読み直す */
  const cardKey = session ? `${session.index}:${wordId ?? ''}` : '';

  useEffect(() => {
    if (leaving.current) return;
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
  }, [cardKey]);

  /** 結果画面へ。バッジは結果画面が表示時に更新する（6-3: キューを消化した時点でセッション完了） */
  const finish = useCallback(() => {
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
        next = applyRating(s, word, grade, result.word, result.log.id, now);
      } else {
        setMessage(result.reason === 'quota' ? '端末の空き容量が不足しています' : '保存に失敗しました');
        next = skipCurrent(s, now);
      }
      restoredKey.current = null;
      setSession(next);
      setBusy(false);
      if (isFinished(next)) finish();
    },
    [word, busy, finish],
  );

  /** 直前の評価を取り消す（6-3）。DB を戻せたときだけセッション状態を戻す */
  const undo = useCallback(async () => {
    const s = getSession();
    if (!s || busy || !canUndo(s)) return;
    setBusy(true);
    setMessage(null);
    const result = await undoAndSave(s);
    if (result.ok) {
      restoredKey.current = `${result.state.index}:${result.wordId}`;
      setSession(result.state);
    } else if (result.reason !== 'empty') {
      setMessage(result.reason === 'quota' ? '端末の空き容量が不足しています' : '取り消しに失敗しました');
    }
    setBusy(false);
  }, [busy]);

  /** ☆ の切り替え（7-6）。表面・裏面のどちらでも押せて、出題やキューには関わらない */
  const toggleFavorite = useCallback(async () => {
    if (!word) return;
    const { id } = word;
    const next = !word.favorite;
    setWord((w) => (w && w.id === id ? { ...w, favorite: next } : w));
    try {
      await setFavorite(id, next);
    } catch (e) {
      console.error('failed to toggle favorite', e);
      setWord((w) => (w && w.id === id ? { ...w, favorite: !next } : w));
      setMessage('保存に失敗しました');
    }
  }, [word]);

  /** 結果を保存して終了（6-3、7-6）。評価済みの分はすでに保存されているので、結果画面へ移るだけ */
  const quit = useCallback(() => {
    const s = getSession();
    if (!s) return;
    setSession(endEarly(s));
    finish();
  }, [finish]);

  /**
   * 結果を破棄して終了（6-3、7-6）。このセッションの評価をすべて取り消し、
   * 結果画面を出さずにモード選択画面へ戻る。バッジも戻した件数で更新する
   */
  const discard = useCallback(async () => {
    const s = getSession();
    if (!s || busy) return;
    setBusy(true);
    setMessage(null);
    const result = await discardAndSave(s);
    if (!result.ok) {
      setMessage(result.reason === 'quota' ? '端末の空き容量が不足しています' : '取り消しに失敗しました');
      setBusy(false);
      return;
    }
    await updateBadge();
    leaving.current = true;
    navigate(`/study/select?scope=${s.context.scope}`, { replace: true });
    setSession(null);
  }, [busy, navigate]);

  return {
    session,
    word,
    message,
    busy,
    rate,
    undo,
    favorite: word?.favorite ?? false,
    toggleFavorite,
    canUndo: session ? canUndo(session) : false,
    /** 評価が 0 件なら「結果を破棄して終了」は非活性（6-3、7-6） */
    canDiscard: session ? canUndo(session) : false,
    quit,
    discard,
    cardKey,
    /** その出題位置が取り消しで戻ったものか。cardKey が変わった後の useEffect から呼ぶ */
    isRestored: (key: string) => restoredKey.current === key,
    remaining: session ? remaining(session) : 0,
    completed: session ? completed(session) : 0,
  };
}
