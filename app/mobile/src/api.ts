/** SchedBuddy 主机 REST 客户端（v0.4 只读 · 最小集） */

export interface Meta {
  version: string;
  readOnly: boolean;
  port: number;
  lan: string | null;
  termStart: string | null;
  now: string;
}

export type MetaErrorKind = 'timeout' | 'network' | 'http' | 'badjson';

export class MetaError extends Error {
  constructor(
    readonly kind: MetaErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'MetaError';
  }
}

/** GET /api/meta（带超时）。LAN 上连到非 SchedBuddy 服务会以 badjson 报告。 */
export async function fetchMeta(baseUrl: string, timeoutMs = 4000): Promise<Meta> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/meta`, { signal: ctrl.signal });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === 'AbortError';
    throw new MetaError(
      timedOut ? 'timeout' : 'network',
      timedOut ? `连接超时（${timeoutMs}ms）` : `无法连接：${e instanceof Error ? e.message : String(e)}`,
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new MetaError('http', `HTTP ${res.status}`, res.status);
  try {
    const data = (await res.json()) as Meta;
    if (typeof data.version !== 'string' || typeof data.readOnly !== 'boolean') {
      throw new MetaError('badjson', '响应格式不符（不是 SchedBuddy 主机？）');
    }
    return data;
  } catch (e) {
    if (e instanceof MetaError) throw e;
    throw new MetaError('badjson', '响应不是有效 JSON');
  }
}
