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
    overrides: JSON.parse(row.overrides_json ?? '[]'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } as Schedule;
}

export function listSchedules(store: Store): Schedule[] {
  const rows = store.db.prepare('SELECT * FROM schedules ORDER BY updated_at DESC').all() as any[];
  return rows.map(rowToSchedule);
}

export function insertSchedule(store: Store, s: Schedule): void {
  store.db
    .prepare(
      `INSERT INTO schedules
       (id,title,notes,type,color,rule_json,overrides_json,active_from,active_to,created_at,updated_at)
       VALUES (@id,@title,@notes,@type,@color,@rule_json,@overrides_json,@active_from,@active_to,@created_at,@updated_at)`,
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
      created_at: s.createdAt,
      updated_at: s.updatedAt,
    });
}

export function updateSchedule(store: Store, s: Schedule): void {
  store.db
    .prepare(
      `UPDATE schedules SET
       title=@title,notes=@notes,type=@type,color=@color,rule_json=@rule_json,
       overrides_json=@overrides_json,active_from=@active_from,active_to=@active_to,updated_at=@updated_at
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
      updated_at: s.updatedAt,
    });
}

export function getSchedule(store: Store, id: string): Schedule | null {
  const row = store.db.prepare('SELECT * FROM schedules WHERE id=?').get(id) as any;
  if (!row) return null;
  return rowToSchedule(row);
}

export function deleteSchedule(store: Store, id: string): boolean {
  return store.db.prepare('DELETE FROM schedules WHERE id=?').run(id).changes > 0;
}

/* ---------- settings ---------- */

export function getSettings(store: Store): Settings {
  const rows = store.db.prepare('SELECT key,value FROM settings').all() as any[];
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

export function setSettings(store: Store, patch: Settings): void {
  const up = store.db.prepare(
    'INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
  );
  for (const [k, v] of Object.entries(patch)) {
    up.run(k, JSON.stringify(v));
  }
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
