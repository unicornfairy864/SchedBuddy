/** 时间工具：全部按"本地日期字符串 YYYY-MM-DD"处理，分钟数=当日 0..1439。 */

export type DateStr = string; // 'YYYY-MM-DD'（本地时区语义）

export const DAY_MS = 86_400_000;
export const MINUTES_PER_DAY = 24 * 60;

export function pad2(n: number): string {
  return n < 10 ? '0' + n : '' + n;
}

/** 'YYYY-MM-DD' -> 自 1970-01-01 起的天序号（UTC 快照，避开 DST） */
export function epochDay(s: DateStr): number {
  const y = +s.slice(0, 4);
  const m = +s.slice(5, 7);
  const d = +s.slice(8, 10);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function fromEpochDay(n: number): DateStr {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function todayStr(): DateStr {
  // 注意：必须用“本地”日期，不能用 toISOString()（那是 UTC，东八区凌晨会差一天）
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function addDays(s: DateStr, n: number): DateStr {
  return fromEpochDay(epochDay(s) + n);
}

export function diffDays(a: DateStr, b: DateStr): number {
  return epochDay(b) - epochDay(a);
}

/** 1=周一 … 7=周日 */
export function weekdayOf(s: DateStr): number {
  const n = epochDay(s); // 1970-01-01 是周四 -> getUTCDay 4
  const wd = ((n + 3) % 7 + 7) % 7; // 0=Mon
  return wd + 1;
}

/** 所在周的周一 */
export function mondayOf(s: DateStr): DateStr {
  return addDays(s, -(weekdayOf(s) - 1));
}

/** 距第 1 周周一的周序号（1-based；早于锚点可能 <=0） */
export function weekIndexOf(s: DateStr, mondayOfWeek1: DateStr): number {
  return Math.floor(diffDays(mondayOfWeek1, s) / 7) + 1;
}

export function isValidDateStr(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function minutesToHM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return pad2(h) + ':' + pad2(m);
}

/** 'HH:mm' / 'H:mm' -> 分钟；非法返回 null */
export function hmToMinutes(s: string): number | null {
  const mm = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!mm) return null;
  const h = +mm[1];
  const m = +mm[2];
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

export function isValidTimeRange(startMin: number, endMin: number): boolean {
  return (
    Number.isInteger(startMin) && Number.isInteger(endMin) &&
    startMin >= 0 && endMin <= MINUTES_PER_DAY && startMin < endMin
  );
}

export function rangeDates(from: DateStr, to: DateStr): DateStr[] {
  const out: DateStr[] = [];
  const start = epochDay(from);
  const end = epochDay(to);
  if (start > end) return out;
  for (let n = start; n <= end; n++) out.push(fromEpochDay(n));
  return out;
}

const WEEKDAY_CN = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
export function weekdayCn(wd: number): string {
  return WEEKDAY_CN[wd - 1] ?? '?';
}
