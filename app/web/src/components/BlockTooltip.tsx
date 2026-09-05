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
  cap = false,
  onEdit,
  onHide,
  onTipPointer,
}: {
  data: TooltipData | null;
  hidden: boolean;
  /** 本机可编辑且该悬浮窗被点击固定：窗内出现「编辑」按钮且可点击 */
  interactive?: boolean;
  /** 桌面精确指针（hover: hover && pointer: fine）：悬浮窗本体可接收鼠标 */
  cap?: boolean;
  onEdit?: (scheduleId: string) => void;
  onHide?: () => void;
  /** 指针移入/移出悬浮窗本体（cap 桌面下） */
  onTipPointer?: (over: boolean) => void;
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
  // 默认锚在方块顶（顶部贴齐），确保鼠标从方块移入悬浮窗时无“空档”导致中途淡出；
  // 靠近视口顶部（below）时翻到方块下方，同样与方块区域相接。
  const anchorY = below ? y + 22 : y;

  return (
    <div
      className={`sb-tip${cap ? ' cap' : ''}${below ? ' below' : ''}${left ? ' left' : ''}${interactive ? ' act' : ''}${entered && !hidden ? ' in' : ''}`}
      style={{ top: anchorY, left: clampedX }}
      onMouseEnter={() => onTipPointer?.(true)}
      onMouseLeave={(e) => {
        const rt = e.relatedTarget as Element | null;
        onTipPointer?.(false);
        // 移向方块/另一悬浮窗：交由板面 hover 逻辑决定（保留本块或切换到对方块）；
        // 移向其它区域（含离开窗口）→ 收起。
        if (rt?.closest?.('.sb-tip, .sb-block')) return;
        onHide?.();
      }}
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
