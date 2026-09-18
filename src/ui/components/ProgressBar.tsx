interface Props {
  remaining: number;
  completed: number;
}

/** 学習画面の進捗: 「残り N枚 / 完了 M枚」と横棒 */
export function ProgressBar({ remaining, completed }: Props) {
  const total = remaining + completed;
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  return (
    <div className="progress" aria-label="進捗">
      <div className="small muted">
        残り {remaining}枚 / 完了 {completed}枚
      </div>
      <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
