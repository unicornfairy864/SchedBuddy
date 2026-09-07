/**
 * iCalendar（RFC 5545 + RFC 6868）工具：文本转义 / 折叠 / 行解析（纯函数，无 IO）。
 * 时区口径：导出一律 floating 时间（无 TZID），单机/局域网同地语义最稳（见 docs/09-icalendar.md）。
 */

/** 按 RFC 6868 编码“参数值”：^ → ^^、换行 → ^n、双引号 → ^' （仅用于 PARAMETER VALUE） */
export function escapeParamValue(v: string): string {
  return v.replace(/\^/g, '^^').replace(/\r?\n/g, '^n').replace(/"/g, "^'");
}

/** 解码 RFC 6868 caret 参数值 */
export function decodeParamValue(v: string): string {
  return v.replace(/\^([n'^])/g, (_m, c: string) => (c === 'n' ? '\n' : c === "'" ? '"' : '^'));
}

/** 转义 TEXT 值：\, \; \n(→\\n 两字符)（RFC 5545 §3.3.11） */
export function escapeText(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** 解码 TEXT 值 */
export function decodeText(v: string): string {
  return v.replace(/\\([\\;,nN])/g, (_m, c: string) => {
    if (c === 'n' || c === 'N') return '\n';
    return c; // \\ → \ 、\; → ; 、\, → ,
  });
}

/** 生成一行 content line（名称;参数:值），按 75 字节折叠（RFC 5545 §3.1） */
export function contentLine(name: string, params: [string, string][], value: string): string {
  const escParams = params.map(([k, v]) => `${k}=${escapeParamValue(v)}`).join(';');
  const line = `${name}${escParams ? ';' + escParams : ''}:${value}`;
  // 折行：按 UTF-8 字节 <= 75；续行以空格开头（折叠由解析侧合并）
  const MAX = 75;
  const out: string[] = [];
  const bytes = Buffer.from(line, 'utf8');
  let start = 0;
  while (bytes.length - start > MAX) {
    let cut = start + MAX;
    // 避免切开多字节字符：回退到字符边界（UTF-8 续字节前缀 10xxxxxx）
    while (cut > start && (bytes[cut] & 0xc0) === 0x80) cut--;
    out.push(Buffer.from(bytes.subarray(start, cut)).toString('utf8'));
    start = cut;
  }
  out.push(Buffer.from(bytes.subarray(start)).toString('utf8'));
  return out.join('\r\n ');
}

export interface ParsedProperty {
  name: string; // 大写
  params: Record<string, string[]>; // 参数名 → 值列表（caret 已解码）
  value: string; // TEXT/非转义类型已解码/原样
  line: number;
}

/** 展开折叠并逐行解析（RFC 5545 §3.1：续行以空格或 tab 开头；参数值 caret 解码）。
 *  BEGIN/END 也作为属性返回（name=BEGIN/END，value=组件名），便于按组件切分。 */
export function parseLines(text: string): ParsedProperty[] {
  const unfolded = text
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n');
  const out: ParsedProperty[] = [];
  unfolded.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const ci = line.indexOf(':');
    if (ci < 0) return;
    const head = line.slice(0, ci);
    const value = line.slice(ci + 1);
    const semi = head.split(';');
    const name = semi.shift()!.toUpperCase();
    const params: Record<string, string[]> = {};
    for (const p of semi) {
      const eq = p.indexOf('=');
      if (eq < 0) continue;
      const key = p.slice(0, eq).toUpperCase();
      const vals = p.slice(eq + 1).split(',').map(decodeParamValue);
      params[key] = vals;
    }
    out.push({ name, params, value, line: i + 1 });
  });
  return out;
}

/** 时间戳：DateStr 'YYYY-MM-DD' + 分钟 → floating 'YYYYMMDDTHHMMSS' */
export function dateTimeFloating(date: string, minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const d = date.replace(/-/g, '');
  return `${d}T${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}00`;
}

/** 仅日期值 'YYYY-MM-DD' → 'YYYYMMDD' */
export function dateValue(date: string): string {
  return date.replace(/-/g, '');
}

export function icsDateToYMD(v: string): string {
  return v.slice(0, 4) + '-' + v.slice(4, 6) + '-' + v.slice(6, 8);
}
