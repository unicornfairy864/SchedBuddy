/**
 * 解析：VCALENDAR 文本 → 事件结构；并把“受支持的子集”重建为 SchedBuddy Schedule（A1 解析侧）。
 * A2 细节：参数值 caret 解码与 TEXT 解码在 util.ts；本模块不试图解析未支持属性，一律进 ignored 清单。
 * 支持子集（其余忽略并报告）：
 *  - VEVENT + SUMMARY / DESCRIPTION / DTSTART / DTEND / RRULE(FREQ WEEKLY|DAILY, INTERVAL, BYDAY, UNTIL)
 *  - EXDATE / RDATE（floating 或 DATE 值）
 *  - X-SCHEDBUDDY-GROUP / -COLOR（SchedBuddy 自有往返元数据）
 */
import { addDays, mondayOf, weekdayOf } from '../time';
import { parseLines, decodeText, icsDateToYMD } from './util';
import type { DateStr } from '../time';

export interface IcsTime { date: DateStr; minutes: number; allDay?: boolean }

export function parseDateTimeRaw(v: string): IcsTime {
  const clean = v.replace(/Z$/i, ''); // 尾部 Z 表示 UTC —— 本项目 floating 口径，忽略时区标记
  if (/^\d{8}$/.test(clean)) {
    const d = icsDateToYMD(clean);
    return { date: d, minutes: 0, allDay: true };
  }
  const m = /^(\d{8})T(\d{2})(\d{2})(\d{2})?$/.exec(clean);
  if (!m) return { date: '1970-01-01', minutes: 0 };
  const date = icsDateToYMD(m[1]);
  const minutes = Number(m[2]) * 60 + Number(m[3]);
  return { date, minutes };
}

export interface IcsRRule {
  freq: 'WEEKLY' | 'DAILY';
  interval: number;
  byday?: string[];
  until?: string; // YYYYMMDDTHHMMSS
  count?: number;
}

export interface IcsEvent {
  uid: string;
  summary: string;
  description: string;
  color: string;
  group: string | null;
  start: IcsTime;
  end: IcsTime;
  rrule: IcsRRule | null;
  exdates: string[]; // RAW（date-time / date）
  rdates: string[]; // RAW
  line: number;
}

export interface IcsParseResult {
  events: IcsEvent[];
  ignored: string[];
}

export function parseIcs(text: string): IcsParseResult {
  const props = parseLines(text);
  const events: IcsEvent[] = [];
  const ignored: string[] = [];
  let cur: Partial<IcsEvent> | null = null;
  const flush = () => {
    if (cur && (cur as any).bad) { cur = null; return; } // RRULE 不支持：整条忽略（已入 ignored）
    if (cur && cur.uid && cur.start) {
      events.push({
        uid: cur.uid,
        summary: cur.summary ?? '',
        description: cur.description ?? '',
        color: cur.color ?? '',
        group: cur.group ?? null,
        start: cur.start!,
        end: cur.end ?? { date: cur.start!.date, minutes: cur.start!.minutes },
        rrule: cur.rrule ?? null,
        exdates: cur.exdates ?? [],
        rdates: cur.rdates ?? [],
        line: cur.line ?? 0,
      });
    }
    cur = null;
  };
  for (const p of props) {
    if (p.name === 'BEGIN' && p.value.toUpperCase() === 'VEVENT') { flush(); cur = { exdates: [], rdates: [], line: p.line }; continue; }
    if (!cur) continue;
    if (p.name === 'END' && p.value.toUpperCase() === 'VEVENT') { flush(); continue; }
    switch (p.name) {
      case 'UID': cur.uid = p.value; break;
      case 'SUMMARY': cur.summary = decodeText(p.value); break;
      case 'DESCRIPTION': cur.description = decodeText(p.value); break;
      case 'X-SCHEDBUDDY-COLOR': cur.color = decodeText(p.value); break;
      case 'X-SCHEDBUDDY-GROUP': cur.group = decodeText(p.value); break;
      case 'DTSTART': cur.start = parseDateTimeRaw(p.value); break;
      case 'DTEND': cur.end = parseDateTimeRaw(p.value); break;
      case 'EXDATE': cur.exdates = (cur.exdates ?? []).concat(splitMulti(p.value)); break;
      case 'RDATE': cur.rdates = (cur.rdates ?? []).concat(splitMulti(p.value)); break;
      case 'RRULE': {
        const r = parseRRule(p.value);
        if (r) cur.rrule = r;
        else { (cur as any).bad = true; ignored.push(`VEVENT@${p.line}: RRULE 不支持（${p.value}），整条忽略`); }
        break;
      }
      default:
        // 已知但暂不承载的组件/属性不逐个报（如 VALARM、CLASS 等），避免噪音
        if (p.name.startsWith('X-')) break;
        if (['VERSION', 'PRODID', 'CALSCALE', 'METHOD'].includes(p.name)) break;
        ignored.push(`VEVENT@${p.line}: 忽略 ${p.name}`);
    }
  }
  flush();
  return { events, ignored };
}

