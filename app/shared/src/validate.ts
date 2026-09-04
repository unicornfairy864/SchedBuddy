import {
  isValidDateStr,
  isValidTimeRange,
  weekdayOf,
  addDays,
  type DateStr,
} from './time';
import type { Schedule } from './types';

/** 校验一个日程，返回问题列表（空 = 通过） */
export function validateSchedule(s: Partial<Schedule>): string[] {
  const issues: string[] = [];

  if (!s.title || !s.title.trim()) issues.push('名称不能为空');
  else if (s.title.trim().length > 60) issues.push('名称过长（≤60 字符）');

  const type = s.type;
  if (type !== 'fixed' && type !== 'specific' && type !== 'optional' && type !== 'temporary') {
    issues.push('无效的日程类型');
  }

  if (!s.color || !/^#[0-9a-fA-F]{6}$/.test(s.color)) issues.push('颜色须为 #RRGGBB 格式');

  if (s.activeFrom && !isValidDateStr(s.activeFrom)) issues.push('生效起始日期格式错误');
  if (s.activeTo && !isValidDateStr(s.activeTo)) issues.push('生效结束日期格式错误');
  if (s.activeFrom && s.activeTo && s.activeFrom > s.activeTo) issues.push('生效范围起止颠倒');

  const rule = s.rule as Schedule['rule'] | undefined;
  if (!rule) {
    issues.push('缺少规则');
    return issues;
  }

  if (rule.kind === 'weekly') {
    if (!Array.isArray(rule.segments) || rule.segments.length === 0) {
      issues.push('至少需要一个时段');
    } else {
      for (const seg of rule.segments) {
        if (!Number.isInteger(seg.weekday) || seg.weekday < 1 || seg.weekday > 7) issues.push('星期几无效');
        if (!isValidTimeRange(seg.startMin, seg.endMin)) issues.push('时段时间无效');
      }
    }
    if (rule.oddEven !== 'none' && rule.oddEven !== 'odd' && rule.oddEven !== 'even') {
      issues.push('单双周取值无效');
    }
    if (rule.oddEven !== 'none' && !rule.weekStart) issues.push('使用单双周需要填写“第 1 周周一”的学期起点');
    if (rule.weekStart && !isValidDateStr(rule.weekStart)) issues.push('学期起点日期格式错误');
  } else if (rule.kind === 'interval') {
    if (!rule.startDate || !isValidDateStr(rule.startDate)) issues.push('起始日期无效');
    if (!Number.isInteger(rule.everyNDays) || rule.everyNDays < 1) issues.push('间隔天数须为正整数');
    if (!Array.isArray(rule.times) || rule.times.length === 0) issues.push('至少需要一个时段窗口');
    for (const t of rule.times) if (!isValidTimeRange(t.startMin, t.endMin)) issues.push('时段时间无效');
  } else if (rule.kind === 'once') {
    if (!rule.date || !isValidDateStr(rule.date)) issues.push('日期无效');
    if (!Array.isArray(rule.times) || rule.times.length === 0) issues.push('至少需要一个时段窗口');
    for (const t of rule.times) if (!isValidTimeRange(t.startMin, t.endMin)) issues.push('时段时间无效');
  } else {
    issues.push('未知规则类型');
  }

  // overrides
  const overrides = (s.overrides ?? []) as Schedule['overrides'];
  const seen = new Set<string>();
  for (const ov of overrides) {
    if (!ov || !ov.date || !isValidDateStr(ov.date)) {
      issues.push('例外日期无效');
      continue;
    }
    if (seen.has(ov.date)) issues.push('同一日期存在重复例外');
    seen.add(ov.date);
    if (ov.action === 'skip') {
      // ok
    } else if (ov.action === 'move') {
      if (!ov.toDate || !isValidDateStr(ov.toDate)) issues.push('改期需要目标日期');
    } else if (ov.action === 'retime') {
      if (!isValidTimeRange(ov.startMin ?? -1, ov.endMin ?? -1)) issues.push('改时的时间无效');
    } else {
      issues.push('未知例外动作');
    }
  }

  return issues;
}

/** 用于 POST 校验：无效日期长度等公共轻校验 */
export function assertNoIssues(issues: string[]): asserts issues is [] {
  if (issues.length) throw new Error(issues.join('；'));
}

/** 单双周是否命中（termStart = 第 1 周周一）。oddEven='none' 恒 true。 */
export function matchesOddEven(date: DateStr, oddEven: 'none' | 'odd' | 'even', weekStart: DateStr | null): boolean {
  if (oddEven === 'none') return true;
  if (!weekStart) return false;
  const diff = Math.floor((dateEpoch(date) - dateEpoch(weekStart)) / 7);
  const weekNo = diff + 1; // 早于学期起点则 <=0
  if (weekNo < 1) return false;
  return oddEven === 'odd' ? weekNo % 2 === 1 : weekNo % 2 === 0;
}

function dateEpoch(s: DateStr): number {
  const y = +s.slice(0, 4);
  const m = +s.slice(5, 7);
  const d = +s.slice(8, 10);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function inActiveRange(s: { activeFrom: DateStr | null; activeTo: DateStr | null }, date: DateStr): boolean {
  if (s.activeFrom && date < s.activeFrom) return false;
  if (s.activeTo && date > s.activeTo) return false;
  return true;
}

export function toDateStrOf(d: Date): DateStr {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** 默认冲突探测窗口（无 active 范围时）：[今天-60天, 今天+400天] */
export function defaultProbeWindow(): [DateStr, DateStr] {
  const today = toDateStrOf(new Date());
  return [addDays(today, -60), addDays(today, 400)];
}

export { weekdayOf };
