import { useEffect, useState } from 'react';
import type { Occurrence, Schedule } from '../../../shared/src/types';
import { TYPE_CN } from '../../../shared/src/types';
import { allSegmentsDesc, ruleSummary, dateWindowDesc } from '../format';

export interface TooltipData {
  occ: Occurrence;
  schedule: Schedule;
  x: number;
  y: number; // 触发块顶部中心（视口坐标）
}

export default function BlockTooltip({
  data,
  hidden,
  interactive = false,
  onEdit,
  onHide,
}: {
  data: TooltipData | null;
  hidden: boolean;
  /** 本机可编辑且该悬浮窗被点击固定：窗内出现「编辑」按钮且可点击 */
  interactive?: boolean;
  onEdit?: (scheduleId: string) => void;
  onHide?: () => void;
}) {
  // 淡入：先以 opacity:0 挂载并让浏览器绘制一帧，再于下一帧加 .in 触发过渡；
  // 淡出：移除 .in 即可（组件仍挂载 170ms 供动画播放）。
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (hidden) {
      setEntered(false);
      return;
    }
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [hidden]);

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
      className={`sb-tip${below ? ' below' : ''}${left ? ' left' : ''}${interactive ? ' act' : ''}${entered && !hidden ? ' in' : ''}`}
      style={{ top: below ? y + 22 : y - 8, left: clampedX }}
      onMouseLeave={() => interactive && onHide?.()}
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
      {interactive && onEdit && (
        <div className="tip-actions">
          <button
            type="button"
            className="tip-edit"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(s.id);
            }}
          >
            ✎ 编辑
          </button>
        </div>
      )}
    </div>
  );
}
