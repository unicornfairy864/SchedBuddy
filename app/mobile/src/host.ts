import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * 主机地址配置（0.4.2）
 * 用户填写「主机局域网地址[:端口]」→ 规范化 → AsyncStorage 持久化。
 */

const STORAGE_KEY = 'schedbuddy:host:v1';
export const DEFAULT_PORT = 3876;

export interface HostConfig {
  /** 主机地址，形如 "192.168.43.12"（不含协议 / 端口 / 路径） */
  host: string;
  port: number;
}

/** 读取已保存配置；未配置或数据损坏返回 null */
export async function loadHost(): Promise<HostConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HostConfig>;
    if (typeof parsed.host === 'string' && parsed.host.trim()) {
      return { host: parsed.host.trim(), port: Number(parsed.port) || DEFAULT_PORT };
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveHost(cfg: HostConfig): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

/** 用户输入 → 规范化配置；非法输入返回 null（不落库） */
export function parseHostInput(input: string): HostConfig | null {
  let s = input.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  if (!s) return null;
  let host = s;
  let port = DEFAULT_PORT;
  const colon = s.lastIndexOf(':');
  if (colon > 0) {
    const maybePort = Number(s.slice(colon + 1));
    const head = s.slice(0, colon);
    if (head && Number.isInteger(maybePort) && maybePort > 0 && maybePort <= 65535) {
      host = head;
      port = maybePort;
    }
  }
  if (!host || /[\s/]/.test(host)) return null;
  return { host, port };
}

export function baseUrlOf(cfg: HostConfig): string {
  return `http://${cfg.host}:${cfg.port}`;
}
