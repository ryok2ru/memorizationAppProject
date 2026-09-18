import { describe, expect, it } from 'vitest';
import { INFO_GRADES, INFO_NOTES, INFO_STATES } from './InfoSheet';
import { STATE_ICONS, STATE_NAMES } from '../../domain/types';

/** 設計書 7-9 に載せた文面と一字一句そろえる */
describe('InfoSheet の文面', () => {
  it('状態は New → Learning → Review → Relearning の順で、アイコンと名前は STATE_ICONS / STATE_NAMES を使う', () => {
    expect(INFO_STATES.map((s) => s.state)).toEqual([0, 1, 2, 3]);
    expect(INFO_STATES.map((s) => `${STATE_ICONS[s.state]} ${STATE_NAMES[s.state]}: ${s.text}`)).toEqual([
      '⬜ New: まだ一度も学習していない単語。',
      '🟡 Learning: 初めて評価したあと、このセッション内で再出題を待っている単語。再出題で Hard 以上なら Review に進む。',
      '🟢 Review: 復習段階に入った単語。FSRS が決めた間隔で復習する。',
      '🔴 Relearning: 復習で Again を押した単語。再出題で Hard 以上なら Review に戻る。',
    ]);
  });

  it('評価は Again → Hard → Good → Easy の順', () => {
    expect(INFO_GRADES.map((g) => g.grade)).toEqual([1, 2, 3, 4]);
    expect(INFO_GRADES.map((g) => `${g.name}: ${g.text}`)).toEqual([
      'Again: 意味が出てこなかった。安定性が下がり、このセッション内でもう一度出る。',
      'Hard: 思い出せたが時間がかかった、または自信がなかった。間隔は Good より短くなる。',
      'Good: 普通に思い出せた。標準的に間隔が伸びる。迷ったらこれ。',
      'Easy: 見た瞬間に分かった。間隔が最も長くなる。新しい単語なら再出題なしで Review に進む。',
    ]);
  });

  it('補足は 2 行', () => {
    expect(INFO_NOTES).toEqual([
      '一覧のアイコンは状態を表す。状態は評価の結果として自動で変わる。',
      'ボタンの下の「N日後」は、その評価を押した場合の次回。↻ はこのセッション内でもう一度出ること。',
    ]);
  });
});
