interface Props {
  rangeLabel: string;
  view: 'week' | 'day';
  readOnly: boolean;
  version: string;
  onView: (v: 'week' | 'day') => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export default function Header({ rangeLabel, view, readOnly, version, onView, onPrev, onNext, onToday }: Props) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">S</span>
        <div>
          <h1>SchedBuddy</h1>
          <small>大学生时间管理</small>
        </div>
      </div>

      <div className="nav">
        <button className="icon-btn" title="上一页" onClick={onPrev}>‹</button>
        <button className="btn today" onClick={onToday}>今天</button>
        <button className="icon-btn" title="下一页" onClick={onNext}>›</button>
        <span className="range">{rangeLabel}</span>
      </div>

      <div className="right">
        <div className="seg">
          <button className={view === 'week' ? 'on' : ''} onClick={() => onView('week')}>周</button>
          <button className={view === 'day' ? 'on' : ''} onClick={() => onView('day')}>日</button>
        </div>
        {readOnly && <span className="ro-badge">只读</span>}
        <span className="ver">v{version}</span>
      </div>
    </header>
  );
}
