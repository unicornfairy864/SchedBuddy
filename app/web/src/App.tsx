import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [tipVisible, setTipVisible] = useState(false);
  const [hoKey, setHoKey] = useState<string | null>(null);
  const tipTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => window.clearTimeout(tipTimer.current);
  }, []);

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

  // 渲染用「日带」列表：
  //  - 周视图：每天一条完整 24h 日带；
  //  - 日视图：拆成上午/下午两条半天带（自动裁剪首尾空余，跨 12 点的日程两段共享同 key = 同一整体）。
  const bands: Band[] = useMemo(() => {
    if (view === 'week') {
      return visibleDates.map((date) => ({ date, pack: dayPacks.get(date)!, isToday: date === today }));
    }
    const date = anchor;
    const pack = dayPacks.get(date);
    if (!pack) return [];
    const occs = pack.placed.map((p) => p.occ);
    if (occs.length === 0) {
      return [
        { date, pack, isToday: date === today, range: { start: 0, end: 720 }, tag: '上午' },
        { date, pack, isToday: date === today, range: { start: 720, end: 1440 }, tag: '下午' },
      ];
    }
    const minStart = Math.min(...occs.map((o) => o.startMin));
    const maxEnd = Math.max(...occs.map((o) => o.endMin));
    const pad = 60;
    const S = Math.max(0, minStart - pad);
    const E = Math.min(1440, maxEnd + pad);
    const hasMorning = occs.some((o) => o.startMin < 720 && o.endMin > 0);
    const hasEvening = occs.some((o) => o.startMin < 1440 && o.endMin > 720);
    const out: Band[] = [];
    if (hasMorning) out.push({ date, pack, isToday: date === today, range: { start: S, end: 720 }, tag: '上午' });
    if (hasEvening) out.push({ date, pack, isToday: date === today, range: { start: 720, end: E }, tag: '下午' });
    return out;
  }, [view, anchor, visibleDates, dayPacks, today]);

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

  // 悬浮窗：隐藏时先淡出再卸载，保证淡入淡出动画
  const handleHover = (info: HoverInfo | null, key: string | null) => {
    if (tipTimer.current) window.clearTimeout(tipTimer.current);
    if (!info) {
      setHoKey(null);
      setTipVisible(false);
      tipTimer.current = window.setTimeout(() => setTip(null), 170);
    } else {
      setTip(info);
      setHoKey(key);
      setTipVisible(true);
    }
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

      <BlockTooltip data={tip} hidden={!tipVisible} />

      <footer className="app-foot">
        <span className="tip-hint">hover 方块查看详情{meta?.readOnly ? ' · 只读模式（请在桌面主机编辑）' : ''}</span>
      </footer>
    </div>
  );
}
