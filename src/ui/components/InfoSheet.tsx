import { useEffect, useRef } from 'react';
import { syncModal, useCloseOnOutside } from './modal';
import { STATE_ICONS, STATE_NAMES, type CardState, type Grade } from '../../domain/types';

/** 【状態】の文面（設計書 7-9）。アイコンと名前は STATE_ICONS / STATE_NAMES を使う */
export const INFO_STATES: { state: CardState; text: string }[] = [
  { state: 0, text: 'まだ一度も学習していない単語。' },
  { state: 1, text: '初めて評価したあと、このセッション内で再出題を待っている単語。再出題で Hard 以上なら Review に進む。' },
  { state: 2, text: '復習段階に入った単語。FSRS が決めた間隔で復習する。' },
  { state: 3, text: '復習で Again を押した単語。再出題で Hard 以上なら Review に戻る。' },
];

/** 【評価】の文面（設計書 7-9）。並びは Again → Hard → Good → Easy */
export const INFO_GRADES: { grade: Grade; name: string; text: string }[] = [
  { grade: 1, name: 'Again', text: '意味が出てこなかった。安定性が下がり、このセッション内でもう一度出る。' },
  { grade: 2, name: 'Hard', text: '思い出せたが時間がかかった、または自信がなかった。間隔は Good より短くなる。' },
  { grade: 3, name: 'Good', text: '普通に思い出せた。標準的に間隔が伸びる。迷ったらこれ。' },
  { grade: 4, name: 'Easy', text: '見た瞬間に分かった。間隔が最も長くなる。新しい単語なら再出題なしで Review に進む。' },
];

/** 【補足】の文面（設計書 7-9） */
export const INFO_NOTES: string[] = [
  '一覧のアイコンは状態を表す。状態は評価の結果として自動で変わる。',
  'ボタンの下の「N日後」は、その評価を押した場合の次回。↻ はこのセッション内でもう一度出ること。',
];

/**
 * 状態と評価の説明を下から出すシート（7-9）。
 * ホームの右上の ⓘ と、設定のアプリ情報の行の両方から同じものを開く。
 */
export function InfoSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => syncModal(ref.current, open), [open]);
  const outside = useCloseOnOutside(onClose);
  return (
    <dialog
      className="sheet"
      ref={ref}
      tabIndex={-1}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      {...outside}
      aria-labelledby="info-title"
      data-testid="info-sheet"
    >
      <h2 id="info-title">状態と評価の説明</h2>
      <div className="sheet-body">
        <h3>状態</h3>
        <ul className="info-list">
          {INFO_STATES.map((s) => (
            <li key={s.state}>
              <span aria-hidden="true">{STATE_ICONS[s.state]}</span> <span className="info-name">{STATE_NAMES[s.state]}</span>: {s.text}
            </li>
          ))}
        </ul>
        <h3>評価</h3>
        <ul className="info-list">
          {INFO_GRADES.map((g) => (
            <li key={g.grade}>
              <span className={`info-name text-grade-${g.grade}`}>{g.name}</span>: {g.text}
            </li>
          ))}
        </ul>
        <h3>補足</h3>
        <ul className="info-list">
          {INFO_NOTES.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
      <div className="btn-row">
        <button type="button" className="btn-primary" onClick={onClose}>
          閉じる
        </button>
      </div>
    </dialog>
  );
}
