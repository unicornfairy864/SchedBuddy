import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, mondayOf, rangeDates, todayStr } from '../../../shared/src/time';
import avatarUrl from '../../../resources/avatar.jpg';

interface Props {
  rangeDates: string;
  rangeWeek: string | null;
  view: 'week' | 'day';
  readOnly: boolean;
  version: string;
  /** 当前锚点日期（用于日历定位与选中态） */
  anchor: string;
  onView: (v: 'week' | 'day') => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onSettings: () => void;
  /** 日历选点：周视图=跳到该日所在周；日视图=跳到该日 */
  onPickDate: (d: string) => void;
}

const WEEK_HEADS = ['一', '二', '三', '四', '五', '六', '日'];

/** 以某日期所在月为基准的完整周网格（周一开头，42 格，含邻月补位）。 */
function monthGridOf(anchor: string): { cells: { date: string; inMonth: boolean }[]; month: string } {
  const month = anchor.slice(0, 7);
  const first = mondayOf(`${month}-01`);
  return {
    month,
    cells: rangeDates(first, addDays(first, 41)).map((date) => ({ date, inMonth: date.slice(0, 7) === month })),
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** 顶栏：单行一体 —— 左(品牌+版本+周/日切换) / 中(日期导航) / 右(⚙ 设置；只读端仅「只读」徽标)。
 *  日期标题为圆角按钮，点击弹出日历：周视图「周历」（点日期跳所在周）、日视图「日历」（点日期直达）。 */
export default function Header({
  rangeDates,
  rangeWeek,
  view,
  readOnly,
  version,
  anchor,
  onView,
  onPrev,
  onNext,
  onToday,
  onSettings,
  onPickDate,
}: Props) {
  const [calOpen, setCalOpen] = useState(false);
  const [calOffset, setCalOffset] = useState(0); // 相对 anchor 所在月的偏移（月数）
  const wrapRef = useRef<HTMLDivElement>(null);
  const today = todayStr();

  const monthAnchor = useMemo(() => {
    const y = Number(anchor.slice(0, 4));
    const m = Number(anchor.slice(5, 7));
    const d = new Date(y, m - 1 + calOffset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }, [anchor, calOffset]);

  const { cells, month } = monthGridOf(monthAnchor);

  // 点外部 / Esc 关闭
  useEffect(() => {
    if (!calOpen) return;
    const down = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setCalOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setCalOpen(false);
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', esc);
    };
  }, [calOpen]);

  const pick = (date: string) => {
    setCalOpen(false);
    onPickDate(date);
  };

  const weekMon = mondayOf(anchor); // 周视图：当前周的周一
  const rows = chunk(cells, 7);

  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">
          <img className="avatar" src={avatarUrl} alt="avatar" />
        </span>
        <div className="brand-txt">
          <h1>SchedBuddy</h1>
          <span className="ver">v{version}</span>
        </div>
      </div>

      {/* 周/日切换（紧跟品牌） */}
      <div className="seg" role="tablist" aria-label="视图切换">
        <button className={view === 'week' ? 'on' : ''} onClick={() => onView('week')}>周</button>
        <button className={view === 'day' ? 'on' : ''} onClick={() => onView('day')}>日</button>
      </div>

      {/* 日期导航：上/下页 + 今天 + 当前范围（圆角钮 → 弹出日历） */}
      <div className="mid">
        <nav className="nav">
          <button className="icon-btn" title="上一页" aria-label="上一页" onClick={onPrev}>‹</button>
          <button className="btn today" onClick={onToday}>今天</button>
          <button className="icon-btn" title="下一页" aria-label="下一页" onClick={onNext}>›</button>
          <div className="range-wrap" ref={wrapRef}>
            <button
              type="button"
              className={`range-btn${rangeWeek ? '' : ' no-week'}`}
              aria-haspopup="dialog"
              aria-expanded={calOpen}
              title={view === 'week' ? '点击选择要查看的周' : '点击选择要查看的日期'}
              onClick={() => {
                setCalOffset(0);
                setCalOpen((v) => !v);
              }}
            >
              <span className="range-dates">{rangeDates}</span>
              {rangeWeek && <span className="range-week">{rangeWeek}</span>}
            </button>

            {calOpen && (
              <div className="cal-pop" role="dialog" aria-label={view === 'week' ? '选择周' : '选择日期'}>
                <div className="cal-head">
                  <button type="button" className="cal-nav" aria-label="上月" onClick={() => setCalOffset((o) => o - 1)}>‹</button>
                  <span className="cal-title">{Number(month.slice(0, 4))} 年 {Number(month.slice(5, 7))} 月</span>
                  <button type="button" className="cal-nav" aria-label="下月" onClick={() => setCalOffset((o) => o + 1)}>›</button>
                </div>
                <div className="cal-week">
                  {WEEK_HEADS.map((w) => <span key={w}>{w}</span>)}
                </div>
                <div className="cal-grid">
                  {rows.map((row, ri) => {
                    // 周视图：当前周 = 整行一个深绿圆角框（row[0] 即该行周一）
                    const selRow = view === 'week' && row[0].date === weekMon;
                    return (
                      <div key={ri} className={`cal-row${selRow ? ' is-sel' : ''}`}>
                        {row.map(({ date, inMonth }) => {
                          const daySel = view === 'day' && date === anchor;
                          const dot = (selRow && date === today) || daySel; // 框内今天 / 日视图选中 = 实心圆点
                          const cls = [
                            'cal-cell',
                            !inMonth ? 'muted' : '',
                            date === today && !dot ? 'is-today' : '',
                            dot ? 'is-dot' : '',
                          ].filter(Boolean).join(' ');
                          return (
                            <button key={date} type="button" className={cls} onClick={() => pick(date)}>
                              {Number(date.slice(8, 10))}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
                <div className="cal-hint">
                  {view === 'week' ? '点击日期 → 跳到其所在周（深绿框为当前周）' : '点击日期 → 跳到该日'}
                </div>
              </div>
            )}
          </div>
        </nav>
      </div>

      <div className="right">
        {readOnly ? (
          <span className="ro-badge">只读</span>
        ) : (
          <button className="icon-btn ghost" title="设置" aria-label="设置" onClick={onSettings}>⚙</button>
        )}
      </div>
    </header>
  );
}
