/**
 * 数值、日期与展示格式化。
 *
 * 一条贯穿全系统的规则：
 *   **某个指标没有数据时显示「无数据」，绝不显示 0，也不留空。**
 * 关系库里「缺失 = 不写值行」，因此接口层返回 null，展示层统一走这里。
 */

/** 缺失数据的统一展示文案 */
export const NO_DATA = '无数据';
/** 数值不足以支撑结论时的统一展示文案 */
export const INSUFFICIENT = '数据不足';

/** 判断是否为可用数值（null / undefined / '' / NaN / 非数字字符串都算缺失） */
export function isNum(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  return Number.isFinite(Number(value));
}

/** 转数字；不可用时返回 null（不要用 Number() 直接转，会把 '' 变成 0） */
export function toNum(value: unknown): number | null {
  return isNum(value) ? Number(value) : null;
}

/**
 * 定点格式化。
 * @param value 数值或数据库返回的 DECIMAL 字符串
 * @param digits 小数位；缺省时用指标字典的 decimal_scale
 * @param fallback 缺失时的文案，默认「无数据」
 */
export function fmt(value: unknown, digits = 2, fallback: string = NO_DATA): string {
  const num = toNum(value);
  if (num === null) return fallback;
  return num.toFixed(digits);
}

/** 格式化并带单位 */
export function fmtUnit(value: unknown, unit?: string | null, digits = 2): string {
  const text = fmt(value, digits);
  if (text === NO_DATA) return NO_DATA;
  return unit ? `${text} ${unit}` : text;
}

/** 带符号格式化，用于偏差、变化量（正数补 +） */
export function fmtSigned(value: unknown, digits = 2): string {
  const num = toNum(value);
  if (num === null) return NO_DATA;
  return `${num > 0 ? '+' : ''}${num.toFixed(digits)}`;
}

/** 毫秒 / 分钟转换 */
export function minutesBetween(from: string | Date, to: string | Date): number | null {
  const start = parseDateTime(from);
  const end = parseDateTime(to);
  if (start === null || end === null) return null;
  return Math.round((end - start) / 60_000);
}

/**
 * 解析 'YYYY-MM-DD HH:mm[:ss]' 或 Date。
 *
 * 刻意不用 `new Date('2026-10-10 08:00')` —— 该写法在 V8 中按本地时区解析、
 * 在 Safari/Node 部分版本中按 UTC 解析，行为不一致。这里显式拆解字段，
 * 保证与数据库 DATETIME（无时区）语义一致。
 */
export function parseDateTime(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  const text = String(value).trim();
  const match = text.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (!match) {
    const parsed = Date.parse(text);
    return Number.isNaN(parsed) ? null : parsed;
  }
  const [, y, mo, d, h = '00', mi = '00', s = '00'] = match;
  return new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s),
  ).getTime();
}

/** DATETIME → 'YYYY-MM-DD' */
export function toDateString(value: string | Date | null | undefined): string {
  const text = normalizeDateTime(value);
  return text ? text.slice(0, 10) : NO_DATA;
}

/** DATETIME → 'HH:mm' */
export function toTimeString(value: string | Date | null | undefined): string {
  const text = normalizeDateTime(value);
  return text ? text.slice(11, 16) : NO_DATA;
}

/** DATETIME → 'YYYY-MM-DD HH:mm:ss'；兼容 Date 与已格式化字符串 */
export function normalizeDateTime(value: string | Date | null | undefined): string {
  if (!value) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return formatLocal(value);
  }
  return String(value).trim().replace('T', ' ').slice(0, 19);
}

/** Date → 'YYYY-MM-DD HH:mm:ss'（按本机时区，不做 UTC 转换） */
export function formatLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/** 当前时间的数据库写法 */
export function nowDateTime(): string {
  return formatLocal(new Date());
}

/** 百分比格式化（0.1234 → '12.34%'） */
export function fmtPercent(value: unknown, digits = 2): string {
  const num = toNum(value);
  if (num === null) return NO_DATA;
  return `${(num * 100).toFixed(digits)}%`;
}

/** 数字千分位（用于条数、米数等大数展示） */
export function fmtCount(value: unknown): string {
  const num = toNum(value);
  if (num === null) return NO_DATA;
  return num.toLocaleString('zh-CN');
}
