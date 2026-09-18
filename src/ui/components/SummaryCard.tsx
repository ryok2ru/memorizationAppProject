import { estimateMinutes } from '../../app/stats';

interface Props {
  due: number;
  news: number;
  onStartReview: () => void;
  onStartNew: () => void;
}

/** ホームの 3 分岐カード */
export function SummaryCard({ due, news, onStartReview, onStartNew }: Props) {
  if (due > 0) {
    return (
      <button type="button" className="card tappable" onClick={onStartReview} data-testid="summary-card">
        <h2>今日の復習: {due}語</h2>
        <p>予想時間: 約{estimateMinutes(due)}分</p>
      </button>
    );
  }
  if (news > 0) {
    return (
      <button type="button" className="card tappable" onClick={onStartNew} data-testid="summary-card">
        <h2>新しい単語を学習しましょう（{news}語）</h2>
      </button>
    );
  }
  return (
    <div className="card" data-testid="summary-card">
      <h2>今日の復習はありません</h2>
    </div>
  );
}
