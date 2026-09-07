/**
 * 编码：Schedule[] → VCALENDAR（RFC 5545 文本；floating 时间）—— A1 核心。
 * 设计（与 docs/09-icalendar.md 一致）：
 *  - 同日多时段 → 每段一个 VEVENT（共享 UID 前缀 + X-SCHEDBUDDY-GROUP=<scheduleId>）；
 *  - weekly 全周：FREQ=WEEKLY;BYDAY=...（INTERVAL=1）；
 *  - weekly 单/双周：FREQ=WEEKLY;INTERVAL=2，DTSTART 取该段首个“相位正确”的发生日；
 *  - interval：FREQ=DAILY;INTERVAL=N；
 *  - 课程总数量(按天计)：显式展开为 DTSTART+RDATE 列表（保证与 SchedBuddy 一致）；
 *  - skip/move：EXDATE（源）/ RDATE（目标）；
 *  - 时间一律 floating（无 TZID）；颜色走 X-SCHEDBUDDY-COLOR。
 * 纯函数、无 IO。A2 的 caret/文本转义见 util.ts，编码统一经 contentLine。
 */
import { addDays, epochDay, fromEpochDay, weekdayOf } from '../time';
import { expandSchedule } from '../expand';
import { matchesOddEven } from '../validate';
import { contentLine, dateTimeFloating, escapeText } from './util';
import type { DateStr } from '../time';

export interface IcsEncodeCtx {
  from: DateStr;
  to: DateStr;
  termStart?: string | null;
}

type Override = { action: string; date: string; toDate?: string };

export interface IcsEventOut {
  uid: string;
  summary: string;
  notes?: string;
  color: string;
  group: string;
  start: string;
  end: string;
  exdates: string[];
  rdates: string[];
  rrule?: { freq: 'WEEKLY' | 'DAILY'; interval: number; byday?: string; until?: string };
}

const WD = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

function pushEvent(lines: string[], ev: IcsEventOut): void {
  lines.push('BEGIN:VEVENT');
  lines.push(contentLine('UID', [], ev.uid));
  lines.push(contentLine('DTSTAMP', [], dateTimeFloating(new Date().toISOString().slice(0, 10), 0)));
  lines.push(contentLine('SUMMARY', [], escapeText(ev.summary)));
  if (ev.notes) lines.push(contentLine('DESCRIPTION', [], escapeText(ev.notes)));
  lines.push(contentLine('X-SCHEDBUDDY-COLOR', [], escapeText(ev.color)));
  lines.push(contentLine('X-SCHEDBUDDY-GROUP', [], escapeText(ev.group)));
  lines.push(contentLine('DTSTART', [], ev.start));
  lines.push(contentLine('DTEND', [], ev.end));
  if (ev.rrule) {
    const p = [`FREQ=${ev.rrule.freq}`, `INTERVAL=${ev.rrule.interval}`];
    if (ev.rrule.byday) p.push(`BYDAY=${ev.rrule.byday}`);
    if (ev.rrule.until) p.push(`UNTIL=${ev.rrule.until}`);
    lines.push(contentLine('RRULE', [], p.join(';')));
  }
  if (ev.exdates.length) lines.push(contentLine('EXDATE', [], ev.exdates.join(',')));
  if (ev.rdates.length) lines.push(contentLine('RDATE', [], ev.rdates.join(',')));
  lines.push('END:VEVENT');
}

