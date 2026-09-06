import { Router, type Request, type Response } from 'express';
import { networkInterfaces } from 'node:os';
import { expandAll } from '../../shared/src/expand';
import { detectConflicts, probeWindowFor } from '../../shared/src/conflict';
import { validateSchedule } from '../../shared/src/validate';
import { todayStr } from '../../shared/src/time';
import type { Occurrence, Schedule } from '../../shared/src/types';
import {
  getSchedule,
  getSettings,
  insertSchedule,
  listSchedules,
  newId,
  setSettings,
  softDeleteSchedule,
  updateSchedule,
  type Store,
} from './db';

declare const __VERSION__: string;

export function makeApi(store: Store) {
  const r = Router();

  const isLoopback = (req: Request): boolean => {
    const addr = String(req.socket.remoteAddress || '');
    const clean = addr.startsWith('::ffff:') ? addr.slice(7) : addr;
    return clean === '127.0.0.1' || clean === '::1' || clean === 'localhost';
  };

  const writeGuard = (req: Request, res: Response, next: () => void) => {
    if (!isLoopback(req)) {
      res.status(403).json({ error: 'readonly', message: '仅桌面主机（本机）可修改日程；局域网客户端为只读。' });
      return;
    }
    next();
  };

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
    // 同步元字段服务端维护：rev 在既有值上 +1，lastWriter=本机（'pc'），保存即视为在册
    candidate.rev = (existing.rev ?? 0) + 1;
    candidate.lastWriter = 'pc';
    candidate.deletedAt = null;
    const all = listSchedules(store);
    if (!checkConflicts(res, all, candidate, body.force === true)) return;
    updateSchedule(store, candidate);
    res.json({ schedule: candidate, conflicts: res.locals.__conflicts });
  });

  r.delete('/schedules/:id', writeGuard, (req, res) => {
    // v0.3：软删除（置 deleted_at 墓碑并 rev+1，删除可随同步传播）；已删除/不存在 → 404
    if (softDeleteSchedule(store, req.params.id, 'pc')) res.json({ ok: true, deleted: true });
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
    setSettings(store, patch);
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
      const issues = validateSchedule(raw);
      if (issues.length) {
        bad.push({ title: raw?.title, issues });
        continue;
      }
      const id = raw.id && typeof raw.id === 'string' ? raw.id : newId();
      const existing = getSchedule(store, id);
      const s = buildCandidate(raw, id);
      if (existing) {
        // 重复导入：同 id 覆盖并复活（清墓碑、rev+1），避免主键冲突
        s.createdAt = existing.createdAt;
        s.rev = (existing.rev ?? 0) + 1;
        s.lastWriter = 'pc';
        s.deletedAt = null;
        updateSchedule(store, s);
      } else {
        insertSchedule(store, s);
      }
      ok.push(s.id);
    }
    if (data.settings && typeof data.settings === 'object') setSettings(store, data.settings);
    res.json({ ok: ok.length, failed: bad.length, bad });
  });

  return r;
}
