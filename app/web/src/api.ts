export interface Meta {
  version: string;
  readOnly: boolean;
  port: number;
  termStart: string | null;
  now: string;
}

export interface ApiScheduleList {
  schedules: import('../../shared/src/types').Schedule[];
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchMeta(): Promise<Meta> {
  return getJson<Meta>('/api/meta');
}

export async function fetchSchedules(): Promise<import('../../shared/src/types').Schedule[]> {
  const data = await getJson<ApiScheduleList>('/api/schedules');
  return data.schedules;
}
