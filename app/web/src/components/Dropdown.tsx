import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface DdOption {
  value: string;
  label: string;
}

/**
 * 自绘下拉（弹层 position:fixed，锚定触发按钮，越界自动上翻）。
 * 原生 <select> 的展开列表无法跨浏览器自定义样式，弹窗内改用本组件。
 */
export default function Dropdown({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: DdOption[];
  onChange: (v: string) => void;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null);

  const selected = options.find((o) => o.value === value);

  // 展开期间：点外部 / Esc / 滚动 / 缩放 → 收起（滚动用 capture 以覆盖弹窗内部滚动）
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t?.closest?.('.dd')) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onCollapse = () => setOpen(false);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onCollapse);
    window.addEventListener('scroll', onCollapse, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onCollapse);
      window.removeEventListener('scroll', onCollapse, true);
    };
  }, [open]);

  // 打开时按触发按钮位置锚定弹层（距底部不足则向上展开）
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const estH = 10 + options.length * 34;
    const up = r.bottom + estH > window.innerHeight - 12 && r.top > estH + 12;
    setPos({ top: up ? r.top - 8 : r.bottom + 6, left: r.left, width: r.width, up });
  }, [open, options.length]);

  return (
    <div className={`dd${open ? ' open' : ''}`}>
      <button
        ref={btnRef}
        type="button"
        className="dd-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="dd-val">{selected?.label ?? ''}</span>
        <i className="dd-arrow" aria-hidden />
      </button>
      {open && pos && (
        <div
          className={`dd-menu${pos.up ? ' up' : ''}`}
          role="listbox"
          style={{ top: pos.top, left: pos.left, minWidth: pos.width }}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={`dd-opt${o.value === value ? ' on' : ''}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              <i className="dd-dot" aria-hidden />
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
