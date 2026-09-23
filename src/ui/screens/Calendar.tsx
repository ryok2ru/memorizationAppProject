import { useState } from 'react';
import { Header } from '../components/Header';
import { useAsync } from '../hooks';
import { calendarStats, formatDayKey, isBeforeMonth, loadCalendar, monthGrid, shiftMonth, toYearMonth, type DaySummary } from '../../app/calendar';
import { dateKey } from '../../domain/dates';
import { GRADES, GRADE_NAMES } from '../../domain/types';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * 学習カレンダー（7-11）。学習した日（ReviewLog がある日）を学習日の色（--studied）で塗る。量による濃淡は付けない。
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

      {/* カレンダーと学習記録のカードは 12px 空けて並べる（画面の他の要素の間隔 16px とは別） */}
      <div className="cal-body">
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

        {selected && <DayRecord dayKey={selected} day={days.get(selected)} />}
      </div>
    </div>
  );
}

/**
 * タップした日の学習記録（7-11）。カレンダーの下に置くカード。
 * 1 行目は日付の見出しと右端の語数、2 行目は Again / Hard / Good / Easy の 4 列（上に件数、下にラベル）。
 * 学習していない日は日付と「学習の記録はありません」の 2 行だけ。
 */
function DayRecord({ dayKey, day }: { dayKey: string; day: DaySummary | undefined }) {
  return (
    <section className="cal-record" role="status" data-testid="cal-detail">
      <div className="cal-record-head">
        <h3>{formatDayKey(dayKey)}</h3>
        {day && <span className="cal-record-words">{day.words}語</span>}
      </div>
      {day ? (
        <div className="cal-record-grades">
          {GRADES.map((g) => (
            <div key={g} className="cal-record-grade">
              <span className={`cal-record-count text-grade-${g}`} data-testid={`cal-detail-${g}`}>
                {day.ratings[g]}
              </span>
              <span className="cal-record-label">{GRADE_NAMES[g]}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="cal-record-empty">学習の記録はありません</p>
      )}
    </section>
  );
}
