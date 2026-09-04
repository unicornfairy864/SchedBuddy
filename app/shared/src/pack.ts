import type { Occurrence, PackDayResult, PlacedOccurrence, ScheduleType } from './types';
import { TYPE_ORDER } from './types';

/**
 * 单日排布（横向条堆叠）：
 * - 排 0（最底）：全部 fixed；底色 = 绿色空闲带（未被 fixed 占用的区间）。
 * - 其余日程按重要度升序（specific→optional→temporary）、同重要度按开始时间升序，
 *   自下而上放入第一条不重叠的排；放不下则向上新增一排。
 * - 被强制保存产生的 fixed×fixed 重叠：后到者顺延到上方排（排 0 之外）。
 */
export function packDay(items: Occurrence[]): PackDayResult {
  const placed: PlacedOccurrence[] = [];
  const lanes: { end: number; items: PlacedOccurrence[] }[] = [];
  // 排0 始终存在（固定排）
  lanes.push({ end: 0, items: [] });

  const fits = (laneIdx: number, startMin: number, endMin: number): boolean => {
    for (const p of lanes[laneIdx].items) {
      if (startMin < p.occ.endMin && p.occ.startMin < endMin) return false;
    }
    return true;
  };

  const fixed = items.filter((o) => o.type === 'fixed').sort((a, b) => a.startMin - b.startMin);
  const rest = items
    .filter((o) => o.type !== 'fixed')
    .sort((a, b) => TYPE_ORDER[a.type as ScheduleType] - TYPE_ORDER[b.type as ScheduleType] || a.startMin - b.startMin);

  const push = (occ: Occurrence, fromLane: number) => {
    for (let lane = fromLane; lane < lanes.length; lane++) {
      if (fits(lane, occ.startMin, occ.endMin)) {
        const p = { occ, lane };
        lanes[lane].items.push(p);
        lanes[lane].end = Math.max(lanes[lane].end, occ.endMin);
        placed.push(p);
        return;
      }
    }
    const idx = lanes.length;
    lanes.push({ end: occ.endMin, items: [] });
    const p = { occ, lane: idx };
    lanes[idx].items.push(p);
    placed.push(p);
  };

  // 若某天没有任何 fixed，固定排依然存在（全空闲）→ 语义 OK，见 row0Free。
  for (const o of fixed) push(o, 0);
  for (const o of rest) push(o, 1); // 非固定从排1起，永不占用绿色固定排

  // 排0 空闲区间 = 全天 0..1440 减去 fixed 占用
  const row0Free: [number, number][] = [];
  let cursor = 0;
  const fixedPlaced = lanes[0].items.map((p) => p.occ).sort((a, b) => a.startMin - b.startMin);
  for (const f of fixedPlaced) {
    if (f.startMin > cursor) row0Free.push([cursor, f.startMin]);
    cursor = Math.max(cursor, f.endMin);
  }
  if (cursor < 1440) row0Free.push([cursor, 1440]);

  placed.sort((a, b) => a.lane - b.lane || a.occ.startMin - b.occ.startMin);
  return { placed, laneCount: lanes.length, row0Free };
}
