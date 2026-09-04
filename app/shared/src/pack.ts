import type { Occurrence, PackDayResult, PlacedOccurrence, ScheduleType } from './types';
import { TYPE_ORDER } from './types';

/**
 * 单日排布（横向条堆叠，自底向上，永不产生空排）：
 * 1. 全部日程按重要度升序（fixed→specific→optional→temporary）、同重要度按开始时间升序排列；
 * 2. 逐个放入【自下而上第一条不与之重叠的排】；只有所有已用排都重叠时才在其上方新增一排；
 * 3. 类型不保留专用排：同排可混合不同类型（只要时间不重叠），因此不会出现“为类型留空排”；
 * 4. 最底排（排 0）未被任何方块占用的区间返回为 row0Free，供浅绿“空闲”底绘制。
 */
export function packDay(items: Occurrence[]): PackDayResult {
  const sorted = [...items].sort(
    (a, b) =>
      TYPE_ORDER[a.type as ScheduleType] - TYPE_ORDER[b.type as ScheduleType] ||
      a.startMin - b.startMin ||
      (a.scheduleId < b.scheduleId ? -1 : 1),
  );

  const lanes: { items: PlacedOccurrence[] }[] = [];
  const placed: PlacedOccurrence[] = [];

  const fits = (laneIdx: number, startMin: number, endMin: number): boolean => {
    for (const p of lanes[laneIdx].items) {
      if (startMin < p.occ.endMin && p.occ.startMin < endMin) return false;
    }
    return true;
  };

  for (const occ of sorted) {
    let laneIdx = -1;
    for (let i = 0; i < lanes.length; i++) {
      if (fits(i, occ.startMin, occ.endMin)) {
        laneIdx = i;
        break;
      }
    }
    if (laneIdx === -1) {
      laneIdx = lanes.length;
      lanes.push({ items: [] });
    }
    const p = { occ, lane: laneIdx };
    lanes[laneIdx].items.push(p);
    placed.push(p);
  }

  // 排0 空闲区间 = 0..1440 减去排0 上所有方块（同排内方块互不重叠）
  const row0Free: [number, number][] = [];
  const row0 = lanes[0]?.items.map((p) => p.occ).sort((a, b) => a.startMin - b.startMin) ?? [];
  let cursor = 0;
  for (const f of row0) {
    if (f.startMin > cursor) row0Free.push([cursor, f.startMin]);
    cursor = Math.max(cursor, f.endMin);
  }
  if (cursor < 1440) row0Free.push([cursor, 1440]);

  placed.sort((a, b) => a.lane - b.lane || a.occ.startMin - b.occ.startMin);
  return { placed, laneCount: lanes.length, row0Free };
}
