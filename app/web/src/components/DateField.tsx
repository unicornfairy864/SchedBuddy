import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

/** 由 'YYYY-MM-DD' 拆成 [年, 月, 日]（空串 → 三个空） */
function splitSegs(v: string): [string, string, string] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? '');
  return m ? [m[1], m[2], m[3]] : ['', '', ''];
}

function daysInMonth(y: number, mo: number): number {
  return new Date(y, mo, 0).getDate();
}

/**
 * 组合三段 → ''(全部为空) | 'YYYY-MM-DD' | null(不完整/非法，需继续编辑)
 */
function compose(y: string, mo: string, d: string): string | null {
  if (!y && !mo && !d) return '';
  const yOk = /^\d{4}$/.test(y) && +y >= 1900 && +y <= 2100;
  const moOk = /^(0?[1-9]|1[0-2])$/.test(mo);
  const dOk = /^(0?[1-9]|[12]\d|3[01])$/.test(d);
  if (!yOk || !moOk || !dOk) return null;
  if (+d > daysInMonth(+y, +mo)) return null;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

const SEG_MAX = [4, 2, 2];
const SUFFIX = ['年', '月', '日'];

/**
 * 友好日期输入：年/月/日三个独立数字框（I 形光标、逐段输入自动跳格），
 * 右侧日历按钮打开浏览器原生日期选择器（保留“日历选日期”能力）。
 * 中途输入不完整时失焦自动回退为最近一次有效值。
 */
export default function DateField({
  value,
  onChange,
  ariaLabel,
  className = '',
  defaultDate,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel?: string;
  className?: string;
  /** 参考日期（通常＝新建时点选的那天）：部分段为空时自动补齐 */
  defaultDate?: string;
}) {
  const [segs, setSegs] = useState<[string, string, string]>(() => splitSegs(value));
  // 实时镜像当前三段值：blur/跳格可能在 React 提交前触发，避免用旧闭包回退
  const segsRef = useRef<[string, string, string]>(segs);
  const lastRef = useRef(value);
  const refs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
  const nativeRef = useRef<HTMLInputElement>(null);

  // 外部值变化（如“清除”、从日历选择后）→ 重同步三段
  useEffect(() => {
    if (value === lastRef.current) return;
    lastRef.current = value;
    const s = splitSegs(value);
    segsRef.current = s;
    setSegs(s);
    if (nativeRef.current) nativeRef.current.value = value;
  }, [value]);

  const commit = (v: string) => {
    lastRef.current = v;
    onChange(v);
    if (nativeRef.current) nativeRef.current.value = v;
  };

  const edit = (i: number, raw: string) => {
    const clean = raw.replace(/\D/g, '').slice(0, SEG_MAX[i]);
    const next = [...segsRef.current] as [string, string, string];
    next[i] = clean;
    segsRef.current = next;
    setSegs(next);
    const c = compose(...next);
    if (c !== null) {
      commit(c); // 完整合法立即生效
    } else if (clean.length === SEG_MAX[i] && defaultDate) {
      // 本段刚输满而其它段为空：自动用参考日（所点当天）补齐并提交
      const [dy, dm, dd] = splitSegs(defaultDate);
      const filled: [string, string, string] = [next[0] || dy, next[1] || dm, next[2] || dd];
      const c2 = compose(...filled);
      if (c2 !== null) {
        segsRef.current = filled;
        setSegs(filled);
        commit(c2);
      }
    }
    if (clean.length === SEG_MAX[i] && i < 2) refs[i + 1].current?.focus();
  };

  const nav = (i: number, e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !segs[i] && i > 0) refs[i - 1].current?.focus();
    if (e.key === 'ArrowLeft' && (e.target as HTMLInputElement).selectionStart === 0 && i > 0) {
      e.preventDefault();
      refs[i - 1].current?.focus();
    }
    if (e.key === 'ArrowRight' && (e.target as HTMLInputElement).selectionEnd === segs[i].length && i < 2) {
      e.preventDefault();
      refs[i + 1].current?.focus();
    }
  };

  // 失焦：不完整输入回退为最近有效值；全空提交清空（用 segsRef，避免未提交的旧状态）
  const blur = () => {
    const c = compose(...segsRef.current);
    if (c === null) {
      const prev = splitSegs(lastRef.current);
      segsRef.current = prev;
      setSegs(prev);
    } else {
      commit(c);
    }
  };

  const openNative = () => {
    const el = nativeRef.current;
    if (!el) return;
    try {
      el.showPicker?.();
    } catch {
      el.click();
    }
  };

  return (
    <div className={`datefield${className ? ` ${className}` : ''}`} role="group" aria-label={ariaLabel}>
      {segs.map((v, i) => (
        <span className="df-segbox" key={i}>
          <input
            ref={refs[i]}
            className={`df-seg${i === 0 ? ' y' : i === 1 ? ' m' : ' d'}`}
            value={v}
            inputMode="numeric"
            aria-label={`${ariaLabel ?? '日期'}${SUFFIX[i]}`}
            onFocus={(e) => e.target.select()}
            onChange={(e) => edit(i, e.target.value)}
            onKeyDown={(e) => nav(i, e)}
            onBlur={blur}
          />
          <span className="df-suf">{SUFFIX[i]}</span>
        </span>
      ))}
      <span className="df-cal">
        <button type="button" title="打开日历选择" aria-label={`${ariaLabel ?? ''}（打开日历选择）`} onClick={openNative}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M8 3v4M16 3v4M3 10h18" />
          </svg>
        </button>
        <input ref={nativeRef} type="date" tabIndex={-1} aria-hidden className="df-native" onChange={(e) => {
          const v = e.target.value;
          lastRef.current = v;
          const s = splitSegs(v);
          segsRef.current = s;
          setSegs(s);
          onChange(v);
        }} />
      </span>
    </div>
  );
}
