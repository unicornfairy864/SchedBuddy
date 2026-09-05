import { useEffect, useRef, useState } from 'react';
import { fetchSettings, saveSettings, fetchBackup, postImport } from '../api';

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
  const [ioBusy, setIoBusy] = useState(false); // 导出/导入进行中
  const fileRef = useRef<HTMLInputElement>(null);

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
      if (e.key === 'Escape' && !busy && !ioBusy) onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [busy, ioBusy, onClose]);

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

  // 导出全部数据为 JSON 文件下载
  const doExport = async () => {
    setIoBusy(true);
    try {
      const data = await fetchBackup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '-');
      a.href = url;
      a.download = `schedbuddy-backup-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      onNotify('已导出全部数据（文件）');
    } catch (e) {
      onNotify('导出失败：' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIoBusy(false);
    }
  };

  const doImport = async (file: File) => {
    let data: any;
    try {
      data = JSON.parse(await file.text());
    } catch {
      onNotify('文件不是有效的 JSON');
      return;
    }
    if (!data || !Array.isArray(data.schedules)) {
      onNotify('文件缺少 schedules（请使用本应用导出的备份）');
      return;
    }
    setIoBusy(true);
    try {
      const res = await postImport(data);
      const failedNote = res.failed > 0 ? `，失败 ${res.failed} 条` : '';
      onDone(`导入完成：${res.ok} 条成功${failedNote}（设置已同步）`);
    } catch (e) {
      onNotify('导入失败：' + (e instanceof Error ? e.message : String(e)));
      setIoBusy(false);
    }
  };

  const ioIdle = busy || ioBusy;

  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && !ioIdle && onClose()}>
      <div className="modal narrow" role="dialog" aria-modal="true" aria-label="设置">
        <header className="modal-head">
          <h2>设置</h2>
          <button className="icon-btn ghost x" onClick={onClose} disabled={ioIdle} aria-label="关闭">✕</button>
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

              {/* 全应用数据：导出 / 导入 */}
              <div className="fld">
                <span className="fld-label">数据管理（全应用：日程 + 设置）</span>
                <div className="range-pair">
                  <button type="button" className="mini-btn" onClick={doExport} disabled={ioIdle}>
                    {ioBusy ? '处理中…' : '导出全部数据（文件）'}
                  </button>
                  <button type="button" className="mini-btn" onClick={() => fileRef.current?.click()} disabled={ioIdle}>
                    从文件导入…
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/json,.json"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) doImport(f);
                      e.target.value = '';
                    }}
                  />
                </div>
                <span className="fld-help">导入为合并：同 id 覆盖、其余保留；不会删除当前未在文件中的日程。建议先导出再导入。</span>
              </div>
            </>
          )}
        </div>
        <footer className="modal-foot">
          <span />
          <span className="foot-actions">
            <button type="button" className="btn" onClick={onClose} disabled={ioIdle}>取消</button>
            <button type="button" className="btn primary" onClick={save} disabled={ioIdle}>
              {busy || ioBusy ? '处理中…' : '保存'}
            </button>
          </span>
        </footer>
      </div>
    </div>
  );
}
