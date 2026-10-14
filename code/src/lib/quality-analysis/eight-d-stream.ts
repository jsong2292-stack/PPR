import type { EightDDraftEvent } from './types';

/**
 * 8D 集成结果的流式字段解析。
 *
 * 背景：8D 的结构化输出由 `toolStrategy` 通过一次工具调用产生，其参数就是
 * `{"title":"…","d1":"…",…,"d8":"…"}` 这段 JSON 文本。网关（已验证）会把工具参数
 * 按增量块推下来，因此可以在模型写报告的同时把字段内容实时填进页面输入框。
 *
 * 边界（重要）：
 *  - 本模块只服务**展示**。入库与校验始终使用流结束后 `JSON.parse` + zod 的结果，
 *    所以即使这里的增量解析遇到边界情况，也不会污染落库的报告内容。
 *  - 模型输出的是一条 JSON 文本流，字段必然依次出现；无法做到 8 个字段同时产出。
 */

/** 会流式写入页面的字段：报告标题与 D1–D8。 */
export const EIGHT_D_STREAM_FIELDS = ['title', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8'] as const;

const FIELD_SET = new Set<string>(EIGHT_D_STREAM_FIELDS);

const ESCAPES: Record<string, string> = {
  '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t',
};

/**
 * 解码「可能还不完整」的 JSON 字符串内容。
 * 增量块的边界可能正好落在转义序列中间（结尾是孤立的 `\` 或 `\u12`），
 * 这时必须丢掉这个未完成的尾巴等下一块，否则会把半个转义符显示成乱码。
 */
export function decodePartialJsonString(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch !== '\\') { out += ch; continue; }
    const next = raw[i + 1];
    if (next === undefined) break;
    if (next === 'u') {
      const hex = raw.slice(i + 2, i + 6);
      if (hex.length < 4) break;
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) { out += next; i += 1; continue; }
      out += String.fromCharCode(parseInt(hex, 16));
      i += 5;
      continue;
    }
    if (ESCAPES[next] === undefined) { out += next; i += 1; continue; }
    out += ESCAPES[next];
    i += 1;
  }
  return out;
}

type ScanResult = { done: Record<string, string>; openKey: string | null; openText: string };

/**
 * 在累积的 JSON 文本里找出顶层 `title` / `d1`–`d8` 字符串字段的当前值。
 * 只认第一层字段：其余工具调用的参数不会有这些键，嵌套结构里的同名字符串也不会被误取。
 */
export function scanEightDFields(buffer: string): ScanResult {
  const done: Record<string, string> = {};
  let openKey: string | null = null;
  let openText = '';
  let pendingKey: string | null = null;
  let depth = 0;
  let i = 0;

  while (i < buffer.length) {
    const ch = buffer[i];
    if (ch === '"') {
      const start = i + 1;
      let j = start;
      let escaped = false;
      while (j < buffer.length) {
        const current = buffer[j];
        if (escaped) { escaped = false; j += 1; continue; }
        if (current === '\\') { escaped = true; j += 1; continue; }
        if (current === '"') break;
        j += 1;
      }
      const closed = j < buffer.length;
      const raw = buffer.slice(start, j);
      if (depth === 1) {
        if (pendingKey === null) {
          if (!closed) break; // 键名还没读完
          pendingKey = raw;
          i = j + 1;
          continue;
        }
        if (FIELD_SET.has(pendingKey)) {
          const text = decodePartialJsonString(raw);
          if (closed) done[pendingKey] = text;
          else { openKey = pendingKey; openText = text; }
        }
        if (!closed) break; // 值字符串还没结束，等下一块
        pendingKey = null;
        i = j + 1;
        continue;
      }
      i = closed ? j + 1 : buffer.length;
      continue;
    }
    if (ch === '{' || ch === '[') { depth += 1; i += 1; continue; }
    if (ch === '}' || ch === ']') { depth = Math.max(0, depth - 1); pendingKey = null; i += 1; continue; }
    if (ch === ',') { pendingKey = null; i += 1; continue; }
    i += 1;
  }

  return { done, openKey, openText };
}

export type EightDFieldParser = {
  /** 送入一个增量块，返回本次发生变化的字段（文本为该字段目前为止的完整内容）。 */
  push(delta: string): EightDDraftEvent[];
  /** 到目前的完整原始参数，用于流结束后 JSON.parse 出权威结果。 */
  raw(): string;
  /** 增量解析出的字段快照，仅用于与权威结果对账。 */
  snapshot(): Record<string, string>;
  /** 是否已经出现了任何 8D 字段（用于判断这段参数是不是结构化输出）。 */
  hasFields(): boolean;
};

/**
 * 每个工具调用索引一个解析器：数据工具的参数不会命中字段名，
 * 因此无需知道策略工具叫什么名字，也不会把多个工具调用的参数拼到一起。
 */
export function createEightDFieldParser(): EightDFieldParser {
  let buffer = '';
  let previous: Record<string, string> = {};
  let previousOpen: string | null = null;

  return {
    push(delta: string) {
      buffer += delta;
      const { done, openKey, openText } = scanEightDFields(buffer);
      const current: Record<string, string> = { ...done };
      if (openKey) current[openKey] = openText;

      const events: EightDDraftEvent[] = [];
      for (const field of EIGHT_D_STREAM_FIELDS) {
        const text = current[field];
        if (text === undefined || text === previous[field]) continue;
        events.push({ field, text, open: openKey === field });
      }
      // 字段写完时文本不再变化，必须补一帧 open:false，否则页面上会一直显示"正在写"。
      if (previousOpen && previousOpen !== openKey && !events.some((event) => event.field === previousOpen)) {
        const text = current[previousOpen] ?? previous[previousOpen] ?? '';
        events.push({ field: previousOpen, text, open: false });
      }

      previous = current;
      previousOpen = openKey;
      return events;
    },
    snapshot: () => ({ ...previous }),
    raw: () => buffer,
    hasFields: () => Object.keys(previous).length > 0,
  };
}
