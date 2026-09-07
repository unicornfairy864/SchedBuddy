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

/** POST /api/pair：PIN 配对换发设备 token（App 写入凭证；可被主机撤销） */
export interface PairedResult {
  deviceId: string;
  token: string;
  name: string;
}

export async function pairDevice(baseUrl: string, pin: string, name = 'SchedBuddy Android', timeoutMs = 6000): Promise<PairedResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pin.trim(), name }),
      signal: ctrl.signal,
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === 'AbortError';
    throw new MetaError(timedOut ? 'timeout' : 'network', timedOut ? '配对超时' : `无法连接：${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    // 403 badpin / 其他错误：尽量带服务端 message
    let msg = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string; error?: string };
      msg = body?.message || body?.error || msg;
    } catch {
      /* ignore */
    }
    throw new MetaError(res.status === 403 ? 'http' : 'http', msg, res.status);
  }
  const data = (await res.json()) as { deviceId: string; token: string };
  if (typeof data.deviceId !== 'string' || typeof data.token !== 'string') {
    throw new MetaError('badjson', '配对响应格式不符');
  }
  return { deviceId: data.deviceId, token: data.token, name };
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
