import type { CSSProperties, MouseEvent } from 'react';
import type { Occurrence, PackDayResult, Schedule } from '../../../shared/src/types';
import { minutesToHM, weekdayCn, weekdayOf, type DateStr } from '../../../shared/src/time';

export interface Band {
  date: DateStr;
  pack: PackDayResult;
  isToday: boolean;
}

export interface HoverInfo {
  occ: Occurrence;
  schedule: Schedule;
  x: number;
  y: number;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function textOn(color: string): string {
  const hex = color.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 150 ? '#3d2f27' : '#ffffff';
}

const pct = (min: number) => `${(min / 1440) * 100}%`;

interface Props {
  bands: Band[];
  schedules: Map<string, Schedule>;
  nowMin: number | null;
  density: 'day' | 'week';
  hoKey: string | null;
  onHover: (info: HoverInfo | null, key: string | null) => void;
}

export default function DayBands({ bands, schedules, nowMin, density, hoKey, onHover }: Props) {
  const laneH = density === 'day' ? 42 : 27;
  const style = { '--lane-h': `${laneH}px` } as CSSProperties;
  const focus = hoKey != null;

  const handleEnter = (e: MouseEvent, occ: Occurrence) => {
    const s = schedules.get(occ.scheduleId);
    if (!s) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onHover(
      { occ, schedule: s, x: rect.left + rect.width / 2, y: rect.top },
      `${occ.date}|${occ.scheduleId}|${occ.startMin}`,
    );
  };

  return (
    <div className={`bands${focus ? ' focus' : ''}`} style={style} onMouseLeave={() => onHover(null, null)}>
      {bands.map((band) => {
        const pack = band.pack;
        const rowLanes: number[] = [];
        for (let l = pack.laneCount - 1; l >= 0; l--) rowLanes.push(l);
        const placedByLane = new Map<number, typeof pack.placed>();
        for (const p of pack.placed) {
          const arr = placedByLane.get(p.lane) ?? [];
          arr.push(p);
          placedByLane.set(p.lane, arr);
        }
        const wd = weekdayOf(band.date);
        return (
          <div className={`band${band.isToday ? ' today' : ''}`} key={band.date}>
            <div className="band-gutter">
              <span className="wd">{weekdayCn(wd)}</span>
              <span className="md">{band.date.slice(5).replace('-', '/')}</span>
              {band.isToday && <span className="today-badge">今天</span>}
            </div>
            <div className="band-body">
              {HOURS.filter((h) => h > 0).map((h) => (
                <div key={h} className="hour-line" style={{ left: pct(h * 60) }} />
              ))}
              {band.isToday && nowMin != null && (
                <div className="now-line" style={{ left: pct(nowMin) }}>
                  <span className="now-dot" />
                </div>
              )}
              <div className="lanes">
                {rowLanes.map((lane) => {
                  const items = (placedByLane.get(lane) ?? []).map((p) => p.occ);
                  const isBase = lane === 0;
                  return (
                    <div className={`lane${isBase ? ' base' : ''}`} key={lane}>
                      {isBase &&
                        pack.row0Free.map(([s, e], i) => (
                          <div key={i} className="free" style={{ left: pct(s), width: pct(e - s) }} />
                        ))}
                      {items.map((occ) => {
                        const s = schedules.get(occ.scheduleId);
                        if (!s) return null;
                        const key = `${occ.date}|${occ.scheduleId}|${occ.startMin}`;
                        const slim = occ.endMin - occ.startMin <= 30;
                        return (
                          <div
                            key={key}
                            className={`sb-block t-${s.type}${focus ? '' : ' idl'}${key === hoKey ? ' ho' : ''}${slim ? ' slim' : ''}`}
                            style={{ left: pct(occ.startMin), width: pct(occ.endMin - occ.startMin), background: s.color, color: textOn(s.color) }}
                            onMouseEnter={(e) => handleEnter(e, occ)}
                            onMouseMove={(e) => handleEnter(e, occ)}
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
                {HOURS.map((h) => (
                  <span key={h} className="ruler-tick" style={{ left: pct(h * 60) }}>
                    {h % 2 === 0 && <i>{minutesToHM(h * 60)}</i>}
                  </span>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
