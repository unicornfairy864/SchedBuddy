/**
 * 设备配对（v0.4，docs/04 §规划扩展接口 → 现已实现）
 *
 * PIN 由主机端生成（POST /api/pin，仅回环），单次、短时效（默认 10 分钟），
 * 存于进程内存 —— 服务重启后未使用 PIN 作废（需重新生成），已配 token 存 DB 不受影响。
 */
import { randomBytes, randomInt } from 'node:crypto';

const PIN_TTL_MS = 10 * 60_000;

/** pin -> 过期时间戳（ms） */
const pins = new Map<string, number>();

function sweep(): void {
  const now = Date.now();
  for (const [k, exp] of pins) if (exp <= now) pins.delete(k);
}

export function createPin(ttlMs: number = PIN_TTL_MS): { pin: string; expiresAt: string } {
  sweep();
  const now = Date.now();
  let pin = '';
  do {
    pin = String(randomInt(0, 1_000_000)).padStart(6, '0');
  } while (pins.has(pin));
  pins.set(pin, now + ttlMs);
  return { pin, expiresAt: new Date(now + ttlMs).toISOString() };
}

/** 校验并消费 PIN（单次；无论成败均作废该 PIN）。 */
export function consumePin(pin: string): boolean {
  const exp = pins.get(pin);
  pins.delete(pin);
  return exp != null && Date.now() <= exp;
}

/** 长期设备 token（256 bit 随机 hex）。 */
export function newDeviceToken(): string {
  return randomBytes(32).toString('hex');
}
