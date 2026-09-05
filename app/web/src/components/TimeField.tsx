import { useEffect, useRef, useState } from 'react';
import type { FocusEvent as ReactFocusEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';

/** 拆 'HH:MM' → [时, 分]（空串 → 双空） */
function splitSegs(v: string): [string, string] {
  const m = /^(\d{2}):(\d{2})$/.exec(v ?? '');
  return m ? [m[1], m[2]] : ['', ''];
}

/** 组合 → ''(全空) | 'HH:MM' | null(不完整/非法) */
function compose(hRaw: string, mRaw: string): string | null {
  if (!hRaw && !mRaw) return '';
  const h = hRaw.length === 1 ? `0${hRaw}` : hRaw;
  const m = mRaw.length === 1 ? `0${mRaw}` : mRaw;
  if (!/^([01]\d|2[0-3])$/.test(h)) return null;
  if (!/^[0-5]\d$/.test(m)) return null;
  return `${h}:${m}`;
}

const MAX = [2, 2];
const LABEL = ['时', '分'];

/**
 * 友好时间输入：时 / 分 两个独立数字框（I 形光标），
 * 仿 DateField：输满自动跳格、键入即时校验、组内跳格不清空、失焦补齐/回退。
 * onDone：分 输满后回调（用于跨控件联动，如 开始分 → 结束时的跳格）。
 */
export default function TimeField({
  value,
  onChange,
  ariaLabel,
  onDone,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel?: string;
  onDone?: () => void;
  className?: string;
}) {
  const [segs, setSegs] = useState<[string, string]>(() => splitSegs(value));
  const segsRef = useRef<[string, string]>(segs);
  const lastRef = useRef(value);
  const rootRef = useRef<HTMLDivElement>(null);
  const refs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  // 外部值变化 → 重同步
  useEffect(() => {
    if (value === lastRef.current) return;
    lastRef.current = value;
    const s = splitSegs(value);
    segsRef.current = s;
    setSegs(s);
  }, [value]);

  const commit = (v: string) => {
    lastRef.current = v;
    onChange(v);
  };

  const edit = (i: number, raw: string) => {
    const clean = raw.replace(/\D/g, '').slice(0, MAX[i]);
    const next = [...segsRef.current] as [string, string];
    next[i] = clean;
    segsRef.current = next;
    setSegs(next);
    const c = compose(...next);
    if (c !== null) commit(c); // 完整合法立即生效
    if (clean.length === MAX[i] && i === 0) {
      refs[1].current?.focus(); // 时 满 → 分
    }
    if (clean.length === MAX[i] && i === 1) onDone?.(); // 分 满 → 外部联动
  };

  const nav = (i: number, e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !segsRef.current[i] && i > 0) refs[i - 1].current?.focus();
    if (e.key === 'ArrowLeft' && (e.target as HTMLInputElement).selectionStart === 0 && i > 0) {
      e.preventDefault();
      refs[i - 1].current?.focus();
    }
    if (e.key === 'ArrowRight' && (e.target as HTMLInputElement).selectionEnd === segs[i].length && i < 1) {
      e.preventDefault();
      refs[i + 1].current?.focus();
    }
  };

  // 真正离开时间组：合法提交；不完整回退最近有效值；全空清空
  const finish = () => {
    const c = compose(...segsRef.current);
    if (c !== null) {
      commit(c);
      return;
    }
    const prev = splitSegs(lastRef.current);
    segsRef.current = prev;
    setSegs(prev);
  };
  const onWrapBlur = (e: ReactFocusEvent<HTMLDivElement>) => {
    const rt = e.relatedTarget as Node | null;
    if (rt && rootRef.current?.contains(rt)) return;
    finish();
  };

  return (
    <div
      className={`timefield${className ? ` ${className}` : ''}`}
      role="group"
      aria-label={ariaLabel}
      ref={rootRef}
      onBlur={onWrapBlur}
    >
      <input
        ref={refs[0]}
        className="tf-seg h"
        value={segs[0]}
        inputMode="numeric"
        aria-label={`${ariaLabel ?? '时间'}${LABEL[0]}`}
        onFocus={(e) => e.target.select()}
        onChange={(e) => edit(0, e.target.value)}
        onKeyDown={(e) => nav(0, e)}
      />
      <span className="tf-colon" aria-hidden>:</span>
      <input
        ref={refs[1]}
        className="tf-seg mi"
        value={segs[1]}
        inputMode="numeric"
        aria-label={`${ariaLabel ?? '时间'}${LABEL[1]}`}
        onFocus={(e) => e.target.select()}
        onChange={(e) => edit(1, e.target.value)}
        onKeyDown={(e) => nav(1, e)}
      />
    </div>
  );
}
