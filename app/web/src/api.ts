import type { Schedule } from '../../shared/src/types';

export interface Meta {
  version: string;
  readOnly: boolean;
  port: number;
  /** 局域网访问地址（http://<LAN-IPv4>:port），供本机页脚展示；无局域网地址为 null */
  lan: string | null;
  termStart: string | null;
  now: string;
}

export interface ApiScheduleList {
  schedules: Schedule[];
}

/** 服务端冲突摘要（同一对日程+时段跨多日期去重，保留样例） */
export interface SummarizedConflict {
  date: string;
  dates: string[];
  total: number;
  a: { scheduleId: string; title: string; type: string; startMin: number; endMin: number };
  b: { scheduleId: string; title: string; type: string; startMin: number; endMin: number };
}

export interface ConflictsPayload {
  errors: SummarizedConflict[];
  warnings: SummarizedConflict[];
}

export interface SaveResult {
  schedule: Schedule;
  conflicts: ConflictsPayload;
}

/** 可编辑提交载荷（服务端忽略 rev/deletedAt/lastWriter 等同步元字段） */
export type ScheduleDraft = Pick<
  Schedule,
  'title' | 'notes' | 'type' | 'color' | 'rule' | 'activeFrom' | 'activeTo' | 'occurrenceLimit' | 'overrides'
> & { force?: boolean };

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, body: any) {
    super(`HTTP ${status}: ${String(body?.message ?? body?.error ?? '')}`);
    this.status = status;
    this.body = body;
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new ApiError(res.status, await safeJson(res));
  return (await res.json()) as T;
}

async function sendJson<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status, await safeJson(res));
  return (await res.json()) as T;
}

async function safeJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function fetchMeta(): Promise<Meta> {
  return getJson<Meta>('/api/meta');
}

export async function fetchSchedules(): Promise<Schedule[]> {
  const data = await getJson<ApiScheduleList>('/api/schedules');
  return data.schedules;
}

export async function createSchedule(draft: ScheduleDraft): Promise<SaveResult> {
  return sendJson<SaveResult>('POST', '/api/schedules', draft);
}

export async function updateSchedule(id: string, draft: ScheduleDraft): Promise<SaveResult> {
  return sendJson<SaveResult>('PUT', `/api/schedules/${id}`, draft);
}

export async function removeSchedule(id: string): Promise<void> {
  await sendJson<{ ok: boolean }>('DELETE', `/api/schedules/${id}`);
}

export async function fetchSettings(): Promise<Record<string, unknown>> {
  const data = await getJson<{ settings: Record<string, unknown> }>('/api/settings');
  return data.settings;
}

export async function saveSettings(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  const data = await sendJson<{ settings: Record<string, unknown> }>('PUT', '/api/settings', { settings: patch });
  return data.settings;
}

/* ---------- 全应用数据 导出 / 导入 ---------- */

export interface BackupData {
  version: string;
  exportedAt: string;
  settings: Record<string, unknown>;
  schedules: Schedule[];
}

export async function fetchBackup(): Promise<BackupData> {
  return getJson<BackupData>('/api/export');
}

export interface ImportResult {
  ok: number;
  failed: number;
  bad: { title?: string; issues: string[] }[];
}

export async function postImport(data: unknown): Promise<ImportResult> {
  return sendJson<ImportResult>('POST', '/api/import', data);
}

/* ---------- iCalendar（RFC 5545，见 docs/09） ---------- */

export async function fetchIcs(from?: string, to?: string): Promise<string> {
  const q = new URLSearchParams();
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  const res = await fetch(`/api/export.ics?${q.toString()}`);
  if (!res.ok) throw new ApiError(res.status, await safeJson(res));
  return res.text();
}

export interface IcsImportResult {
  ok: number;
  failed: number;
  bad: { title?: string; issues: string[] }[];
  ignored: string[];
}

export async function postIcsImport(text: string): Promise<IcsImportResult> {
  return sendJson<IcsImportResult>('POST', '/api/import.ics', { text });
}
