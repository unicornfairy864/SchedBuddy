import type { DateStr } from './time';

/** 四类日程。importance：0 固定 < 1 特定(社团) < 2 可选 < 3 临时（越小越重要/越靠底部） */
export type ScheduleType = 'fixed' | 'specific' | 'optional' | 'temporary';

export const TYPE_ORDER: Record<ScheduleType, number> = {
  fixed: 0,
  specific: 1,
  optional: 2,
  temporary: 3,
};

export const TYPE_CN: Record<ScheduleType, string> = {
  fixed: '固定日程',
  specific: '特定日程',
  optional: '可选日程',
  temporary: '临时日程',
};

/** 日程默认色（创建时可改/随机） */
export const TYPE_DEFAULT_COLOR: Record<ScheduleType, string> = {
  fixed: '#E4574E',
  specific: '#4A90E2',
  optional: '#F5A623',
  temporary: '#9B7EDE',
};

/** weekly：段 = 星期几 + 起止分钟 */
export interface WeeklySeg {
  weekday: number; // 1=周一..7
  startMin: number;
  endMin: number;
}

export type OddEven = 'none' | 'odd' | 'even';

/** 固定星期多段（可叠加单双周与生效范围） */
export interface WeeklyRule {
  kind: 'weekly';
  /** 单双周锚点：第 1 周周一的日期；为 null 时回退 settings.termStart */
  weekStart: DateStr | null;
  oddEven: OddEven;
  segments: WeeklySeg[];
}

/** 隔 N 天：自 startDate 起每 everyNDays 天发生一次，每次套用 times 全部窗口 */
export interface IntervalRule {
  kind: 'interval';
  startDate: DateStr;
  everyNDays: number;
  times: { startMin: number; endMin: number }[];
}

/** 一次性（临时日程/单日事件） */
export interface OnceRule {
  kind: 'once';
  date: DateStr;
  times: { startMin: number; endMin: number }[];
}

export type ScheduleRule = WeeklyRule | IntervalRule | OnceRule;

/** 单次例外：对某一天的具体处理（不改变规则本身） */
export interface Override {
  date: DateStr; // 被例外的原发生日期
  action: 'skip' | 'move' | 'retime';
  toDate?: DateStr; // move 目标日期
  startMin?: number; // retime
  endMin?: number;
}

export interface Schedule {
  id: string;
  title: string;
  notes: string;
  type: ScheduleType;
  color: string; // '#rrggbb'
  rule: ScheduleRule;
  activeFrom: DateStr | null; // 生效范围（含边界）
  activeTo: DateStr | null;
  overrides: Override[];
  createdAt: string; // ISO
  updatedAt: string;
}

/** 展开结果：一次"具体发生"，窗口粒度 = (日期, 起止) */
export interface Occurrence {
  scheduleId: string;
  title: string;
  type: ScheduleType;
  color: string;
  date: DateStr;
  startMin: number;
  endMin: number;
}

export interface Conflict {
  date: DateStr;
  a: { scheduleId: string; title: string; type: ScheduleType; startMin: number; endMin: number };
  b: { scheduleId: string; title: string; type: ScheduleType; startMin: number; endMin: number };
}

export interface DetectResult {
  /** 自身重叠 / fixed×fixed：默认拒绝 */
  errors: Conflict[];
  /** 其余组合：警告，可强制保存 */
  warnings: Conflict[];
}

/** packDay 输出中的一条 */
export interface PlacedOccurrence {
  occ: Occurrence;
  lane: number; // 0 = 最底固定排；1.. 向上
}

export interface PackDayResult {
  placed: PlacedOccurrence[];
  laneCount: number; // 所需排数（含固定排）
  /** 最底排（固定排）的空闲区间，供绿色"空闲"底绘制 [ [startMin,endMin], ... ] */
  row0Free: [number, number][];
}

export interface Settings {
  termStart?: DateStr | null; // 学期第 1 周周一
  termEnd?: DateStr | null;
  weekCount?: number | null;
  holidays?: DateStr[];
  ui?: Record<string, unknown>;
  [k: string]: unknown;
}
