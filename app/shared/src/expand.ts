import { addDays, epochDay, fromEpochDay, isValidDateStr, rangeDates, weekdayOf } from './time';
import { inActiveRange, matchesOddEven } from './validate';
import type { Occurrence, Schedule, Settings } from './types';

export interface ExpandCtx {
  from: string; // inclusive
  to: string; // inclusive
  /** 单双周回退锚点（settings.termStart） */
  termStart?: string | null;
  /** 校历停课日期（settings.holidays），命中的日期跳过 */
  holidays?: string[] | null;
}

/** 展开一个日程在 [from,to] 内的所有发生（每个时段窗口一条）。返回按日期升序。 */
export function expandSchedule(s: Schedule, ctx: ExpandCtx): Occurrence[] {
  const out: Occurrence[] = [];
  if (!isValidDateStr(ctx.from) || !isValidDateStr(ctx.to) || ctx.from > ctx.to) return out;
  const holidays = new Set(ctx.holidays ?? []);

  const overrides = s.overrides ?? [];
  const skipDates = new Set(overrides.filter((o) => o.action === 'skip').map((o) => o.date));
  const moveMap = new Map(overrides.filter((o) => o.action === 'move' && o.toDate).map((o) => [o.date, o.toDate!]));

  const emit = (date: string, startMin: number, endMin: number) => {
    if (date < ctx.from || date > ctx.to) return;
    if (holidays.has(date)) return;
    if (skipDates.has(date)) return;
    if (moveMap.has(date)) date = moveMap.get(date)!;
    if (date < ctx.from || date > ctx.to) return; // 移出窗口则本次不可见
    out.push({ scheduleId: s.id, title: s.title, type: s.type, color: s.color, date, startMin, endMin });
  };

  const active = (d: string) => inActiveRange(s, d) && !skipDates.has(d);

  if (s.rule.kind === 'weekly') {
    const rule = s.rule;
    const weekStart = rule.weekStart ?? ctx.termStart ?? null;
    const parity = rule.oddEven === 'none' ? ('none' as const) : rule.oddEven;
    for (const d of rangeDates(ctx.from, ctx.to)) {
      if (!active(d)) continue;
      if (parity !== 'none' && !matchesOddEven(d, parity, weekStart)) continue;
      const wd = weekdayOf(d);
      for (const seg of rule.segments) {
        if (seg.weekday === wd) emit(d, seg.startMin, seg.endMin);
      }
    }
  } else if (s.rule.kind === 'interval') {
    const rule = s.rule;
    const startE = epochDay(rule.startDate);
    const fromE = epochDay(ctx.from);
    const toE = epochDay(ctx.to);
    if (startE > toE) return out;
    let k = Math.max(0, Math.ceil((fromE - startE) / rule.everyNDays));
    for (;;) {
      const n = startE + k * rule.everyNDays;
      if (n > toE) break;
      const d = fromEpochDay(n);
      if (active(d)) for (const t of rule.times) emit(d, t.startMin, t.endMin);
      k++;
    }
  } else if (s.rule.kind === 'once') {
    const rule = s.rule;
    if (active(rule.date)) for (const t of rule.times) emit(rule.date, t.startMin, t.endMin);
  }

  out.sort((a, b) => (a.date === b.date ? a.startMin - b.startMin : a.date < b.date ? -1 : 1));
  return out;
}

/** 批量展开（同窗口），去重排好序。 */
export function expandAll(schedules: Schedule[], ctx: ExpandCtx): Occurrence[] {
  const map = new Map<string, Occurrence>();
  for (const s of schedules) {
    for (const o of expandSchedule(s, ctx)) map.set(`${o.scheduleId}|${o.date}|${o.startMin}|${o.endMin}`, o);
  }
  return [...map.values()].sort((a, b) =>
    a.date === b.date ? a.startMin - b.startMin : a.date < b.date ? -1 : 1,
  );
}

export function settingsTermStart(settings?: Partial<Settings>): string | null {
  return settings?.termStart ?? null;
}

export { addDays, isValidDateStr };
