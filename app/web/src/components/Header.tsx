import avatarUrl from '../../../resources/avatar.jpg';

interface Props {
  rangeDates: string;
  rangeWeek: string | null;
  view: 'week' | 'day';
  readOnly: boolean;
  version: string;
  onView: (v: 'week' | 'day') => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onSettings: () => void;
}

/** 顶栏：单行一体 —— 左(品牌+版本+周/日切换) / 中(日期导航) / 右(⚙ 设置；只读端仅「只读」徽标)。
 *  新建入口不在顶栏：由各日带 gutter 的「＋」（周几/上午下午旁）承担。 */
export default function Header({
  rangeDates,
  rangeWeek,
  view,
  readOnly,
  version,
  onView,
  onPrev,
  onNext,
  onToday,
  onSettings,
}: Props) {
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

      {/* 日期导航：上/下页 + 今天 + 当前范围 */}
      <div className="mid">
        <nav className="nav">
          <button className="icon-btn" title="上一页" aria-label="上一页" onClick={onPrev}>‹</button>
          <button className="btn today" onClick={onToday}>今天</button>
          <button className="icon-btn" title="下一页" aria-label="下一页" onClick={onNext}>›</button>
          <span className={rangeWeek ? 'range' : 'range no-week'}>
            <span className="range-dates">{rangeDates}{rangeWeek ? ' · ' : ''}</span>
            {rangeWeek && <span className="range-week">{rangeWeek}</span>}
          </span>
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