export function scheduleToIcs(
  schedules: Array<{
    id: string; title: string; notes: string; color: string;
    rule: any; activeFrom: string | null; activeTo: string | null;
    occurrenceLimit: number | null; overrides: Override[];
  }>,
  ctx: IcsEncodeCtx,
): string {
  const lines = ['BEGIN:VCALENDAR',
    contentLine('VERSION', [], '2.0'),
    contentLine('PRODID', [], '-//SchedBuddy//CN 0.3//ZH'),
    contentLine('CALSCALE', [], 'GREGORIAN')];

  const uid = (id: string, kind: string, i: number) => `schedbuddy-${id}-${kind}-${i}`;
  const skips = (s: { overrides: Override[] }): string[] => s.overrides.filter((o) => o.action === 'skip').map((o) => o.date);
  const moves = (s: { overrides: Override[] }): { from: string; to: string }[] =>
    s.overrides.filter((o): o is Override & { toDate: string } => o.action === 'move' && !!o.toDate).map((o) => ({ from: o.date, to: o.toDate! }));

  for (const s of schedules) {
    const { rule } = s;
    const until = s.activeTo ? dateTimeFloating(s.activeTo, 1439) : undefined;
    const skipDays = skips(s);
    const moveList = moves(s);

    // 课程总数量：显式展开（DTSTART + RDATE 全量），语义与引擎一致
    if (s.occurrenceLimit != null) {
      const origin = rule.kind === 'interval' ? rule.startDate
        : rule.kind === 'weekly' ? (rule.weekStart ?? ctx.termStart ?? s.activeFrom ?? ctx.from)
        : rule.date;
      const bound = addDays(origin, s.occurrenceLimit * 45 + 40);
      const occs = expandSchedule(s as any, { from: origin, to: bound, termStart: ctx.termStart ?? null });
      const byDayTime = new Map<string, { dates: string[]; startMin: number; endMin: number }[]>();
      const idx = (dt: string) => `${dt}|${rule.kind}`;
      void idx;
      // 按 (date) 去重天集合保留顺序
      const seen = new Set<string>();
      const dayList: string[] = [];
      const bySlot = new Map<string, { day: string; startMin: number; endMin: number }[]>();
      for (const o of occs) {
        if (!seen.has(o.date)) { seen.add(o.date); dayList.push(o.date); }
        const key = `${o.startMin}-${o.endMin}`;
        const arr = bySlot.get(key) ?? [];
        arr.push({ day: o.date, startMin: o.startMin, endMin: o.endMin });
        bySlot.set(key, arr);
      }
      void byDayTime;
      let slotNo = 0;
      for (const [key, arr] of bySlot) {
        const d0 = arr[0].day;
        const start = arr[0].startMin;
        const end = arr[0].endMin;
        pushEvent(lines, {
          uid: uid(s.id, 'cnt', slotNo++),
          summary: s.title, notes: s.notes, color: s.color, group: s.id,
          start: dateTimeFloating(d0, start),
          end: dateTimeFloating(d0, end),
          exdates: [],
          rdates: arr.slice(1).map((x) => dateTimeFloating(x.day, x.startMin)),
        });
        void key;
      }
      void dayList;
      continue;
    }

    if (rule.kind === 'once') {
      for (let i = 0; i < (rule.times ?? []).length; i++) {
        const t = rule.times[i];
        const ev: IcsEventOut = {
          uid: uid(s.id, 'once', i),
          summary: s.title, notes: s.notes, color: s.color, group: s.id,
          start: dateTimeFloating(rule.date, t.startMin),
          end: dateTimeFloating(rule.date, t.endMin),
          exdates: skipDays.includes(rule.date) ? [dateTimeFloating(rule.date, t.startMin)] : [],
          rdates: moveList.filter((m) => m.from === rule.date).map((m) => dateTimeFloating(m.to, t.startMin)),
        };
        pushEvent(lines, ev);
      }
      continue;
    }

    if (rule.kind === 'weekly') {
      const segs: any[] = rule.segments ?? [];
      const parity: 'none' | 'odd' | 'even' = rule.oddEven ?? 'none';
      const weekStart = rule.weekStart ?? ctx.termStart ?? null;
      const base = s.activeFrom && s.activeFrom > ctx.from ? s.activeFrom : ctx.from;
      // 各段的“首发生日”（相位正确）
      const firstOf = (wd: number): DateStr => {
        const fromD = parity === 'none' ? base : (weekStart && weekStart > base ? weekStart : base);
        let d = fromD;
        for (let k = 0; k < 370; k++) {
          if (weekdayOf(d) === wd) {
            if (parity === 'none') return d;
            if (matchesOddEven(d, parity, weekStart)) return d;
          }
          d = addDays(d, 1);
        }
        return base;
      };
      // 每段一个 VEVENT，BYDAY 仅取该段自身星期（避免重复展开）
      segs.forEach((seg: any, i: number) => {
        const d0 = firstOf(seg.weekday);
        const ev: IcsEventOut = {
          uid: uid(s.id, 'wk', i),
          summary: s.title, notes: s.notes, color: s.color, group: s.id,
          start: dateTimeFloating(d0, seg.startMin),
          end: dateTimeFloating(d0, seg.endMin),
          exdates: [],
          rdates: [],
          rrule: {
            freq: 'WEEKLY',
            interval: parity === 'none' ? 1 : 2,
            byday: WD[((seg.weekday - 1) % 7 + 7) % 7],
            until,
          },
        };
        // 该段所在星期命中才需 EXDATE；保守起见 skip/move 源日期若与该段 weekday 相同则剔除该次
        for (const d of skipDays) {
          if (weekdayOf(d) === seg.weekday) ev.exdates.push(dateTimeFloating(d, seg.startMin));
        }
        for (const m of moveList) {
          if (weekdayOf(m.from) === seg.weekday) {
            ev.exdates.push(dateTimeFloating(m.from, seg.startMin));
            ev.rdates.push(dateTimeFloating(m.to, seg.startMin));
          }
        }
        pushEvent(lines, ev);
      });
      continue;
    }

    if (rule.kind === 'interval') {
      const n = rule.everyNDays;
      const startE = epochDay(rule.startDate);
      const baseD = s.activeFrom && s.activeFrom > ctx.from ? s.activeFrom : ctx.from;
      const k0 = Math.max(0, Math.ceil((epochDay(baseD) - startE) / n));
      const d0 = fromEpochDay(startE + k0 * n);
      (rule.times ?? []).forEach((t: any, i: number) => {
        const ev: IcsEventOut = {
          uid: uid(s.id, 'iv', i),
          summary: s.title, notes: s.notes, color: s.color, group: s.id,
          start: dateTimeFloating(d0, t.startMin),
          end: dateTimeFloating(d0, t.endMin),
          exdates: [],
          rdates: [],
          rrule: { freq: 'DAILY', interval: n, until },
        };
        for (const d of skipDays) {
          if (diffDaysMod(epochDay(d) - startE, n) === 0) ev.exdates.push(dateTimeFloating(d, t.startMin));
        }
        for (const m of moveList) {
          if (diffDaysMod(epochDay(m.from) - startE, n) === 0) {
            ev.exdates.push(dateTimeFloating(m.from, t.startMin));
            ev.rdates.push(dateTimeFloating(m.to, t.startMin));
          }
        }
        pushEvent(lines, ev);
      });
      continue;
    }
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

function diffDaysMod(x: number, n: number): number {
  return ((x % n) + n) % n;
}
