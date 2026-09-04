import type { Schedule, ScheduleRule } from '../../shared/src/types';
import { minutesToHM, weekdayCn, type DateStr } from '../../shared/src/time';

/** 规则摘要，例如：每周 · 单周 · 第1-16周 · 隔3天 */
export function ruleSummary(rule: ScheduleRule, activeFrom?: string | null, activeTo?: string | null): string {
  const parts: string[] = [];
  if (rule.kind === 'weekly') {
    parts.push('每周');
    if (rule.oddEven === 'odd') parts.push('单周');
    if (rule.oddEven === 'even') parts.push('双周');
  } else if (rule.kind === 'interval') {
    parts.push(`每隔 ${rule.everyNDays} 天`);
  } else if (rule.kind === 'once') {
    parts.push('一次性');
  }
  if (activeFrom || activeTo) {
    parts.push(`${activeFrom ?? '…'} ~ ${activeTo ?? '…'}`);
  }
  return parts.join(' · ');
}

/** 某发生窗口对应的人读描述，例如：周一 08:00-09:30 */
export function windowDesc(weekday: number, startMin: number, endMin: number): string {
  return `${weekdayCn(weekday)} ${minutesToHM(startMin)}–${minutesToHM(endMin)}`;
}

export function dateWindowDesc(date: DateStr, startMin: number, endMin: number): string {
  return `${date} ${minutesToHM(startMin)}–${minutesToHM(endMin)}`;
}

/** 一个日程的全部时段（human） */
export function allSegmentsDesc(s: Schedule): string[] {
  const rule = s.rule;
  if (rule.kind === 'weekly') {
    return rule.segments.map((seg) => windowDesc(seg.weekday, seg.startMin, seg.endMin));
  }
  if (rule.kind === 'once') {
    return rule.times.map((t) => dateWindowDesc(rule.date, t.startMin, t.endMin));
  }
  return rule.times.map((t) => `${minutesToHM(t.startMin)}–${minutesToHM(t.endMin)}（每次发生）`);
}
