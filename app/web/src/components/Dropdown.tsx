import { useEffect, useRef, useState } from 'react';

export interface DdOption {
  value: string;
  label: string;
}

/**
 * 自绘下拉：弹层绝对定位在触发按钮正下方（.dd position:relative）。
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
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  // 展开期间：点外部 / Esc → 收起
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t && rootRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`dd${open ? ' open' : ''}`} ref={rootRef}>
      <button
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
      {open && (
        <div className="dd-menu" role="listbox">
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
