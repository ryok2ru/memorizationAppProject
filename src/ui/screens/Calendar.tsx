import { useState } from 'react';
import { Header } from '../components/Header';
import { useAsync } from '../hooks';
import { calendarStats, daySummaryText, isBeforeMonth, loadCalendar, monthGrid, shiftMonth, toYearMonth } from '../../app/calendar';
import { dateKey } from '../../domain/dates';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * 学習カレンダー（7-11）。学習した日（ReviewLog がある日）を強調色で塗る。量による濃淡は付けない。
 * 集計は app/calendar.ts の純粋関数で、ここは表示と月の移動・日付の選択だけを持つ。
 */
export function Calendar() {
  const [now] = useState(() => Date.now());
  const thisMonth = toYearMonth(now);
  const todayKey = dateKey(now);
  const [shown, setShown] = useState(thisMonth);
  const [selected, setSelected] = useState<string | null>(null);
  const { data: days } = useAsync(loadCalendar, []);

  if (!days) return <div className="screen"><Header title="学習カレンダー" back="/" /></div>;

  const stats = calendarStats(days, now);
  const canNext = isBeforeMonth(shown, thisMonth);
  const move = (delta: number) => {
    setShown((m) => shiftMonth(m, delta));
    setSelected(null);
  };

  return (
    <div className="screen">
      <Header title="学習カレンダー" back="/" />

      <div className="stat-grid cal-stats">
        <div className="stat">
          <div className="label">今月の学習日数</div>
          <div className="value" data-testid="cal-this-month">
            {stats.thisMonth}日
          </div>
        </div>
        <div className="stat">
          <div className="label">最長の連続日数</div>
          <div className="value" data-testid="cal-longest">
            {stats.longest}日
          </div>
        </div>
        <div className="stat">
          <div className="label">総学習日数</div>
          <div className="value" data-testid="cal-total">
            {stats.total}日
          </div>
        </div>
      </div>

      <div className="cal-nav">
        <button type="button" className="btn-icon" aria-label="前の月" onClick={() => move(-1)} data-testid="cal-prev">
          ‹
        </button>
        <h2 data-testid="cal-month">
          {shown.year}年{shown.month + 1}月
        </h2>
        {/* 今月より先へは進めない */}
        <button type="button" className="btn-icon" aria-label="次の月" onClick={() => move(1)} disabled={!canNext} data-testid="cal-next">
          ›
        </button>
      </div>

      <div className="cal-grid">
        <div className="cal-row">
          {WEEKDAYS.map((w) => (
            <div key={w} className="cal-weekday">
              {w}
            </div>
          ))}
        </div>
        {monthGrid(shown).map((week, i) => (
          <div key={i} className="cal-row">
            {week.map((key, j) =>
              key == null ? (
                <div key={j} className="cal-empty" />
              ) : (
                <button
                  key={key}
                  type="button"
                  className={`cal-day${days.has(key) ? ' studied' : ''}${key === todayKey ? ' today' : ''}`}
                  aria-pressed={selected === key}
                  aria-label={`${Number(key.slice(8))}日${days.has(key) ? '、学習済み' : ''}${key === todayKey ? '、今日' : ''}`}
                  onClick={() => setSelected((s) => (s === key ? null : key))}
                  data-testid={`cal-day-${key}`}
                >
                  {Number(key.slice(8))}
                </button>
              ),
            )}
          </div>
        ))}
      </div>

      {selected && (
        <p className="cal-detail" role="status" data-testid="cal-detail">
          {daySummaryText(selected, days.get(selected))}
        </p>
      )}
    </div>
  );
}
