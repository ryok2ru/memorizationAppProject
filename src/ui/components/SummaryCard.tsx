import { estimateMinutes } from '../../app/stats';

interface Props {
  due: number;
  news: number;
  onStartReview: () => void;
  onStartNew: () => void;
}

/**
 * ホームの 3 分岐カード（7-2）。どの状態も「見出し 1 行 + ボタン」の構造で、タップの対象はカード全体ではなくボタン。
 * 復習あり / New ありの 2 つは同じ配色・同じ大きさ。どちらも 0 ならボタンなしで薄い色にする。
 */
export function SummaryCard({ due, news, onStartReview, onStartNew }: Props) {
  if (due > 0) {
    return (
      <section className="card summary-card" data-testid="summary-card" aria-label="今日の学習">
        <h2>
          今日の復習: {due}語 · 約{estimateMinutes(due)}分
        </h2>
        <button type="button" className="btn-primary summary-btn" onClick={onStartReview} data-testid="summary-action">
          復習を始める
        </button>
      </section>
    );
  }
  if (news > 0) {
    return (
      <section className="card summary-card" data-testid="summary-card" aria-label="今日の学習">
        <h2>今日の復習はありません。新しい単語が {news}語あります</h2>
        <button type="button" className="btn-primary summary-btn" onClick={onStartNew} data-testid="summary-action">
          新しい単語を学習する
        </button>
      </section>
    );
  }
  return (
    <section className="card summary-card empty" data-testid="summary-card" aria-label="今日の学習">
      <h2>今日の復習はありません</h2>
    </section>
  );
}
