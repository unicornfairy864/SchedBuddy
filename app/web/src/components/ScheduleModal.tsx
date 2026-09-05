import { useEffect, useMemo, useRef, useState } from 'react';
import type { Schedule, ScheduleRule, ScheduleType } from '../../../shared/src/types';
import { TYPE_CN, TYPE_DEFAULT_COLOR } from '../../../shared/src/types';
import { hmToMinutes, isValidDateStr, minutesToHM, weekdayCn, weekdayOf, type DateStr } from '../../../shared/src/time';
import { validateSchedule } from '../../../shared/src/validate';
import { detectConflicts, probeWindowFor } from '../../../shared/src/conflict';
import {
  ApiError,
  createSchedule,
  removeSchedule,
  updateSchedule,
  type ScheduleDraft,
  type SummarizedConflict,
} from '../api';
import Dropdown from './Dropdown';
import DateField from './DateField';

/* ---------- 工具 ---------- */

const ROW_BLANK = { start: '08:00', end: '09:00' };

const PALETTE = [
  '#E4574E', '#F5A623', '#3EAF9B', '#4A90E2',
  '#9B7EDE', '#E84E7A', '#2FB98A', '#F7B955',
  '#5B8DEF', '#FF8A5C', '#00B8A9', '#8C9EFF',
];

function randomHex(): string {
  return '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
}

interface RowUi {
  weekday: number; // weekly 用
  start: string; // 'HH:mm'
  end: string;
}

/** 把服务端冲突摘要压缩为展示行（跨日期合并已由汇总器处理） */
function describeConflicts(list: SummarizedConflict[]): string[] {
  return list.map((c) => {
    const who = `${c.a.title} × ${c.b.title}`;
    const when = `${minutesToHM(c.a.startMin)}–${minutesToHM(c.b.endMin)}`;
    const samples = c.dates.slice(0, 2).join('、');
    const more = c.total > c.dates.length ? ` 等 ${c.total} 处` : c.total > 1 ? '（多日）' : '';
    return `${who} · ${when}（${samples}${more}）`;
  });
}

/** 本地预检的冲突汇总（与服务端 /api 的 summarization 口径一致） */
function summarizeConflicts(list: { date: string; a: any; b: any }[]): SummarizedConflict[] {
  const byKey = new Map<string, { c: any; n: number; dates: string[] }>();
  for (const c of list) {
    const key = [c.a.scheduleId, c.b.scheduleId, c.a.startMin, c.a.endMin, c.b.startMin, c.b.endMin].join('|');
    const hit = byKey.get(key);
    if (hit) {
      hit.n++;
      if (hit.dates.length < 3 && !hit.dates.includes(c.date)) hit.dates.push(c.date);
    } else {
      byKey.set(key, { c, n: 1, dates: [c.date] });
    }
  }
  return [...byKey.values()].map(({ c, n, dates }) => ({
    date: dates[0],
    dates,
    total: n,
    a: c.a,
    b: c.b,
  }));
}

/* ---------- 表单状态 ---------- */

type Kind = 'weekly' | 'interval' | 'once';
type OddEven = 'none' | 'odd' | 'even';

interface FormState {
  title: string;
  notes: string;
  type: ScheduleType;
  color: string;
  kind: Kind;
  weekly: { oddEven: OddEven; weekStart: string; rows: RowUi[] };
  interval: { startDate: string; everyNDays: number; rows: RowUi[] };
  once: { date: string; rows: RowUi[] };
  activeFrom: string;
  activeTo: string;
}

export interface SlotPrefill {
  date: DateStr;
  startMin: number;
  endMin: number;
}

function ruleRows(rule: ScheduleRule): { kind: Kind; weekly?: any; interval?: any; once?: any } {
  if (rule.kind === 'weekly') {
    return {
      kind: 'weekly',
      weekly: {
        oddEven: rule.oddEven ?? 'none',
        weekStart: rule.weekStart ?? '',
        rows: rule.segments.map((s) => ({ weekday: s.weekday, start: minutesToHM(s.startMin), end: minutesToHM(s.endMin) })),
      },
    };
  }
  if (rule.kind === 'interval') {
    return {
      kind: 'interval',
      interval: {
        startDate: rule.startDate ?? '',
        everyNDays: rule.everyNDays,
        rows: rule.times.map((t) => ({ weekday: 1, start: minutesToHM(t.startMin), end: minutesToHM(t.endMin) })),
      },
    };
  }
  return {
    kind: 'once',
    once: {
      date: rule.date ?? '',
      rows: rule.times.map((t) => ({ weekday: 1, start: minutesToHM(t.startMin), end: minutesToHM(t.endMin) })),
    },
  };
}

