import type { Occurrence, Schedule } from '../../../shared/src/types';
import { TYPE_CN } from '../../../shared/src/types';
import { allSegmentsDesc, ruleSummary } from '../format';
import { dateWindowDesc } from '../format';

export interface TooltipData {
  occ: Occurrence;
  schedule: Schedule;
  x: number;
  y: number;
}

export default function BlockTooltip({ data }: { data: TooltipData | null }) {
  if (!data) return null;
  const { occ, schedule: s, x, y } = data;
  const current = dateWindowDesc(occ.date, occ.startMin, occ.endMin);
  const others = allSegmentsDesc(s).filter((d) => d !== current);
  const flip = x > window.innerWidth - 360;

  return (
    <div
      className={`sb-tip${flip ? ' left' : ''}`}
      style={{ top: Math.max(8, y - 8), left: x }}
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
