import { useEffect, useRef, useState } from 'react';
import {
  fetchSettings,
  saveSettings,
  fetchBackup,
  postImport,
  fetchIcs,
  postIcsImport,
  createPairPin,
  fetchDevices,
  removeDevice,
  type PairedDevice,
  type PinResult,
} from '../api';

interface Props {
  onClose: () => void;
  onDone: (msg: string) => void;
  onNotify: (msg: string) => void;
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SettingsModal({ onClose, onDone, onNotify }: Props) {
  const [busy, setBusy] = useState(true);
  const [termStart, setTermStart] = useState('');
  const [termEnd, setTermEnd] = useState('');
  const [weekCount, setWeekCount] = useState('');
  const [err, setErr] = useState('');
  const [ioBusy, setIoBusy] = useState(false);
  const jsonFileRef = useRef<HTMLInputElement>(null);
  const icsFileRef = useRef<HTMLInputElement>(null);
  const [pin, setPin] = useState<PinResult | null>(null);
  const [devices, setDevices] = useState<PairedDevice[]>([]);

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
    loadDevices().catch(() => onNotify('读取配对设备失败'));
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

  const stamp = () => new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '-');

  /* ---------- JSON 导出 / 导入 ---------- */
  const exportJson = async () => {
    setIoBusy(true);
    try {
      const data = await fetchBackup();
      downloadText(`schedbuddy-backup-${stamp()}.json`, JSON.stringify(data, null, 2));
      onNotify('已导出 JSON 数据');
    } catch (e) {
      onNotify('导出失败：' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIoBusy(false);
    }
  };

  const importJson = async (file: File) => {
    let data: any;
    try {
      data = JSON.parse(await file.text());
    } catch {
      onNotify('文件不是有效的 JSON');
      return;
    }
    if (!data || !Array.isArray(data.schedules)) {
      onNotify('JSON 文件缺少 schedules（请使用本应用导出的备份）');
      return;
    }
    setIoBusy(true);
    try {
      const res = await postImport(data);
      const fail = res.failed > 0 ? `，失败 ${res.failed} 条` : '';
      onDone(`JSON 导入完成：${res.ok} 条成功${fail}（设置已同步）`);
    } catch (e) {
      onNotify('导入失败：' + (e instanceof Error ? e.message : String(e)));
      setIoBusy(false);
    }
  };

  /* ---------- iCalendar 导出 / 导入 ---------- */
  const exportIcs = async () => {
    setIoBusy(true);
    try {
      const ics = await fetchIcs();
      downloadText(`schedbuddy-${stamp().slice(0, 10)}.ics`, ics);
      onNotify('已导出 ICS 文件');
    } catch (e) {
      onNotify('导出失败：' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIoBusy(false);
    }
  };

  const importIcs = async (file: File) => {
    let text = '';
    try {
      text = await file.text();
    } catch {
      onNotify('读取文件失败');
      return;
    }
    setIoBusy(true);
    try {
      const res = await postIcsImport(text);
      const bits: string[] = [`成功 ${res.ok} 条`];
      if (res.failed > 0) bits.push(`失败 ${res.failed} 条`);
      if (res.ignored.length) bits.push(`忽略 ${res.ignored.length} 项`);
      onDone(`ICS 导入完成：${bits.join('，')}`);
    } catch (e) {
      onNotify('导入失败：' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIoBusy(false);
    }
  };

  const ioIdle = busy || ioBusy;

  /* ---------- 设备配对（Android App，v0.4） ---------- */
  const loadDevices = async () => {
    setDevices(await fetchDevices());
  };
  const genPin = async () => {
    setIoBusy(true);
    try {
      setPin(await createPairPin());
      onNotify('已生成配对 PIN（10 分钟内有效，单次使用）');
    } catch (e) {
      onNotify('生成 PIN 失败：' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIoBusy(false);
    }
  };
  const revoke = async (deviceId: string, name: string) => {
    if (!window.confirm(`撤销设备「${name}」？其 token 将立即失效。`)) return;
    setIoBusy(true);
    try {
      await removeDevice(deviceId);
      setPin(null);
      await loadDevices();
      onDone('已撤销设备');
    } catch (e) {
      onNotify('撤销失败：' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIoBusy(false);
    }
  };

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

              {/* 数据管理：JSON / ICS 两行，格式标签列等宽居中 */}
              <div className="fld">
                <span className="fld-label">数据管理（日程 + 设置）</span>
                <div className="dl-list">
                  <div className="dl-row">
                    <span className="dl-fmt">JSON 文件</span>
                    <span className="dl-btns">
                      <button type="button" className="mini-btn" onClick={exportJson} disabled={ioIdle}>导出数据</button>
                      <button type="button" className="mini-btn" onClick={() => jsonFileRef.current?.click()} disabled={ioIdle}>从文件导入…</button>
                    </span>
                  </div>
                  <div className="dl-row">
                    <span className="dl-fmt">ICS 文件</span>
                    <span className="dl-btns">
                      <button type="button" className="mini-btn" onClick={exportIcs} disabled={ioIdle}>导出数据</button>
                      <button type="button" className="mini-btn" onClick={() => icsFileRef.current?.click()} disabled={ioIdle}>从文件导入…</button>
                    </span>
                  </div>
                </div>
                <span className="fld-help">
                  JSON 可完整往返（同 id 覆盖）；ICS 兼容 Google/Outlook 日历（浮动时间；不支持子集导入时忽略并报告，见 docs/09）。导入均为合并式。
                </span>
                <input ref={jsonFileRef} type="file" accept=".json,application/json" style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ''; }} />
                <input ref={icsFileRef} type="file" accept=".ics,text/calendar" style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) importIcs(f); e.target.value = ''; }} />
              </div>

              {/* 设备配对（Android App，v0.4）：PIN 一次配对 → App 获得写权 */}
              <div className="fld">
                <span className="fld-label">移动设备配对（Android App）</span>
                <div className="dl-list">
                  <div className="dl-row">
                    <span className="dl-fmt">配对码</span>
                    <span className="dl-btns">
                      <button type="button" className="mini-btn" onClick={genPin} disabled={ioIdle}>
                        {pin ? '重新生成' : '生成配对 PIN'}
                      </button>
                    </span>
                  </div>
                </div>
                {pin && (
                  <div className="pin-box">
                    <span className="pin-digits">{pin.pin}</span>
                    <span className="pin-hint">
                      有效期至{' '}
                      {new Date(pin.expiresAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} · 单次使用
                    </span>
                  </div>
                )}
                {devices.length > 0 && (
                  <div className="dev-list">
                    {devices.map((d) => (
                      <div className="dev-row" key={d.deviceId}>
                        <span className="dev-name">{d.name}</span>
                        <span className="dev-id">{(d.deviceId || '').slice(0, 20)}…</span>
                        <button type="button" className="mini-btn danger" onClick={() => revoke(d.deviceId, d.name)} disabled={ioIdle}>
                          撤销
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <span className="fld-help">
                  在手机 App「主机设置 → 配对」输入上方 PIN 完成配对；配对后 App 获得写入权限（读取保持公开）。
                </span>
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
