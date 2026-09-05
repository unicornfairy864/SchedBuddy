import { useMemo } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import type { Occurrence, PackDayResult, Schedule } from '../../../shared/src/types';
import { minutesToHM, weekdayCn, weekdayOf, type DateStr } from '../../../shared/src/time';

export interface TimeRange {
  start: number;
  end: number;
}

export interface Band {
  date: DateStr;
  pack: PackDayResult;
  isToday: boolean;
  /** 非全天的可见时段（日视图半天带） */
  range?: TimeRange;
  /** 日视图半天带标签：上午 / 下午 */
  tag?: string;
}

export interface HoverInfo {
  occ: Occurrence;
  schedule: Schedule;
  x: number;
  y: number;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
/** 刻度分钟：0:00 ~ 24:00（整点） */
const TICK_MINUTES = Array.from({ length: 25 }, (_, i) => i * 60);

/** 标尺刻度：区间内整点 + 首/尾边界各加一个带数字的刻度（保证裁剪后首尾仍有刻度与时间） */
function rulerTicks(start: number, end: number): { t: number; label: boolean }[] {
  const out: { t: number; label: boolean }[] = [];
  for (const t of TICK_MINUTES) {
    if (t > start && t < end) out.push({ t, label: t % 120 === 0 });
  }
  out.push({ t: start, label: true });
  if (end !== start) out.push({ t: end, label: true });
  out.sort((a, b) => a.t - b.t);
  return out;
}

function textOn(color: string): string {
  const hex = color.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 150 ? '#3d2f27' : '#ffffff';
}

const keyOf = (o: { date: string; scheduleId: string; startMin: number }) =>
  `${o.date}|${o.scheduleId}|${o.startMin}`;

interface Props {
  bands: Band[];
  schedules: Map<string, Schedule>;
  nowMin: number | null;
  density: 'day' | 'week';
  hoKey: string | null;
  onHover: (info: HoverInfo | null, key: string | null) => void;
  /** 本机可编辑态：方块可点击编辑、时间区空白处点击快速新建 */
  editable?: boolean;
  onBlockClick?: (scheduleId: string) => void;
  onSlotClick?: (date: DateStr, startMin: number) => void;
}

export default function DayBands({
  bands,
  schedules,
  nowMin,
  density,
  hoKey,
  onHover,
  editable,
  onBlockClick,
  onSlotClick,
}: Props) {
  const laneH = density === 'day' ? 52 : 31;
  const style = { '--lane-h': `${laneH}px`, '--ruler-h': '24px' } as CSSProperties;
  const focus = hoKey != null;

  // key -> {occ, schedule} 快速查表，供容器级 hover 代理使用
  const lookup = useMemo(() => {
    const m = new Map<string, { occ: Occurrence; schedule: Schedule }>();
    for (const band of bands) {
      for (const p of band.pack.placed) {
        const schedule = schedules.get(p.occ.scheduleId);
        if (schedule) m.set(keyOf(p.occ), { occ: p.occ, schedule });
      }
    }
    return m;
  }, [bands, schedules]);

  // 容器级事件代理：指针离开任意方块（即使仍在页内）立即隐藏悬浮窗
  const handleMove = (e: MouseEvent) => {
    const el = (e.target as Element | null)?.closest?.('.sb-block') as HTMLElement | null;
    const key = el?.dataset?.k ?? null;
    if (!key) {
      if (hoKey) onHover(null, null);
      return;
    }
    const hit = lookup.get(key);
    if (!hit) return;
    const rect = el!.getBoundingClientRect();
    onHover(
      { occ: hit.occ, schedule: hit.schedule, x: rect.left + rect.width / 2, y: rect.top },
      key,
    );
  };

  // 点击时间区空白处：换算该日分钟数 → 快速新建（snap 到 30 分钟）
  const handleSlot = (e: MouseEvent<HTMLDivElement>, band: Band) => {
    if (!editable || !onSlotClick) return;
    const target = e.target as Element;
    if (target.closest('.sb-block') || target.closest('.ruler')) return;
    const tr = band.range ?? { start: 0, end: 1440 };
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
    const span = tr.end - tr.start;
    let min = Math.round((tr.start + frac * span) / 30) * 30;
    min = Math.max(0, Math.min(1439, min));
    onSlotClick(band.date, min);
  };

  const handleBlock = (e: MouseEvent, scheduleId: string) => {
    e.stopPropagation();
    if (editable && onBlockClick) onBlockClick(scheduleId);
  };

  return (
    <div
      className={`bands ${density}${focus ? ' focus' : ''}${editable ? ' editable' : ''}`}
      style={style}
      onMouseMove={handleMove}
      onMouseLeave={() => onHover(null, null)}
    >
      {bands.map((band) => {
        const pack = band.pack;
        const hasOcc = pack.placed.length > 0;
        const tr = band.range ?? { start: 0, end: 1440 };
        const span = tr.end - tr.start;
        const x = (min: number) => `${((min - tr.start) / span) * 100}%`;
        const rowLanes: number[] = [];
        for (let l = pack.laneCount - 1; l >= 0; l--) rowLanes.push(l);
        const placedByLane = new Map<number, typeof pack.placed>();
        for (const p of pack.placed) {
          const arr = placedByLane.get(p.lane) ?? [];
          arr.push(p);
          placedByLane.set(p.lane, arr);
        }
        const wd = weekdayOf(band.date);
        // 周视图下，日带高度按各自行数分配：行数×单位高；无日程也占 1 个单位高
        const grow = density === 'week' && hasOcc ? Math.max(1, pack.laneCount) : undefined;
        return (
          <div
            className={`band${band.isToday ? ' today' : ''}${band.tag ? ` half ${band.tag}` : ''}${hasOcc ? '' : ' empty'}`}
            style={grow ? { flexGrow: grow } : undefined}
            key={band.date + (band.tag ?? '')}
          >
            <div className="band-gutter">
              {band.tag ? (
                <>
                  <span className="half-tag">{band.tag}</span>
                  <span className="md">{band.date.slice(5).replace('-', '/')}</span>
                  {band.isToday && <span className="today-badge">今天</span>}
                </>
              ) : (
                <>
                  <span className="wd">{weekdayCn(wd)}</span>
                  <span className="md">{band.date.slice(5).replace('-', '/')}</span>
                  {band.isToday && <span className="today-badge">今天</span>}
                </>
              )}
            </div>
            <div className="band-body">
              {!hasOcc ? (
                <div className="empty-day">本日无日程 · 全天空闲</div>
              ) : (
                <>
                  <div className="lanes" onClick={(e) => handleSlot(e, band)}>
                    {HOURS.map((h) => {
                      const t = h * 60;
                      if (t <= tr.start || t >= tr.end) return null;
                      return <div key={h} className="hour-line" style={{ left: x(t) }} />;
                    })}
                    {band.isToday && nowMin != null && nowMin > tr.start && nowMin < tr.end && (
                      <div className="now-line" style={{ left: x(nowMin) }}>
                        <span className="now-dot" />
                      </div>
                    )}
                    {rowLanes.map((lane) => {
                      const items = (placedByLane.get(lane) ?? []).map((p) => p.occ);
                      const isBase = lane === 0;
                      return (
                        <div className={`lane${isBase ? ' base' : ''}`} key={lane}>
                          {isBase &&
                            pack.row0Free
                              .filter(([s, e]) => e > tr.start && s < tr.end)
                              .map(([s, e], i) => (
                                <div
                                  key={i}
                                  className="free"
                                  style={{ left: x(Math.max(s, tr.start)), width: `${((Math.min(e, tr.end) - Math.max(s, tr.start)) / span) * 100}%` }}
                                />
                              ))}
                          {items
                            .filter((o) => o.endMin > tr.start && o.startMin < tr.end)
                            .map((occ) => {
                              const s = schedules.get(occ.scheduleId);
                              if (!s) return null;
                              const key = keyOf(occ);
                              // 仅周视图的窄块隐藏文字；日视图方块大，始终显示名称
                              const slim = density === 'week' && occ.endMin - occ.startMin <= 30;
                              return (
                                <div
                                  key={key}
                                  data-k={key}
                                  className={`sb-block t-${s.type}${focus ? '' : ' idl'}${key === hoKey ? ' ho' : ''}${slim ? ' slim' : ''}`}
                                  style={{ left: x(Math.max(occ.startMin, tr.start)), width: `${((Math.min(occ.endMin, tr.end) - Math.max(occ.startMin, tr.start)) / span) * 100}%`, background: s.color, color: textOn(s.color) }}
                                  onClick={(e) => handleBlock(e, s.id)}
                                >
                                  {!slim && <span className="blk-title">{s.title}</span>}
                                </div>
                              );
                            })}
                        </div>
                      );
                    })}
                  </div>
                  <div className="ruler">
                    {rulerTicks(tr.start, tr.end).map((tk) => {
                      const edge = tk.t === tr.start ? ' edge-l' : tk.t === tr.end ? ' edge-r' : '';
                      return (
                        <span key={tk.t} className={`ruler-tick${edge}`} style={{ left: x(tk.t) }}>
                          {tk.label && <i>{minutesToHM(tk.t)}</i>}
                        </span>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
