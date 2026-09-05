import { useEffect, useRef, useState } from 'react';
import { fetchSettings, saveSettings } from '../api';

interface Props {
  onClose: () => void;
  onDone: (msg: string) => void;
  onNotify: (msg: string) => void;
}

export default function SettingsModal({ onClose, onDone, onNotify }: Props) {
  const [busy, setBusy] = useState(true);
  const [termStart, setTermStart] = useState('');
  const [termEnd, setTermEnd] = useState('');
  const [weekCount, setWeekCount] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    fetchSettings()
      .then((s) => {
        setTermStart((s.termStart as string) ?? '');
        setTermEnd((s.termEnd as string) ?? '');
        const w = s.weekCount;
        setWeekCount(w == null ? '' : String(w));
      })
      .catch(() => onNotify('读取设置失败'))
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [busy, onClose]);

  const weekNoRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!busy) weekNoRef.current?.focus();
  }, [busy]);

  const save = async () => {
    const n = weekCount === '' ? null : Number(weekCount);
    if (weekCount !== '' && (!Number.isInteger(n) || (n as number) < 1)) {
      setErr('周数须为正整数');
      return;
    }
    if (termStart && termEnd && termStart > termEnd) {
      setErr('学期结束早于开始');
      return;
    }
    setErr('');
    setBusy(true);
    try {
      await saveSettings({
        termStart: termStart === '' ? null : termStart,
        termEnd: termEnd === '' ? null : termEnd,
        weekCount: n,
      });
      onDone('已保存设置');
    } catch (e) {
      onNotify('保存设置失败：' + (e instanceof Error ? e.message : String(e)));
      setBusy(false);
    }
  };

  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal narrow" role="dialog" aria-modal="true" aria-label="设置">
        <header className="modal-head">
          <h2>设置</h2>
          <button className="icon-btn ghost x" onClick={onClose} disabled={busy} aria-label="关闭">✕</button>
        </header>
        <div className="modal-body">
          {busy ? (
            <div className="fld-empty">读取中…</div>
          ) : (
            <>
              <div className="fld-help">学期起点用于「单双周」判定与顶部「第 N 周」显示。</div>
              <label className="fld">
                <span className="fld-label">第 1 周周一（学期起点）</span>
                <input ref={weekNoRef} type="date" value={termStart} onChange={(e) => setTermStart(e.target.value)} />
              </label>
              <label className="fld">
                <span className="fld-label">学期结束日（可选）</span>
                <input type="date" value={termEnd} onChange={(e) => setTermEnd(e.target.value)} />
              </label>
              <label className="fld">
                <span className="fld-label">学期周数（可选）</span>
                <input className="num" type="number" min={1} max={60} value={weekCount}
                  onChange={(e) => setWeekCount(e.target.value)} placeholder="如 16" />
              </label>
              {err && <div className="cf-box err">⚠ {err}</div>}
            </>
          )}
        </div>
        <footer className="modal-foot">
          <span />
          <span className="foot-actions">
            <button type="button" className="btn" onClick={onClose} disabled={busy}>取消</button>
            <button type="button" className="btn primary" onClick={save} disabled={busy}>
              {busy ? '处理中…' : '保存'}
            </button>
          </span>
        </footer>
      </div>
    </div>
  );
}