function initForm(initial: { schedule: Schedule | null; prefill: SlotPrefill | null }): FormState {
  const s = initial.schedule;
  if (s) {
    const r = ruleRows(s.rule);
    return {
      title: s.title,
      notes: s.notes,
      type: s.type,
      color: s.color,
      kind: r.kind,
      weekly: r.weekly ?? { oddEven: 'none', weekStart: '', rows: [{ weekday: 1, ...ROW_BLANK }] },
      interval: r.interval ?? { startDate: '', everyNDays: 2, rows: [{ weekday: 1, ...ROW_BLANK }] },
      once: r.once ?? { date: '', rows: [{ weekday: 1, ...ROW_BLANK }] },
      activeFrom: s.activeFrom ?? '',
      activeTo: s.activeTo ?? '',
    };
  }
  const p = initial.prefill;
  const wd = p ? weekdayOf(p.date) : 1;
  const st = minutesToHM(p?.startMin ?? 8 * 60);
  const en = minutesToHM(p?.endMin ?? 9 * 60);
  return {
    title: '',
    notes: '',
    type: 'specific',
    color: TYPE_DEFAULT_COLOR.specific,
    kind: 'weekly',
    weekly: { oddEven: 'none', weekStart: '', rows: [{ weekday: wd, start: st, end: en }] },
    interval: { startDate: p?.date ?? '', everyNDays: 2, rows: [{ weekday: 1, ...ROW_BLANK }] },
    once: { date: p?.date ?? '', rows: [{ weekday: 1, start: st, end: en }] },
    activeFrom: '',
    activeTo: '',
  };
}

/* ---------- 组件 ---------- */

interface Props {
  mode: 'create' | 'edit';
  initial: { schedule: Schedule | null; prefill: SlotPrefill | null };
  schedules: Schedule[];
  termStart: string | null;
  onClose: () => void;
  /** 保存/删除成功后回调：msg 为 Snackbar 文案；removedId 传被删日程 id（用于退场动画后刷新） */
  onDone: (msg: string, removedId?: string) => void;
  onNotify: (msg: string) => void; // 轻提示
}

