import type { Occurrence, Schedule } from '../../../shared/src/types';
import { TYPE_CN } from '../../../shared/src/types';
import { allSegmentsDesc, ruleSummary, dateWindowDesc } from '../format';

export interface TooltipData {
  occ: Occurrence;
  schedule: Schedule;
  x: number;
  y: number; // 触发块顶部中心（视口坐标）
}

export default function BlockTooltip({ data, hidden }: { data: TooltipData | null; hidden: boolean }) {
  if (!data) return null;
  const { occ, schedule: s, x, y } = data;
  const current = dateWindowDesc(occ.date, occ.startMin, occ.endMin);
  const others = allSegmentsDesc(s).filter((d) => d !== current);
  // 靠近顶部 → 翻到方块下方；靠近右侧 → 向左展开，避免越出视口
  const below = y < 300;
  const left = !below && x > window.innerWidth - 380;
  const vw = window.innerWidth;
  const clampedX = Math.min(Math.max(x, left ? 340 : 170), vw - 20);

  return (
    <div
      className={`sb-tip${below ? ' below' : ''}${left ? ' left' : ''}${hidden ? ' out' : ''}`}
      style={{ top: below ? y + 22 : y - 8, left: clampedX }}
    >
      <div className="tip-head">
        <span className="tip-color" style={{ background: s.color }} />
        <strong>{s.title}</strong>
        <em className={`type-badge t-${s.type}`}>{TYPE_CN[s.type]}</em>
      </div>
      {s.notes && <p className="tip-notes">{s.notes}</p>}
      <dl className="tip-times">
        <div>
          <dt>当前</dt>
          <dd>{current}</dd>
        </div>
        {others.length > 0 && (
          <div>
            <dt>其他</dt>
            <dd>{others.join('　')}</dd>
          </div>
        )}
      </dl>
      <p className="tip-rule">
        {ruleSummary(s.rule, s.activeFrom, s.activeTo)}
        {s.overrides.length > 0 ? ` · ${s.overrides.length} 条单次例外` : ''}
      </p>
    </div>
  );
}
