import { Router, type Request, type Response } from 'express';
import { networkInterfaces } from 'node:os';
import { expandAll } from '../../shared/src/expand';
import { detectConflicts, probeWindowFor } from '../../shared/src/conflict';
import { validateSchedule } from '../../shared/src/validate';
import { addDays, todayStr } from '../../shared/src/time';
import { scheduleToIcs } from '../../shared/src/ics/encode';
import { parseIcs, eventsToSchedules } from '../../shared/src/ics/parse';
import type { Occurrence, Schedule } from '../../shared/src/types';
import {
  deleteDevice,
  findDeviceByToken,
  getSchedule,
  getSettings,
  insertDevice,
  insertSchedule,
  listDevices,
  listSchedules,
  newId,
  setSettings,
  softDeleteSchedule,
  touchDevice,
  updateSchedule,
  type Store,
} from './db';
import { consumePin, createPin, newDeviceToken } from './pairing';

declare const __VERSION__: string;

export function makeApi(store: Store) {
  const r = Router();

  const isLoopback = (req: Request): boolean => {
    const addr = String(req.socket.remoteAddress || '');
    const clean = addr.startsWith('::ffff:') ? addr.slice(7) : addr;
    return clean === '127.0.0.1' || clean === '::1' || clean === 'localhost';
  };

  /**
   * 写权限判定（v0.4 起）：回环地址（桌面主机）或 携带有效设备 token（已 PIN 配对的 App）。
   * 未配对 LAN 客户端（含手机浏览器）→ 403 只读；带无效 token → 401。
   */
  const bearerToken = (req: Request): string | null => {
    const h = req.headers.authorization;
    if (!h) return null;
    const m = /^Bearer\s+(.+)$/i.exec(h);
    return m ? m[1].trim() : '';
  };

  type Writer =
    | { kind: 'loopback' }
    | { kind: 'device'; deviceId: string }
    | { kind: 'unauthorized' }
    | { kind: 'none' };

  const writerOf = (req: Request): Writer => {
    if (isLoopback(req)) return { kind: 'loopback' };
    const tok = bearerToken(req);
    if (tok == null) return { kind: 'none' };
    const dev = tok ? findDeviceByToken(store, tok) : null;
    if (!dev) return { kind: 'unauthorized' };
    touchDevice(store, dev.deviceId);
    return { kind: 'device', deviceId: dev.deviceId };
  };

  const writeGuard = (req: Request, res: Response, next: () => void) => {
    const w = writerOf(req);
    if (w.kind === 'loopback') {
      res.locals.writer = 'pc';
      return next();
    }
    if (w.kind === 'device') {
      res.locals.writer = w.deviceId;
      return next();
    }
    if (w.kind === 'unauthorized') {
      res.status(401).json({ error: 'unauthorized', message: '设备 token 无效或已被撤销' });
      return;
    }
    res.status(403).json({ error: 'readonly', message: '仅桌面主机或已配对设备可写；局域网客户端为只读。' });
  };

  /** 仅桌面主机（回环）可用（生成 PIN / 管理设备） */
  const loopbackOnly = (req: Request, res: Response, next: () => void) => {
    if (!isLoopback(req)) {
      res.status(403).json({ error: 'readonly', message: '仅桌面主机（本机）可执行此操作。' });
      return;
    }
    res.locals.writer = 'pc';
    next();
  };

  const writer = (res: Response): string => res.locals.writer ?? 'pc';

  const settings = () => getSettings(store);

  /** 局域网 IPv4（供页脚展示"其他设备访问地址"）。
   *  注意：必须跳过虚拟网卡（Radmin/VMware/VMnet/vEthernet/WSL 等），否则可能显示 VPN 虚拟地址（如 26.250.x）。 */
  const lanIp = (): string | null => {
    const ifaces = networkInterfaces();
    const isVirtualName = (name: string): boolean =>
      /radmin|vmnet|vmware|virtual|vethernet|wsl|tap-|tun|zerotier|tailscale/i.test(name);
    for (const [name, addrs] of Object.entries(ifaces)) {
      if (isVirtualName(name)) continue;
      for (const a of addrs ?? []) {
        if (a.family === 'IPv4' && !a.internal) return a.address;
      }
    }
    // 兜底：实在没有物理网卡时退回任意非回环 IPv4
    for (const addrs of Object.values(ifaces)) {
      for (const a of addrs ?? []) {
        if (a.family === 'IPv4' && !a.internal) return a.address;
      }
    }
    return null;
  };

  r.get('/meta', (_req, res) => {
    const s = settings();
    const ip = lanIp();
    res.json({
      version: typeof __VERSION__ !== 'undefined' ? __VERSION__ : '0.0.0-dev',
      readOnly: !isLoopback(_req),
      port: Number(process.env.SCHEDBUDDY_PORT || 3876),
      lan: ip ? `http://${ip}:${Number(process.env.SCHEDBUDDY_PORT || 3876)}` : null,
      termStart: s.termStart ?? null,
      now: todayStr(),
    });
  });

  r.get('/schedules', (_req, res) => {
    res.json({ schedules: listSchedules(store) });
  });

  /** 冲突报告去重：同一对日程+同一时间段，跨多个日期只保留前若干样例 */
  function summarizeConflicts(list: import('../../shared/src/types').Conflict[]) {
    const byKey = new Map<string, { c: import('../../shared/src/types').Conflict; n: number; dates: string[] }>();
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

  function buildCandidate(body: any, id: string): Schedule {
    const now = new Date().toISOString();
    return {
      id,
      title: String(body.title ?? ''),
      notes: String(body.notes ?? ''),
      type: body.type,
      color: String(body.color ?? '#4A90E2'),
      rule: body.rule,
      activeFrom: body.activeFrom ?? null,
      activeTo: body.activeTo ?? null,
      occurrenceLimit: body.occurrenceLimit == null ? null : Number(body.occurrenceLimit),
      overrides: Array.isArray(body.overrides) ? body.overrides : [],
      createdAt: now,
      updatedAt: now,
      // 同步元字段由服务端维护，客户端提交值一律忽略（见 docs/02 §8）：
      rev: 1,
      deletedAt: null,
      lastWriter: 'pc',
    };
  }

  function rejectIssues(res: Response, issues: string[]) {
    res.status(400).json({ error: 'invalid', issues });
  }

  /** 通用 upsert（JSON 与 ICS 导入共用）：同 id 覆盖并复活（清墓碑、rev+1） */
  function upsertRaw(raw: any, preferredId?: string, writerId = 'pc'): { ok: boolean; issue?: string } {
    const issues = validateSchedule(raw);
    if (issues.length) return { ok: false, issue: issues.join('；') };
    let id: string;
    if (preferredId && getSchedule(store, preferredId)) id = preferredId;
    else id = raw.id && typeof raw.id === 'string' ? raw.id : newId();
    const existing = getSchedule(store, id);
    const s = buildCandidate(raw, id);
    if (existing) {
      s.createdAt = existing.createdAt;
      s.rev = (existing.rev ?? 0) + 1;
      s.lastWriter = writerId;
      s.deletedAt = null;
      updateSchedule(store, s);
    } else {
      s.lastWriter = writerId;
      insertSchedule(store, s);
    }
    return { ok: true };
  }

  function checkConflicts(res: Response, all: Schedule[], candidate: Schedule, force: boolean): boolean {
    const s = settings();
    const [from, to] = probeWindowFor(candidate);
    const det = detectConflicts(all, candidate, {
      from,
      to,
      termStart: s.termStart ?? null,
      holidays: Array.isArray(s.holidays) ? s.holidays : null,
    });
    const errors = summarizeConflicts(det.errors);
    if (errors.length && !force) {
      res.status(409).json({ error: 'conflict', conflicts: { errors, warnings: [] }, message: '存在硬性冲突（固定×固定或自身重叠）' });
      return false;
    }
    res.locals.__conflicts = { errors: errors.length && force ? errors : [], warnings: summarizeConflicts(det.warnings) };
    return true;
  }

  r.post('/schedules', writeGuard, (req, res) => {
    const body = req.body ?? {};
    const issues = validateSchedule(body);
    if (issues.length) return rejectIssues(res, issues);
    const candidate = buildCandidate(body, newId());
    candidate.lastWriter = writer(res);
    const all = listSchedules(store);
    if (!checkConflicts(res, all, candidate, body.force === true)) return;
    insertSchedule(store, candidate);
    res.status(201).json({ schedule: candidate, conflicts: res.locals.__conflicts });
  });

  r.put('/schedules/:id', writeGuard, (req, res) => {
    const body = req.body ?? {};
    const existing = getSchedule(store, req.params.id);
    if (!existing || existing.deletedAt) return res.status(404).json({ error: 'notfound' });
    const issues = validateSchedule({ ...existing, ...body });
    if (issues.length) return rejectIssues(res, issues);
    const candidate = buildCandidate({ ...existing, ...body }, existing.id);
    candidate.createdAt = existing.createdAt;
    // 同步元字段服务端维护：rev 在既有值上 +1，lastWriter=写者（'pc' 或设备 id），保存即视为在册
    candidate.rev = (existing.rev ?? 0) + 1;
    candidate.lastWriter = writer(res);
    candidate.deletedAt = null;
    const all = listSchedules(store);
    if (!checkConflicts(res, all, candidate, body.force === true)) return;
    updateSchedule(store, candidate);
    res.json({ schedule: candidate, conflicts: res.locals.__conflicts });
  });

  r.delete('/schedules/:id', writeGuard, (req, res) => {
    // v0.3：软删除（置 deleted_at 墓碑并 rev+1，删除可随同步传播）；已删除/不存在 → 404
    if (softDeleteSchedule(store, req.params.id, writer(res))) res.json({ ok: true, deleted: true });
    else res.status(404).json({ error: 'notfound' });
  });

  r.get('/occurrences', (req, res) => {
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
      return res.status(400).json({ error: 'invalid', message: 'from/to 须为 YYYY-MM-DD 且 from<=to' });
    }
    const s = settings();
    const occs: Occurrence[] = expandAll(listSchedules(store), {
      from,
      to,
      termStart: s.termStart ?? null,
      holidays: Array.isArray(s.holidays) ? s.holidays : null,
    });
    res.json({ from, to, occurrences: occs });
  });

  r.get('/settings', (_req, res) => {
    res.json({ settings: getSettings(store) });
  });

  r.put('/settings', writeGuard, (req, res) => {
    const patch = req.body?.settings;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return res.status(400).json({ error: 'invalid', message: 'body.settings 须为对象' });
    }
    setSettings(store, patch, writer(res));
    res.json({ settings: getSettings(store) });
  });

  r.get('/export', (_req, res) => {
    res.json({
      version: typeof __VERSION__ !== 'undefined' ? __VERSION__ : '0',
      exportedAt: new Date().toISOString(),
      settings: getSettings(store),
      schedules: listSchedules(store),
    });
  });

  r.post('/import', writeGuard, (req, res) => {
    const data = req.body ?? {};
    if (!Array.isArray(data.schedules)) {
      return res.status(400).json({ error: 'invalid', message: '缺少 schedules 数组' });
    }
    const ok: string[] = [];
    const bad: { title?: string; issues: string[] }[] = [];
    for (const raw of data.schedules) {
      const r = upsertRaw(raw, raw.id && typeof raw.id === 'string' ? raw.id : undefined, writer(res));
      if (r.ok) ok.push(raw.id ?? '');
      else bad.push({ title: raw?.title, issues: [r.issue!] });
    }
    if (data.settings && typeof data.settings === 'object') setSettings(store, data.settings, writer(res));
    res.json({ ok: ok.length, failed: bad.length, bad });
  });

  /* ---------- iCalendar（RFC 5545 / 6868，见 docs/09） ---------- */

  r.get('/export.ics', (_req, res) => {
    const q = String(_req.query.from || '');
    const from = /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : todayStr();
    const toRaw = String(_req.query.to || '');
    const to = /^\d{4}-\d{2}-\d{2}$/.test(toRaw) ? toRaw : addDays(from, 365);
    const s = settings();
    const ics = scheduleToIcs(listSchedules(store), { from, to, termStart: s.termStart ?? null });
    res.setHeader('Content-Disposition', `attachment; filename="schedbuddy-${from}.ics"`);
    res.type('text/calendar; charset=utf-8');
    res.send(ics);
  });

  r.post('/import.ics', writeGuard, (req, res) => {
    const text = String(req.body?.text ?? '');
    if (!text.includes('BEGIN:VCALENDAR')) {
      return res.status(400).json({ error: 'invalid', message: '不是有效的 iCalendar 文本' });
    }
    const { events, ignored } = parseIcs(text);
    const rebuilt = eventsToSchedules(events);
    const bad: { title?: string; issues: string[] }[] = [];
    let okCount = 0;
    for (const sched of rebuilt.schedules) {
      const refId = (sched as any).refId && getSchedule(store, (sched as any).refId) ? (sched as any).refId : undefined;
      const r = upsertRaw(sched, refId, writer(res));
      if (r.ok) okCount++;
      else bad.push({ title: sched.title, issues: [r.issue!] });
    }
    res.json({ ok: okCount, failed: bad.length, bad, ignored: [...ignored, ...rebuilt.ignored] });
  });

  /* ---------- 设备配对（v0.4） ---------- */

  /** 生成一次性配对 PIN（仅本机；单次、10 分钟有效，服务重启作废） */
  r.post('/pin', loopbackOnly, (_req, res) => {
    const { pin, expiresAt } = createPin();
    res.json({ pin, expiresAt });
  });

  /** PIN 配对换发设备 token（局域网可用）：body { pin, name? } → 201 { deviceId, token } */
  r.post('/pair', (req, res) => {
    const pin = String(req.body?.pin ?? '').trim();
    if (!pin || !consumePin(pin)) {
      return res.status(403).json({ error: 'badpin', message: '配对 PIN 错误或已过期' });
    }
    const now = new Date().toISOString();
    const deviceId = `sb-${newId()}`;
    const token = newDeviceToken();
    const name = String(req.body?.name ?? '').trim() || 'Android 设备';
    insertDevice(store, { deviceId, name, token, createdAt: now, lastSeenAt: null });
    res.status(201).json({ deviceId, token });
  });

  /** 已配设备列表（仅本机；不返回 token） */
  r.get('/devices', loopbackOnly, (_req, res) => {
    res.json({ devices: listDevices(store) });
  });

  /** 撤销设备（仅本机；token 随即失效） */
  r.delete('/devices/:deviceId', loopbackOnly, (req, res) => {
    if (deleteDevice(store, req.params.deviceId)) res.json({ ok: true, deleted: true });
    else res.status(404).json({ error: 'notfound' });
  });

  return r;
}
