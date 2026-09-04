import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, mondayOf, rangeDates, todayStr, weekIndexOf } from '../../shared/src/time';
import { expandAll } from '../../shared/src/expand';
import { packDay } from '../../shared/src/pack';
import type { PackDayResult, Schedule } from '../../shared/src/types';
import { fetchMeta, fetchSchedules, type Meta } from './api';
import Header from './components/Header';
import DayBands, { type Band, type HoverInfo } from './components/DayBands';
import BlockTooltip from './components/BlockTooltip';

type View = 'week' | 'day';

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState<string>(todayStr());
  const [nowMin, setNowMin] = useState<number | null>(null);
  const [tip, setTip] = useState<HoverInfo | null>(null);
  const [hoKey, setHoKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const [m, list] = await Promise.all([fetchMeta(), fetchSchedules()]);
      setMeta(m);
      setSchedules(list);
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 当前时间线（每分钟刷新）
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
    };
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);

  const today = todayStr();

  const visibleDates = useMemo<string[]>(() => {
    if (view === 'day') return [anchor];
    const mon = mondayOf(anchor);
    return rangeDates(mon, addDays(mon, 6));
  }, [view, anchor]);

  const dayPacks = useMemo(() => {
    const from = visibleDates[0];
    const to = visibleDates[visibleDates.length - 1];
    const occs = expandAll(schedules, { from, to, termStart: meta?.termStart ?? null, holidays: null });
    const map = new Map<string, PackDayResult>();
    for (const date of visibleDates) {
      const ofDay = occs.filter((o) => o.date === date);
      map.set(date, packDay(ofDay));
    }
    return map;
  }, [schedules, visibleDates, meta?.termStart]);

  const bands: Band[] = visibleDates.map((date) => ({
    date,
    pack: dayPacks.get(date)!,
    isToday: date === today,
  }));

  const schedulesById = useMemo(() => new Map(schedules.map((s) => [s.id, s])), [schedules]);

  const nav = (dir: 1 | -1) => setAnchor((a) => (view === 'week' ? addDays(a, dir * 7) : addDays(a, dir)));

  const rangeLabel = useMemo(() => {
    if (view === 'day') {
      const d = visibleDates[0];
      const w = meta?.termStart && weekIndexOf(d, meta.termStart) >= 1 ? ` 第${weekIndexOf(d, meta.termStart)}周` : '';
      return `${d.slice(0, 4)}-${d.slice(5)}${w}`;
    }
    const from = visibleDates[0];
    const to = visibleDates[6];
    const w =
      meta?.termStart && weekIndexOf(from, meta.termStart) >= 1 ? ` · 第${weekIndexOf(from, meta.termStart)}周` : '';
    return `${from.slice(5).replace('-', '/')} – ${to.slice(5).replace('-', '/')}${w}`;
  }, [view, visibleDates, meta?.termStart]);

  const handleHover = (info: HoverInfo | null, key: string | null) => {
    setTip(info);
    setHoKey(key);
  };

  return (
    <div className="app">
      <Header
        rangeLabel={rangeLabel}
        view={view}
        readOnly={meta?.readOnly ?? true}
        version={meta?.version ?? '…'}
        onView={setView}
        onPrev={() => nav(-1)}
        onNext={() => nav(1)}
        onToday={() => setAnchor(today)}
      />

      <main className="board-scroll">
        {loadState === 'loading' && <div className="hint">正在读取日程…</div>}
        {loadState === 'error' && (
          <div className="hint err">
            无法连接服务（请确认桌面端/后端已启动，端口 3876）
            <button className="btn today" onClick={load}>重试</button>
          </div>
        )}
        {loadState === 'ready' && (
          <>
            <DayBands
              bands={bands}
              schedules={schedulesById}
              nowMin={nowMin}
              density={view}
              hoKey={hoKey}
              onHover={handleHover}
            />
            {meta && meta.termStart == null && (
              <div className="notice">
                尚未设置学期起点（单双周将不可用）。编辑功能将在下一版本开放，届时可于「设置」中填写。
              </div>
            )}
          </>
        )}
      </main>

      <BlockTooltip data={tip} />

      <footer className="app-foot">
        <span>最底排 = 固定日程（浅绿为空闲）· 上排按重要度堆叠</span>
        <span className="tip-hint">hover 方块查看详情{meta?.readOnly ? ' · 只读模式（请在桌面主机编辑）' : ''}</span>
      </footer>
    </div>
  );
}
