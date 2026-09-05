import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, mondayOf, rangeDates, todayStr, weekIndexOf } from '../../shared/src/time';
import { expandAll } from '../../shared/src/expand';
import { packDay } from '../../shared/src/pack';
import type { PackDayResult, Schedule } from '../../shared/src/types';
import { fetchMeta, fetchSchedules, type Meta } from './api';
import Header from './components/Header';
import DayBands, { type Band, type HoverInfo } from './components/DayBands';
import BlockTooltip from './components/BlockTooltip';
import ScheduleModal, { type SlotPrefill } from './components/ScheduleModal';
import SettingsModal from './components/SettingsModal';

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
  /** 点击方块固定悬浮窗（固定态下悬浮窗可交互，含「编辑」按钮） */
  const [pinned, setPinned] = useState<string | null>(null);
  /** 桌面精确指针（hover: hover && pointer: fine）：悬浮窗本体可接收鼠标（移动端 false） */
  const hoverCap = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches,
    [],
  );
  /** 指针当前位于悬浮窗本体上（桌面 hover 捕获态：窗内显示「✎ 编辑」，不被“离开方块”收起） */
  const [tipOver, setTipOver] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const tipTimer = useRef<number | undefined>(undefined);
  const hintTimer = useRef<number | undefined>(undefined);
  const [editor, setEditor] = useState<
    | { mode: 'create'; prefill: SlotPrefill | null }
    | { mode: 'edit'; schedule: Schedule }
    | null
  >(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const editable = !!meta && !meta.readOnly;

  useEffect(() => {
    return () => {
      window.clearTimeout(tipTimer.current);
      window.clearTimeout(hintTimer.current);
    };
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

  // 静默刷新（保存/删除/设置后调用，不闪 loading）
  const refresh = useCallback(async () => {
    try {
      const [m, list] = await Promise.all([fetchMeta(), fetchSchedules()]);
      setMeta(m);
      setSchedules(list);
    } catch {
      setLoadState('error');
    }
  }, []);

  // Snackbar 轻提示（操作反馈；见 03-ui-spec §5）
  const showHint = useCallback((msg: string) => {
    setHint(msg);
    if (hintTimer.current) window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHint(null), 2600);
  }, []);

  const onModalDone = useCallback(
    (msg: string) => {
      setEditor(null);
      refresh();
      showHint(msg);
    },
    [refresh, showHint],
  );
  const onSettingsDone = useCallback(
    (msg: string) => {
      setSettingsOpen(false);
      refresh();
      showHint(msg);
    },
    [refresh, showHint],
  );
  const openEdit = useCallback(
    (id: string) => {
      const s = schedules.find((x) => x.id === id);
      if (s) setEditor({ mode: 'edit', schedule: s });
    },
    [schedules],
  );

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

  // 周视图共用可见时段：裁掉 7 天共有的首/尾空余（最早日程前 1h ~ 最晚日程后 1h；全周无日程则 0-24）
  const weekRange = useMemo(() => {
    if (view !== 'week') return null;
    let min = 1440;
    let max = 0;
    let any = false;
    for (const d of visibleDates) {
      const pack = dayPacks.get(d);
      if (!pack) continue;
      for (const p of pack.placed) {
        if (p.occ.startMin < min) min = p.occ.startMin;
        if (p.occ.endMin > max) max = p.occ.endMin;
        any = true;
      }
    }
    if (!any) return { start: 0, end: 1440 };
    // 边界为整点且（最多）保留 1h 空余：
    // 起点 = (最早日程 − 1h) 向上取整到整点；终点 = (最晚日程 + 1h) 向下取整到整点
    return {
      start: Math.max(0, Math.ceil((min - 60) / 60) * 60),
      end: Math.min(1440, Math.floor((max + 60) / 60) * 60),
    };
  }, [view, visibleDates, dayPacks]);

  // 渲染用「日带」列表：
  //  - 周视图：每天一条日带，共用同一可见时段 weekRange（7 天同轴）；
  //  - 日视图：始终拆成 上午/下午 两条半天带（各半只裁剪自身首尾空余；跨 12 点的日程两段共享同 key = 同一整体）。
  const bands: Band[] = useMemo(() => {
    if (view === 'week') {
      return visibleDates.map((date) => ({
        date,
        pack: dayPacks.get(date)!,
        isToday: date === today,
        range: weekRange ?? { start: 0, end: 1440 },
      }));
    }
    const date = anchor;
    const pack = dayPacks.get(date);
    if (!pack) return [];
    const occs = pack.placed.map((p) => p.occ);
    const pad = 60;
    const hasMorning = occs.some((o) => o.startMin < 720 && o.endMin > 0);
    const hasEvening = occs.some((o) => o.startMin < 1440 && o.endMin > 720);
    const minM = hasMorning
      ? Math.min(...occs.filter((o) => o.startMin < 720 && o.endMin > 0).map((o) => o.startMin))
      : 0;
    const maxE = hasEvening
      ? Math.max(...occs.filter((o) => o.startMin < 1440 && o.endMin > 720).map((o) => o.endMin))
      : 1440;
    return [
      { date, pack, isToday: date === today, range: { start: hasMorning ? Math.max(0, minM - pad) : 0, end: 720 }, tag: '上午' },
      { date, pack, isToday: date === today, range: { start: 720, end: hasEvening ? Math.min(1440, maxE + pad) : 1440 }, tag: '下午' },
    ];
  }, [view, anchor, visibleDates, dayPacks, today, weekRange]);

  const schedulesById = useMemo(() => new Map(schedules.map((s) => [s.id, s])), [schedules]);

  const nav = (dir: 1 | -1) => setAnchor((a) => (view === 'week' ? addDays(a, dir * 7) : addDays(a, dir)));

  // 日期范围拆成两段：日期段 + 周次段（窄屏省略时先省日期、必留第N周）
  const rangeParts = useMemo(() => {
    if (view === 'day') {
      const d = visibleDates[0];
      const idx = meta?.termStart ? weekIndexOf(d, meta.termStart) : -1;
      return {
        dates: `${d.slice(0, 4)}-${d.slice(5)}`,
        week: idx >= 1 ? `第${idx}周` : null,
      };
    }
    const from = visibleDates[0];
    const to = visibleDates[6];
    const idx = meta?.termStart ? weekIndexOf(from, meta.termStart) : -1;
    return {
      dates: `${from.slice(5).replace('-', '/')} – ${to.slice(5).replace('-', '/')}`,
      week: idx >= 1 ? `第${idx}周` : null,
    };
  }, [view, visibleDates, meta?.termStart]);

  // 悬浮窗：隐藏时先淡出再卸载，保证淡入淡出动画
  const hideTip = useCallback(() => {
    setPinned(null);
    setTipOver(false);
    if (tipTimer.current) window.clearTimeout(tipTimer.current);
    setHoKey(null);
    setTipVisible(false);
    tipTimer.current = window.setTimeout(() => setTip(null), 220);
  }, []);

  // 指针移入/移出悬浮窗本体（仅桌面 hoverCap 生效）：移入 → 取消待淡出并保持显示（进入可交互态）
  const handleTipPointer = useCallback((over: boolean) => {
    if (over) {
      if (tipTimer.current) window.clearTimeout(tipTimer.current);
      setTipVisible(true);
      setTipOver(true);
    } else {
      setTipOver(false);
    }
  }, []);

  // 指针移动（hover）→ 普通显示/隐藏；固定态下忽略“指针离开”类隐藏
  const handleHover = useCallback(
    (info: HoverInfo | null, key: string | null) => {
      // 板面 hover 事件只会在指针不在悬浮窗上时发生：若此前捕获态为真，先复位
      setTipOver(false);
      if (tipTimer.current) window.clearTimeout(tipTimer.current);
      if (!info) {
        if (pinned) return;
        setHoKey(null);
        setTipVisible(false);
        tipTimer.current = window.setTimeout(() => setTip(null), 220);
      } else {
        setTip(info);
        setHoKey(key);
        setTipVisible(true);
      }
    },
    [pinned],
  );

  // 点击方块 → 固定悬浮窗（桌面可移鼠标去点「编辑」；移动端点按即固定）
  const handlePin = useCallback((key: string) => setPinned(key), []);

  // 固定态：点窗外任意处 / Esc → 取消固定并淡出
  useEffect(() => {
    if (!pinned) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t?.closest?.('.sb-tip') || t?.closest?.('.sb-block')) return;
      hideTip();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hideTip();
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', esc);
    };
  }, [pinned, hideTip]);

  return (
    <div className="app">
      <Header
        rangeDates={rangeParts.dates}
        rangeWeek={rangeParts.week}
        view={view}
        readOnly={meta?.readOnly ?? true}
        version={meta?.version ?? '…'}
        onView={setView}
        onPrev={() => nav(-1)}
        onNext={() => nav(1)}
        onToday={() => setAnchor(today)}
        onNew={() => setEditor({ mode: 'create', prefill: null })}
        onSettings={() => setSettingsOpen(true)}
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
              editable={editable}
              onPin={handlePin}
            />
            {meta && meta.termStart == null && (
              <div className="notice">
                尚未设置学期起点（单双周将不可用，顶部不显示「第 N 周」）。可在「⚙ 设置」中填写第 1 周周一。
              </div>
            )}
          </>
        )}
      </main>

      <BlockTooltip
        data={tip}
        hidden={!tipVisible}
        interactive={editable && (pinned !== null || (hoverCap && tipOver))}
        cap={hoverCap}
        onTipPointer={handleTipPointer}
        onEdit={(id) => {
          hideTip();
          openEdit(id);
        }}
        onHide={hideTip}
      />

      {editor && (
        <ScheduleModal
          mode={editor.mode}
          initial={
            editor.mode === 'create'
              ? { schedule: null, prefill: editor.prefill }
              : { schedule: editor.schedule, prefill: null }
          }
          schedules={schedules}
          termStart={meta?.termStart ?? null}
          onClose={() => setEditor(null)}
          onDone={onModalDone}
          onNotify={showHint}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          onDone={onSettingsDone}
          onNotify={showHint}
        />
      )}

      <footer className="app-foot">
        <span className="tip-hint">
          {meta?.readOnly
            ? 'hover 方块查看详情 · 只读模式（请在桌面主机编辑）'
            : 'hover 方块查看详情 · 移入悬浮窗 →「✎ 编辑」'}
        </span>
      </footer>

      <div className={hint ? 'snack in' : 'snack'} role="status" aria-live="polite">{hint}</div>
    </div>
  );
}
