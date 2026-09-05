import { useEffect, useState } from 'react';
import avatarUrl from '../../../resources/avatar.jpg';

interface Props {
  rangeLabel: string;
  view: 'week' | 'day';
  readOnly: boolean;
  version: string;
  onView: (v: 'week' | 'day') => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onNew: () => void;
  onSettings: () => void;
}

/** 顶栏：单行一体 —— 左(品牌+版本徽章+周/日切换) / 中(日期导航) / 右(设置+新建；窄屏折叠进 ⋯ 菜单) */
export default function Header({
  rangeLabel,
  view,
  readOnly,
  version,
  onView,
  onPrev,
  onNext,
  onToday,
  onNew,
  onSettings,
}: Props) {
  // 断点统一 860px（见 06-dev-conventions §5）
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 860px)').matches);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 860px)');
    const onChange = () => {
      setCompact(mq.matches);
      setMoreOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

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
          <span className="range">{rangeLabel}</span>
        </nav>
      </div>

      <div className="right">
        {readOnly ? (
          <span className="ro-badge">只读</span>
        ) : compact ? (
          <div className="more">
            <button
              className="icon-btn more-btn"
              title="更多操作"
              aria-label="更多操作"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((o) => !o)}
            >
              ⋯
            </button>
            {moreOpen && (
              <>
                <div className="more-scrim" onClick={() => setMoreOpen(false)} />
                <div className="more-panel" role="menu">
                  <button
                    className="more-item"
                    role="menuitem"
                    onClick={() => {
                      setMoreOpen(false);
                      onNew();
                    }}
                  >
                    ＋ 新建日程
                  </button>
                  <button
                    className="more-item"
                    role="menuitem"
                    onClick={() => {
                      setMoreOpen(false);
                      onSettings();
                    }}
                  >
                    ⚙ 设置
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            <button className="icon-btn ghost" title="设置" aria-label="设置" onClick={onSettings}>⚙</button>
            <button className="btn primary" onClick={onNew}>＋ 新建</button>
          </>
        )}
      </div>
    </header>
  );
}
