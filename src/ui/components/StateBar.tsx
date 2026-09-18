import type { CardState } from '../../domain/types';
import { STATE_NAMES } from '../../domain/types';

interface Props {
  counts: Record<CardState, number>;
}

const COLORS: Record<CardState, string> = {
  0: 'var(--muted)',
  1: 'var(--hard)',
  2: 'var(--good)',
  3: 'var(--again)',
};

const ORDER: CardState[] = [0, 1, 2, 3];

/** 状態別割合の横棒と凡例。単語 0 件なら何も描画しない */
export function StateBar({ counts }: Props) {
  const total = ORDER.reduce<number>((s, k) => s + counts[k], 0);
  if (total === 0) return null;
  return (
    <div className="statebar" aria-label="状態別割合">
      <div className="statebar-track">
        {ORDER.map((k) =>
          counts[k] > 0 ? (
            <div
              key={k}
              style={{ width: `${(counts[k] / total) * 100}%`, background: COLORS[k] }}
              title={`${STATE_NAMES[k]} ${counts[k]}`}
            />
          ) : null,
        )}
      </div>
      <div className="statebar-legend">
        {ORDER.map((k) => (
          <span key={k}>
            <span className="dot" style={{ background: COLORS[k] }} />
            {STATE_NAMES[k]} {counts[k]}（{Math.round((counts[k] / total) * 100)}%）
          </span>
        ))}
      </div>
    </div>
  );
}