function splitMulti(v: string): string[] {
  return v.split(',').map((s) => s.trim());
}

export function parseRRule(v: string): IcsRRule | null {
  const m = new Map<string, string>();
  for (const part of v.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    m.set(part.slice(0, i).toUpperCase(), part.slice(i + 1));
  }
  const freq = m.get('FREQ');
  if (freq !== 'WEEKLY' && freq !== 'DAILY') return null;
  const interval = Math.max(1, Number(m.get('INTERVAL') || 1) || 1);
  const out: IcsRRule = { freq, interval };
  const byday = m.get('BYDAY');
  if (byday) out.byday = byday.split(',');
  if (m.has('UNTIL')) out.until = m.get('UNTIL');
  const count = Number(m.get('COUNT'));
  if (Number.isInteger(count) && count > 0) out.count = count;
  return out;
}

/* ---------------- 重建（子集 → SchedBuddy Schedule） ---------------- */

export interface RebuiltSchedule {
  title: string;
  notes: string;
  color: string;
  type: 'specific';
  rule: any;
  activeFrom: string | null;
  activeTo: string | null;
  occurrenceLimit: number | null;
  overrides: any[];
  /** 来源 uid / line，供报告 */
  sources: string[];
}

/** 把解析出的事件合并重建为 SchedBuddy 日程（尽力而为；无法推断的进 ignored） */
export function eventsToSchedules(events: IcsEvent[]): { schedules: RebuiltSchedule[]; ignored: string[] } {
  const groups = new Map<string, IcsEvent[]>();
  for (const ev of events) {
    const key = ev.group ?? ev.uid;
    const arr = groups.get(key) ?? [];
    arr.push(ev);
    groups.set(key, arr);
  }
  const schedules: RebuiltSchedule[] = [];
  const ignored: string[] = [];
  for (const [, evs] of groups) {
    const rep = evs[0];
    const color = rep.color && /^#[0-9a-fA-F]{6}$/.test(rep.color) ? rep.color : '#4A90E2';
    const sources = evs.map((e) => `${e.uid}(${e.line})`);

    const rrules = evs.filter((e) => e.rrule?.freq === 'WEEKLY');
    if (rrules.length && rep.start) {
      // —— 周规则（interval 1 或 2） ——
      const interval = rrules[0].rrule!.interval;
      const wkDates = evs.map((e) => e.start.date);
      const weekStart = interval === 2 ? mondayOf(interval === 2 ? earliest(wkDates) : wkDates[0]) : null;
      const slots = new Map<string, { weekday: number; startMin: number; endMin: number }>();
      for (const ev of evs) {
        if (!ev.rrule || ev.rrule.freq !== 'WEEKLY') continue;
        const days = ev.rrule.byday && ev.rrule.byday.length ? ev.rrule.byday : [''];
        for (const bd of days) {
          const wd = WD_TO_NUM[bd] ?? weekdayOf(ev.start.date);
          if (wd == null) continue;
          const key = `${wd}:${ev.start.minutes}:${ev.end.minutes}`;
          slots.set(key, { weekday: wd, startMin: ev.start.minutes, endMin: ev.end.minutes });
        }
      }
      const allSlots = [...slots.values()];
      const maxEnd = Math.max(...evs.map((e) => e.end.minutes));
      void maxEnd;
      const activeTo = rrules[0].rrule!.until ? icsDateToYMD(rrules[0].rrule!.until) : null;
      const activeFrom = null;
      const overrides: any[] = [];
      for (const ev of evs) {
        const skip = ev.exdates.filter((x) => !/T/.test(x)).map(icsDateToYMD);
        for (const d of ev.exdates.map(icsDateToYMD)) {
          if (!overrides.some((o) => o.date === d && o.action === 'skip')) {
            // 若同一日期对应 move（存在 rdate）→ move；否则 skip
            const rdateDates = ev.rdates.map(icsDateToYMD);
            const hasMove = rdateDates.length > 0;
            if (hasMove) {
              overrides.push({ date: d, action: 'move', toDate: rdateDates[0] });
            } else if (skip.includes(d)) {
              overrides.push({ date: d, action: 'skip' });
            }
          }
        }
        void skip;
      }
      // 只有单时段的周规则也可能有多个 VEVENT(每段)；同 group 内 slots 并集
      const sorted = allSlots.sort((a, b) => a.startMin - b.startMin || a.weekday - b.weekday);
      if (sorted.length === 0) { ignored.push(`${rep.uid}: 无法从周事件重建时段`); continue; }
      const rule: any = {
        kind: 'weekly',
        weekStart: weekStart ?? null,
        oddEven: interval === 2 ? 'odd' : 'none',
        segments: sorted.map((s) => ({ weekday: s.weekday, startMin: s.startMin, endMin: s.endMin })),
      };
      schedules.push({
        title: rep.summary, notes: rep.description, color, type: 'specific',
        rule, activeFrom, activeTo, occurrenceLimit: null, overrides, sources,
      });
      continue;
    }

    const daily = evs.filter((e) => e.rrule?.freq === 'DAILY');
    if (daily.length && daily[0].rrule!.interval >= 1) {
      const n = daily[0].rrule!.interval;
      const times = evs.map((e) => ({ startMin: e.start.minutes, endMin: e.end.minutes })).sort((a, b) => a.startMin - b.startMin);
      const activeTo = daily[0].rrule!.until ? icsDateToYMD(daily[0].rrule!.until) : null;
      const startDate = earliest(evs.map((e) => e.start.date));
      schedules.push({
        title: rep.summary, notes: rep.description, color, type: 'specific',
        rule: { kind: 'interval', startDate, everyNDays: n, times },
        activeFrom: null, activeTo, occurrenceLimit: null, overrides: [], sources,
      });
      continue;
    }

    // —— 一次性 ——
    const date0 = earliest(evs.map((e) => e.start.date));
    if (evs.every((e) => e.start.date === date0 && !e.rrule)) {
      schedules.push({
        title: rep.summary, notes: rep.description, color, type: 'specific',
        rule: {
          kind: 'once', date: date0,
          times: evs.map((e) => ({ startMin: e.start.minutes, endMin: e.end.minutes })).sort((a, b) => a.startMin - b.startMin),
        },
        activeFrom: null, activeTo: null, occurrenceLimit: null, overrides: [], sources,
      });
      continue;
    }
    ignored.push(`${rep.uid}: 无法识别的重复模式`);
  }
  return { schedules, ignored };
}

function earliest(list: string[]): string {
  return [...list].sort()[0] ?? '1970-01-01';
}

const WD_TO_NUM: Record<string, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };

export { addDays };
