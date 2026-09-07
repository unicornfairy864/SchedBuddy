import Database from 'better-sqlite3';
import { existsSync, mkdirSync, copyFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Schedule, Settings } from '../../shared/src/types';
import { randomUUID } from 'node:crypto';

export interface Store {
  db: Database.Database;
  dataDir: string;
}

const TABLE_DDL = `
CREATE TABLE IF NOT EXISTS schedules (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  notes         TEXT NOT NULL DEFAULT '',
  type          TEXT NOT NULL CHECK(type IN ('fixed','specific','optional','temporary')),
  color         TEXT NOT NULL DEFAULT '#4A90E2',
  rule_json     TEXT NOT NULL,
  overrides_json TEXT NOT NULL DEFAULT '[]',
  active_from   TEXT,
  active_to     TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const MIGRATIONS = [
  TABLE_DDL,
  // v2: 早期版本含冗余 NOT NULL 列 segments_json（无默认值导致插入失败），重建表移除。
  `DROP TABLE IF EXISTS schedules;
   ${TABLE_DDL}`,
  // v3: 同步字段（docs/02 §8.1，v0.2.29 落库）：
  //     rev = 单调同步序号（pull/push 水印）；deleted_at = 软删墓碑；last_writer = 最后修改设备。
  //     既有行补基线 rev=1（新客户端 since=0 拉取时 rev>0 全部可见）。
  `ALTER TABLE schedules ADD COLUMN rev INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE schedules ADD COLUMN deleted_at TEXT;
   ALTER TABLE schedules ADD COLUMN last_writer TEXT NOT NULL DEFAULT 'pc';
   UPDATE schedules SET rev = 1;
   ALTER TABLE settings ADD COLUMN rev INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE settings ADD COLUMN deleted_at TEXT;
   ALTER TABLE settings ADD COLUMN last_writer TEXT NOT NULL DEFAULT 'pc';
   UPDATE settings SET rev = 1;`,
  // v4: 课程总数量（occurrence_limit，按天计次，见 docs/02；NULL = 不限）。
  `ALTER TABLE schedules ADD COLUMN occurrence_limit INTEGER;`,
  // v5: 配对设备（v0.4 /api/pair 换发；长期 token；撤销 = 物理删除，不参与 rev 同步体系）。
  `CREATE TABLE IF NOT EXISTS devices (
     device_id    TEXT PRIMARY KEY,
     name         TEXT NOT NULL DEFAULT '',
     token        TEXT NOT NULL UNIQUE,
     created_at   TEXT NOT NULL,
     last_seen_at TEXT
   );`,
];

export function openStore(dataDir: string): Store {
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(join(dataDir, 'schedbuddy.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const ver = db.pragma('user_version', { simple: true }) as number;
  for (let v = ver; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  return { db, dataDir };
}

/* ---------- schedules 映射 ---------- */

export function rowToSchedule(row: any): Schedule {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes ?? '',
    type: row.type,
    color: row.color,
    rule: JSON.parse(row.rule_json),
    activeFrom: row.active_from,
    activeTo: row.active_to,
    occurrenceLimit: row.occurrence_limit ?? null,
    overrides: JSON.parse(row.overrides_json ?? '[]'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rev: row.rev ?? 0,
    deletedAt: row.deleted_at ?? null,
    lastWriter: row.last_writer ?? 'pc',
  } as Schedule;
}

/** 在册（未软删）日程；列表/渲染/冲突检测/普通读取一律只含在册记录。 */
export function listSchedules(store: Store): Schedule[] {
  const rows = store.db
    .prepare('SELECT * FROM schedules WHERE deleted_at IS NULL ORDER BY updated_at DESC')
    .all() as any[];
  return rows.map(rowToSchedule);
}

/** 含墓碑的全量行（同步 v0.5 的 pull 使用；普通路径请用 listSchedules）。 */
export function listSchedulesAll(store: Store): Schedule[] {
  const rows = store.db.prepare('SELECT * FROM schedules ORDER BY updated_at DESC').all() as any[];
  return rows.map(rowToSchedule);
}

export function insertSchedule(store: Store, s: Schedule): void {
  store.db
    .prepare(
      `INSERT INTO schedules
       (id,title,notes,type,color,rule_json,overrides_json,active_from,active_to,occurrence_limit,created_at,updated_at,rev,deleted_at,last_writer)
       VALUES (@id,@title,@notes,@type,@color,@rule_json,@overrides_json,@active_from,@active_to,@occurrence_limit,@created_at,@updated_at,@rev,@deleted_at,@last_writer)`,
    )
    .run({
      id: s.id,
      title: s.title,
      notes: s.notes,
      type: s.type,
      color: s.color,
      rule_json: JSON.stringify(s.rule),
      overrides_json: JSON.stringify(s.overrides ?? []),
      active_from: s.activeFrom,
      active_to: s.activeTo,
      occurrence_limit: s.occurrenceLimit ?? null,
      created_at: s.createdAt,
      updated_at: s.updatedAt,
      rev: s.rev ?? 1,
      deleted_at: s.deletedAt ?? null,
      last_writer: s.lastWriter ?? 'pc',
    });
}

export function updateSchedule(store: Store, s: Schedule): void {
  store.db
    .prepare(
      `UPDATE schedules SET
       title=@title,notes=@notes,type=@type,color=@color,rule_json=@rule_json,
       overrides_json=@overrides_json,active_from=@active_from,active_to=@active_to,
       occurrence_limit=@occurrence_limit,
       updated_at=@updated_at,rev=@rev,deleted_at=@deleted_at,last_writer=@last_writer
       WHERE id=@id`,
    )
    .run({
      id: s.id,
      title: s.title,
      notes: s.notes,
      type: s.type,
      color: s.color,
      rule_json: JSON.stringify(s.rule),
      overrides_json: JSON.stringify(s.overrides ?? []),
      active_from: s.activeFrom,
      active_to: s.activeTo,
      occurrence_limit: s.occurrenceLimit ?? null,
      updated_at: s.updatedAt,
      rev: s.rev ?? 1,
      deleted_at: s.deletedAt ?? null,
      last_writer: s.lastWriter ?? 'pc',
    });
}

/** 软删除（v0.3 起 DELETE 只置墓碑并 rev+1，删除可双向传播）；已删除/不存在返回 false。 */
export function softDeleteSchedule(store: Store, id: string, writer = 'pc'): boolean {
  const now = new Date().toISOString();
  const r = store.db
    .prepare(
      `UPDATE schedules
       SET deleted_at=@now, last_writer=@writer, updated_at=@now, rev=rev+1
       WHERE id=@id AND deleted_at IS NULL`,
    )
    .run({ id, now, writer });
  return r.changes > 0;
}

export function getSchedule(store: Store, id: string): Schedule | null {
  const row = store.db.prepare('SELECT * FROM schedules WHERE id=?').get(id) as any;
  if (!row) return null;
  return rowToSchedule(row);
}

/* ---------- settings ---------- */

export function getSettings(store: Store): Settings {
  const rows = store.db.prepare('SELECT key,value FROM settings WHERE deleted_at IS NULL').all() as any[];
  const out: Settings = {};
  for (const r of rows) {
    try {
      out[r.key] = JSON.parse(r.value);
    } catch {
      out[r.key] = r.value;
    }
  }
  return out;
}

/** 设置写入维护 rev/last_writer（每键每次写 rev+1，参与同步水印）。 */
export function setSettings(store: Store, patch: Settings, writer = 'pc'): void {
  const up = store.db.prepare(
    `INSERT INTO settings (key,value,rev,last_writer) VALUES (?,?,1,?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, rev=settings.rev+1, last_writer=excluded.last_writer`,
  );
  for (const [k, v] of Object.entries(patch)) {
    up.run(k, JSON.stringify(v), writer);
  }
}

/* ---------- 配对设备（v0.4，docs/04 §访问控制） ---------- */

export interface Device {
  deviceId: string;
  name: string;
  token: string;
  createdAt: string;
  lastSeenAt: string | null;
}

export function insertDevice(store: Store, d: Device): void {
  store.db
    .prepare(
      `INSERT INTO devices (device_id,name,token,created_at,last_seen_at)
       VALUES (@deviceId,@name,@token,@createdAt,@lastSeenAt)`,
    )
    .run({
      deviceId: d.deviceId,
      name: d.name,
      token: d.token,
      createdAt: d.createdAt,
      lastSeenAt: d.lastSeenAt ?? null,
    });
}

export function findDeviceByToken(store: Store, token: string): Device | null {
  const row = store.db.prepare('SELECT * FROM devices WHERE token=?').get(token) as any;
  if (!row) return null;
  return {
    deviceId: row.device_id,
    name: row.name,
    token: row.token,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at ?? null,
  };
}

export function listDevices(store: Store): Omit<Device, 'token'>[] {
  const rows = store.db.prepare('SELECT device_id,name,created_at,last_seen_at FROM devices ORDER BY created_at').all() as any[];
  return rows.map((row) => ({
    deviceId: row.device_id,
    name: row.name,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at ?? null,
  }));
}

/** 撤销设备（物理删除；token 随即失效）。返回是否命中。 */
export function deleteDevice(store: Store, deviceId: string): boolean {
  const r = store.db.prepare('DELETE FROM devices WHERE device_id=?').run(deviceId);
  return r.changes > 0;
}

export function touchDevice(store: Store, deviceId: string): void {
  store.db.prepare('UPDATE devices SET last_seen_at=? WHERE device_id=?').run(new Date().toISOString(), deviceId);
}

/* ---------- 备份 ---------- */

export function backupIfDue(store: Store, maxKeep = 14, minHours = 24): string | null {
  const backupsDir = join(store.dataDir, 'backups');
  mkdirSync(backupsDir, { recursive: true });
  const files = readdirSync(backupsDir)
    .filter((f) => f.endsWith('.db'))
    .sort()
    .reverse();
  if (files.length > 0) {
    const newest = files[0];
    const match = /schedbuddy-(\d{8})-(\d{6})\.db$/.exec(newest);
    if (match) {
      const t = new Date(
        +match[1].slice(0, 4),
        +match[1].slice(4, 6) - 1,
        +match[1].slice(6, 8),
        +match[2].slice(0, 2),
        +match[2].slice(2, 4),
        +match[2].slice(4, 6),
      );
      if (Date.now() - t.getTime() < minHours * 3_600_000) {
        prune(backupsDir, files, maxKeep);
        return null;
      }
    }
  }
  store.db.pragma('wal_checkpoint(TRUNCATE)');
  const ts = new Date();
  const stamp =
    `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}` +
    `-${String(ts.getHours()).padStart(2, '0')}${String(ts.getMinutes()).padStart(2, '0')}${String(ts.getSeconds()).padStart(2, '0')}`;
  const name = `schedbuddy-${stamp}.db`;
  copyFileSync(join(store.dataDir, 'schedbuddy.db'), join(backupsDir, name));
  const after = readdirSync(backupsDir).filter((f) => f.endsWith('.db')).sort().reverse();
  prune(backupsDir, after, maxKeep);
  return name;
}

function prune(dir: string, sortedDesc: string[], maxKeep: number): void {
  for (const f of sortedDesc.slice(maxKeep)) {
    try {
      rmSync(join(dir, f));
    } catch {
      /* ignore */
    }
  }
}

export function newId(): string {
  return randomUUID();
}

export function ensureDir(p: string): void {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}