export default function ScheduleModal({ mode, initial, schedules, termStart, onClose, onDone, onNotify }: Props) {
  const [f, setF] = useState<FormState>(() => initForm(initial));
  const [busy, setBusy] = useState(false);
  const [issueRows, setIssueRows] = useState<string[]>([]);
  const [forceChk, setForceChk] = useState(false);
  const [warnArmed, setWarnArmed] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [serverIssues, setServerIssues] = useState<string[]>([]);

  const editing = initial.schedule;
  const set = (patch: Partial<FormState>) => setF((prev) => ({ ...prev, ...patch }));
  const setKind = (kind: Kind) => set({ kind });

  const patchWeekly = (p: Partial<FormState['weekly']>) => setF((prev) => ({ ...prev, weekly: { ...prev.weekly, ...p } }));
  const patchInterval = (p: Partial<FormState['interval']>) => setF((prev) => ({ ...prev, interval: { ...prev.interval, ...p } }));
  const patchOnce = (p: Partial<FormState['once']>) => setF((prev) => ({ ...prev, once: { ...prev.once, ...p } }));

  // Esc 关闭（自定义下拉展开中时交给下拉自身收起，不关闭弹窗）
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy && !(e.target as Element | null)?.closest?.('.dd')) onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [busy, onClose]);

  useEffect(() => {
    setIssueRows([]);
    setServerIssues([]);
    setWarnArmed(false);
  }, [f.title, f.notes, f.type, f.color, f.kind, f.activeFrom, f.activeTo, f.weekly, f.interval, f.once]);

  /* ----- 构建候选（供校验与冲突预检） ----- */
  const buildDraft = useMemo((): { draft: ScheduleDraft; rowIssues: string[] } => {
    const rowIssues: string[] = [];
    const rowsOk: { startMin: number; endMin: number }[] = [];

    const collect = (rows: RowUi[], label: string, withWeekday: boolean) => {
      const out: { startMin: number; endMin: number; weekday?: number }[] = [];
      rows.forEach((r, i) => {
        const empty = r.start === '' && r.end === '';
        if (empty) return;
        const s = hmToMinutes(r.start);
        const e = hmToMinutes(r.end);
        if (s == null || e == null) {
          rowIssues.push(`第 ${i + 1} 条时段时间格式应为 HH:mm`);
          return;
        }
        if (s >= e) rowIssues.push(`第 ${i + 1} 条时段结束须晚于开始`);
        if (withWeekday && (r.weekday < 1 || r.weekday > 7)) rowIssues.push(`第 ${i + 1} 条星期无效`);
        out.push({ startMin: s, endMin: e, weekday: r.weekday });
      });
      return out;
    };

    let rule: ScheduleRule;
    if (f.kind === 'weekly') {
      const segs = collect(f.weekly.rows, '时段', true);
      rule = {
        kind: 'weekly',
        weekStart: f.weekly.oddEven === 'none' ? null : (f.weekly.weekStart || termStart || null),
        oddEven: f.weekly.oddEven,
        segments: segs.map((s) => ({ weekday: s.weekday!, startMin: s.startMin, endMin: s.endMin })),
      };
      if (f.weekly.oddEven !== 'none' && !rule.weekStart) {
        rowIssues.push('使用单/双周需填写「第 1 周周一」或先在学校设置填写学期起点');
      }
    } else if (f.kind === 'interval') {
      const times = collect(f.interval.rows, '时段', false);
      rule = {
        kind: 'interval',
        startDate: f.interval.startDate || '',
        everyNDays: f.interval.everyNDays,
        times,
      };
      if (!isValidDateStr(f.interval.startDate)) rowIssues.push('起始日期无效');
      if (!Number.isInteger(f.interval.everyNDays) || f.interval.everyNDays < 1) rowIssues.push('间隔天数须为正整数');
    } else {
      const times = collect(f.once.rows, '时段', false);
      rule = {
        kind: 'once',
        date: f.once.date || '',
        times,
      };
      if (!isValidDateStr(f.once.date)) rowIssues.push('日期无效');
    }

    const activeFrom = f.activeFrom === '' ? null : f.activeFrom;
    const activeTo = f.activeTo === '' ? null : f.activeTo;
    const draft: ScheduleDraft = {
      title: f.title.trim(),
      notes: f.notes,
      type: f.type,
      color: f.color,
      rule,
      activeFrom: isValidDateStr(f.activeFrom) ? f.activeFrom : null,
      activeTo: isValidDateStr(f.activeTo) ? f.activeTo : null,
      overrides: editing?.overrides ?? [],
    };
    return { draft, rowIssues };
  }, [f, termStart, editing]);

  /* ----- 校验 + 本地冲突预检 ----- */
  const { issues, conflicts } = useMemo(() => {
    const { draft, rowIssues } = buildDraft;
    const vi = validateSchedule(draft as Partial<Schedule>);
    const candidate = { ...draft, id: editing?.id ?? '__new__', createdAt: '', updatedAt: '', rev: 0, deletedAt: null, lastWriter: '' } as Schedule;
    const [from, to] = probeWindowFor({ activeFrom: draft.activeFrom, activeTo: draft.activeTo });
    const det = detectConflicts(schedules, candidate, { from, to, termStart, holidays: null });
    return {
      issues: [...vi, ...rowIssues],
      conflicts: { errors: summarizeConflicts(det.errors), warnings: summarizeConflicts(det.warnings) },
    };
  }, [buildDraft, schedules, termStart, editing]);

  const errRows = issues;
  const hard = conflicts.errors;
  const soft = conflicts.warnings;
  const status: 'error' | 'warn' | 'clean' = hard.length ? 'error' : soft.length ? 'warn' : 'clean';

  const canSave = errRows.length === 0 && (status !== 'error' || forceChk) && (status !== 'warn' || warnArmed) && (serverIssues.length === 0 || forceChk) && !busy;

  /* ----- 保存 ----- */
  const save = async () => {
    const { draft } = buildDraft;
    setBusy(true);
    try {
      const needForce = forceChk && (status === 'error' || serverIssues.length > 0);
      const payload: ScheduleDraft = { ...draft, force: needForce };
      const res = editing ? await updateSchedule(editing.id, payload) : await createSchedule(payload);
      const warns = res.conflicts.warnings.length;
      onDone(warns ? `已保存（存在 ${warns} 处冲突警告）` : '已保存');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const ce = e.body?.conflicts?.errors ?? [];
        setIssueRows([]);
        setServerIssues(describeConflicts(ce));
      } else if (e instanceof ApiError && e.status === 400) {
        setServerIssues((e.body?.issues ?? []).map(String));
      } else {
        onNotify('保存失败：' + (e instanceof Error ? e.message : String(e)));
      }
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await removeSchedule(editing.id);
      onDone('已删除', editing.id);
    } catch (e) {
      onNotify('删除失败：' + (e instanceof Error ? e.message : String(e)));
      setConfirmDel(false);
    } finally {
      setBusy(false);
    }
  };

  /* ----- 行编辑 ----- */
  const rowProps = (kind: Kind) => (kind === 'weekly' ? f.weekly.rows : kind === 'interval' ? f.interval.rows : f.once.rows);
  const rowPatch = (kind: Kind, rows: RowUi[]) =>
    kind === 'weekly' ? patchWeekly({ rows }) : kind === 'interval' ? patchInterval({ rows }) : patchOnce({ rows });

  const updRow = (i: number, patch: Partial<RowUi>) => {
    const kind = f.kind;
    const rows = rowProps(kind).map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    rowPatch(kind, rows);
  };
  const addRow = () => {
    const kind = f.kind;
    const blank: RowUi = kind === 'weekly' ? { weekday: 1, ...ROW_BLANK } : { weekday: 1, ...ROW_BLANK };
    rowPatch(kind, [...rowProps(kind), blank]);
  };
  const removeRow = (i: number) => {
    const kind = f.kind;
    const rows = rowProps(kind).filter((_, idx) => idx !== i);
    rowPatch(kind, rows.length ? rows : [{ weekday: 1, ...ROW_BLANK }]);
  };

  /* ----- 单双周切换辅助 ----- */
  const toOdd = (v: OddEven) => {
    const weekStart = f.weekly.weekStart || termStart || '';
    patchWeekly({ oddEven: v, weekStart: v === 'none' ? '' : weekStart });
  };

  const autoFocusRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    autoFocusRef.current?.focus();
  }, []);

  const paletteDup = [...new Set([f.color, ...PALETTE, ...Object.values(TYPE_DEFAULT_COLOR)])];

  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={mode === 'create' ? '新建日程' : '编辑日程'}>
        <header className="modal-head">
          <h2>{mode === 'create' ? '新建日程' : '编辑日程'}</h2>
          <button className="icon-btn ghost x" onClick={onClose} disabled={busy} aria-label="关闭">✕</button>
        </header>

        <div className="modal-body">
          {/* 名称 */}
          <label className="fld">
            <span className="fld-label">名称 <i>*</i></span>
            <input ref={autoFocusRef} value={f.title} maxLength={60} placeholder="如：ACM 集训队例会"
              onChange={(e) => set({ title: e.target.value })} />
          </label>

          {/* 类型 */}
          <div className="fld">
            <span className="fld-label">类型</span>
            <div className="type-pills">
              {(Object.keys(TYPE_CN) as ScheduleType[]).map((t) => (
                <button key={t} type="button"
                  className={`type-pill t-${t}${f.type === t ? ' on' : ''}`}
                  onClick={() => { set({ type: t }); if (f.color === TYPE_DEFAULT_COLOR[f.type]) set({ color: TYPE_DEFAULT_COLOR[t] }); }}>
                  <i style={{ background: TYPE_DEFAULT_COLOR[t] }} />
                  {TYPE_CN[t]}
                </button>
              ))}
            </div>
          </div>

          {/* 颜色 */}
          <div className="fld">
            <span className="fld-label">颜色</span>
            <div className="color-row">
              <div className="swatches">
                {paletteDup.map((c) => (
                  <button key={c} type="button" title={c}
                    className={`swatch${f.color.toLowerCase() === c.toLowerCase() ? ' on' : ''}`}
                    style={{ background: c }} onClick={() => set({ color: c })} aria-label={`选色 ${c}`} />
                ))}
              </div>
              <label className="hex-box">
                <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(f.color) ? f.color : '#4A90E2'}
                  onChange={(e) => set({ color: e.target.value })} aria-label="取色器" />
                <input className="hex-txt" value={f.color} maxLength={7}
                  onChange={(e) => set({ color: e.target.value })} aria-label="十六进制颜色" />
              </label>
              <button type="button" className="mini-btn" onClick={() => set({ color: randomHex() })}>随机</button>
            </div>
            {!/^#[0-9a-fA-F]{6}$/.test(f.color) && <div className="fld-err">颜色须为 #RRGGBB</div>}
          </div>

          {/* 规则类型 */}
          <div className="fld">
            <span className="fld-label">重复规则</span>
            <div className="seg small">
              <button type="button" className={f.kind === 'weekly' ? 'on' : ''} onClick={() => setKind('weekly')}>固定星期</button>
              <button type="button" className={f.kind === 'interval' ? 'on' : ''} onClick={() => setKind('interval')}>隔 N 天</button>
              <button type="button" className={f.kind === 'once' ? 'on' : ''} onClick={() => setKind('once')}>一次性</button>
            </div>
          </div>

          {/* 规则明细 */}
          {f.kind === 'weekly' && (
            <>
              <div className="rule-sub">
                <div className="fld inline">
                  <span className="fld-label">单双周</span>
                  <Dropdown
                    value={f.weekly.oddEven}
                    ariaLabel="单双周"
                    options={[
                      { value: 'none', label: '每周都有' },
                      { value: 'odd', label: '仅单周' },
                      { value: 'even', label: '仅双周' },
                    ]}
                    onChange={(v) => toOdd(v as OddEven)}
                  />
                </div>
                {f.weekly.oddEven !== 'none' && (
                  <label className="fld inline">
                    <span className="fld-label">第 1 周周一</span>
                    <DateField value={f.weekly.weekStart} ariaLabel="第 1 周周一"
                      onChange={(v) => patchWeekly({ weekStart: v })} />
                  </label>
                )}
              </div>
            </>
          )}
          {f.kind === 'interval' && (
            <div className="rule-sub">
              <label className="fld inline">
                <span className="fld-label">起始日期</span>
                <DateField value={f.interval.startDate} ariaLabel="起始日期"
                  onChange={(v) => patchInterval({ startDate: v })} />
              </label>
              <label className="fld inline">
                <span className="fld-label">每</span>
                <input className="num" type="number" min={1} max={60} value={f.interval.everyNDays}
                  onChange={(e) => patchInterval({ everyNDays: Number(e.target.value) })} />
                <span className="fld-suffix">天一次</span>
              </label>
            </div>
          )}
          {f.kind === 'once' && (
            <div className="rule-sub">
              <label className="fld inline">
                <span className="fld-label">日期</span>
                <DateField value={f.once.date} ariaLabel="日期"
                  onChange={(v) => patchOnce({ date: v })} />
              </label>
            </div>
          )}

          {/* 时段列表 */}
          <div className="fld">
            <span className="fld-label">时段（可多条）</span>
            <div className="seg-list">
              {rowProps(f.kind).map((r, i) => (
                <div className="seg-row" key={i}>
                  {f.kind === 'weekly' ? (
                    <select value={r.weekday} onChange={(e) => updRow(i, { weekday: Number(e.target.value) })}>
                      {Array.from({ length: 7 }, (_, k) => k + 1).map((d) => (
                        <option key={d} value={d}>{weekdayCn(d)}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="seg-row-spacer" />
                  )}
                  <input className="time" type="time" step="60" value={r.start} onChange={(e) => updRow(i, { start: e.target.value })} aria-label={`第${i + 1}条开始`} />
                  <i className="dash">–</i>
                  <input className="time" type="time" step="60" value={r.end} onChange={(e) => updRow(i, { end: e.target.value })} aria-label={`第${i + 1}条结束`} />
                  <button type="button" className="icon-btn ghost rm" onClick={() => removeRow(i)} disabled={rowProps(f.kind).length <= 1} aria-label="删除该时段">✕</button>
                </div>
              ))}
            </div>
            <button type="button" className="mini-btn add" onClick={addRow}>＋ 添加时段</button>
          </div>

          {/* 生效范围 */}
          <div className="rule-sub">
            <span className="fld-label">生效范围（可选）</span>
            <div className="range-pair">
              <DateField value={f.activeFrom} ariaLabel="生效起始"
                onChange={(v) => set({ activeFrom: v })} />
              <i className="dash">至</i>
              <DateField value={f.activeTo} ariaLabel="生效结束"
                onChange={(v) => set({ activeTo: v })} />
              {(f.activeFrom || f.activeTo) && (
                <button type="button" className="mini-btn" onClick={() => set({ activeFrom: '', activeTo: '' })}>清除</button>
              )}
            </div>
            {f.activeFrom && f.activeTo && f.activeFrom > f.activeTo && <div className="fld-err">起止颠倒</div>}
          </div>

          {/* 备注 */}
          <label className="fld">
            <span className="fld-label">备注</span>
            <textarea rows={2} value={f.notes} placeholder="地点 / 提醒 / 携带物品…"
              onChange={(e) => set({ notes: e.target.value })} />
          </label>

          {editing && editing.overrides.length > 0 && (
            <div className="override-note">此日程含 {editing.overrides.length} 条单次例外（跳过/改期/改时），编辑保存后保留。</div>
          )}

          {/* 校验问题 */}
          {errRows.length > 0 && (
            <div className="cf-box err">
              {errRows.map((s, i) => <div key={i}>⚠ {s}</div>)}
            </div>
          )}

          {/* 硬冲突（errors） */}
          {status === 'error' && (
            <div className="cf-box err hard">
              <div className="cf-title">存在硬冲突（固定×固定或自身重叠），默认不允许保存：</div>
              {describeConflicts(hard).map((s, i) => <div key={i}>{s}</div>)}
              <label className="force-chk">
                <input type="checkbox" checked={forceChk} onChange={(e) => setForceChk(e.target.checked)} />
                强制保存（会与既有日程重叠）
              </label>
            </div>
          )}

          {/* 警告（warnings） */}
          {status === 'warn' && (
            <div className="cf-box warn">
              <div className="cf-title">以下重叠为警告（如可翘的水课与主课），可决定是否仍要保存：</div>
              {describeConflicts(soft).map((s, i) => <div key={i}>{s}</div>)}
              {!warnArmed ? (
                <button type="button" className="mini-btn warn-btn" onClick={() => setWarnArmed(true)}>仍要保存</button>
              ) : (
                <div className="cf-armed">已确认「仍要保存」，点下方保存完成</div>
              )}
            </div>
          )}

          {/* 服务端驳回（409 摘要） */}
          {serverIssues.length > 0 && (
            <div className="cf-box err hard">
              <div className="cf-title">服务端判定存在硬冲突：</div>
              {serverIssues.map((s, i) => <div key={i}>{s}</div>)}
              {status !== 'error' && (
                <label className="force-chk">
                  <input type="checkbox" checked={forceChk} onChange={(e) => setForceChk(e.target.checked)} />
                  强制保存（重试）
                </label>
              )}
            </div>
          )}
        </div>

        <footer className="modal-foot">
          {mode === 'edit' && !confirmDel ? (
            <button type="button" className="btn danger" onClick={() => setConfirmDel(true)} disabled={busy}>删除</button>
          ) : mode === 'edit' ? (
            <span className="confirm-del">
              <button type="button" className="btn danger solid" onClick={del} disabled={busy}>确认删除</button>
              <button type="button" className="mini-btn" onClick={() => setConfirmDel(false)} disabled={busy}>取消</button>
            </span>
          ) : <span />}
          <span className="foot-actions">
            <button type="button" className="btn" onClick={onClose} disabled={busy}>取消</button>
            <button type="button" className="btn primary" onClick={save} disabled={!canSave}>
              {busy ? '处理中…' : mode === 'create' ? '创建' : '保存'}
            </button>
          </span>
        </footer>
      </div>
    </div>
  );
}
