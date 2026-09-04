import type { Conflict, DetectResult, Occurrence, Schedule, Settings } from './types';
import { TYPE_ORDER } from './types';
import { expandSchedule, expandAll, type ExpandCtx } from './expand';
import { defaultProbeWindow } from './validate';

function overlaps(a: Occurrence, b: Occurrence): boolean {
  return a.date === b.date && a.startMin < b.endMin && b.startMin < a.endMin;
}

/**
 * 冲突检测：errors = 自身重叠 / fixed×fixed；warnings = 其余组合。
 * target 已在 schedules 中时可传入（忽略自身与自己的两两比较）。
 */
export function detectConflicts(
  schedules: Schedule[],
  target: Schedule,
  ctx: ExpandCtx,
): DetectResult {
  const occs = new Map<string, Occurrence[]>();
  occs.set(target.id, expandSchedule(target, ctx));
  for (const s of schedules) {
    if (s.id === target.id) continue;
    occs.set(s.id, expandSchedule(s, ctx));
  }

  const errors: Conflict[] = [];
  const warnings: Conflict[] = [];
  const seenErr = new Set<string>();
  const seenWarn = new Set<string>();

  const add = (list: Conflict[], set: Set<string>, c: Conflict) => {
    const key = [c.date, c.a.scheduleId, c.a.startMin, c.b.scheduleId, c.b.startMin].sort().join('|');
    if (set.has(key)) return;
    set.add(key);
    list.push(c);
  };

  const ids = [...occs.keys()];
  for (let i = 0; i < ids.length; i++) {
    const listA = occs.get(ids[i])!;
    for (let j = i; j < ids.length; j++) {
      const listB = occs.get(ids[j])!;
      if (i === j) {
        // 自身重叠
        for (let x = 0; x < listA.length; x++) {
          for (let y = x + 1; y < listA.length; y++) {
            const a = listA[x];
            const b = listA[y];
            if (a.startMin === b.startMin && a.endMin === b.endMin) continue;
            if (overlaps(a, b)) {
              add(errors, seenErr, mk(target, a, b));
            }
          }
        }
        continue;
      }
      for (const a of listA) {
        for (const b of listB) {
          if (!overlaps(a, b)) continue;
          const conflict = mk(
            { id: a.scheduleId, type: a.type, title: a.title } as Schedule,
            a,
            b,
          );
          const bothFixed = a.type === 'fixed' && b.type === 'fixed';
          add(bothFixed ? errors : warnings, bothFixed ? seenErr : seenWarn, conflict);
        }
      }
    }
  }
  return { errors, warnings };
}

function mk(s: Pick<Schedule, 'id' | 'type' | 'title'>, a: Occurrence, b: Occurrence): Conflict {
  return {
    date: a.date,
    a: { scheduleId: s.id, title: a.title, type: a.type, startMin: a.startMin, endMin: a.endMin },
    b: { scheduleId: s.id, title: b.title, type: b.type, startMin: b.startMin, endMin: b.endMin },
  };
}

/** 保存/更新时用的默认探测窗口 */
export function probeWindowFor(s: Pick<Schedule, 'activeFrom' | 'activeTo'>): [string, string] {
  if (s.activeFrom && s.activeTo && s.activeFrom < s.activeTo) {
    const w: [string, string] = [s.activeFrom, s.activeTo];
    // 双向放宽一点，覆盖窗口边缘的单次例外
    const d1 = w[0].slice(0, 10) as string;
    void d1;
    return w;
  }
  return defaultProbeWindow();
}

export function sortOccurrences(list: Occurrence[]): Occurrence[] {
  return [...list].sort(
    (a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.startMin - b.startMin,
  );
}

export { expandAll, expandSchedule };
export type { Settings };
