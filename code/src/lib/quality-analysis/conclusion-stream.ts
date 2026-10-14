import { decodePartialJsonString } from './eight-d-stream';
import type { ConclusionDraftEvent, QualityAnalysisConclusion } from './types';

/**
 * 诊断结论的流式逐条解析。
 *
 * 与 8D 的字段流（eight-d-stream）同源：结构化输出由 `toolStrategy` 通过一次工具调用产生，
 * 网关会把工具参数按增量块推下来。区别是诊断结果的结论是**数组**，所以要按元素切分：
 *  - 写完一个元素（一条结论）就立刻 `JSON.parse` 出来，作为一张卡片推给页面；
 *  - 正在写的那个元素用容错解析尽量提前把已经写完的字段显示出来；
 *  - 越界的增量（正好切在转义序列中间）交给 decodePartialJsonString 丢掉未完成的尾巴。
 *
 * 边界（重要）：本模块只服务**展示**。落库始终使用流结束后完整 `JSON.parse` + zod 的结果，
 * 即使这里的增量解析遇到边界情况，也不会污染入库的结论。
 */

const STRING_FIELDS = new Set(['category', 'hypothesis', 'evidence', 'missingEvidence', 'validationAction']);
const NUMBER_FIELDS = new Set(['confidence']);

/** 读取一个 JSON 字符串字面量：返回部分解码后的文本、结束位置与是否已闭合。 */
function readString(buffer: string, quoteIndex: number) {
  const start = quoteIndex + 1;
  let cursor = start;
  let escaped = false;
  while (cursor < buffer.length) {
    const ch = buffer[cursor];
    if (escaped) { escaped = false; cursor += 1; continue; }
    if (ch === '\\') { escaped = true; cursor += 1; continue; }
    if (ch === '"') break;
    cursor += 1;
  }
  const closed = cursor < buffer.length;
  return {
    text: decodePartialJsonString(buffer.slice(start, closed ? cursor : buffer.length)),
    end: closed ? cursor + 1 : buffer.length,
    closed,
  };
}

export type ConclusionsScan = {
  /** 已经写完的结论元素原文，可以直接 JSON.parse */
  items: string[];
  /** 正在写的元素原文；还没有进入元素时为 null */
  open: string | null;
  /** 是否已经出现过 conclusions 数组 */
  started: boolean;
};

/**
 * 在累积的 JSON 文本里定位顶层 `conclusions` 数组，
 * 返回其中已写完的元素原文与正在写的元素原文。只认第一层字段，嵌套结构不会被误取。
 */
export function scanConclusions(buffer: string): ConclusionsScan {
  const items: string[] = [];
  let open: string | null = null;
  let started = false;
  let depth = 0;
  /** depth===1 时刚读到的键名（读到值后清空），用于判断 `[` 是不是 conclusions 的值。 */
  let pendingKey: string | null = null;
  /** conclusions 数组所处的深度 */
  let arrayDepth = -1;
  /** 当前元素的起始下标，-1 表示当前不在元素里 */
  let elementStart = -1;
  let i = 0;

  while (i < buffer.length) {
    const ch = buffer[i];
    if (ch === '"') {
      const { text, end, closed } = readString(buffer, i);
      if (!started && depth === 1) {
        if (pendingKey === null) { if (closed) pendingKey = text; }
        else pendingKey = null; // 顶层其它字段的字符串值，读过就清掉，免得干扰下一个键
      }
      i = end;
      continue;
    }
    if (ch === '{' || ch === '[') {
      if (!started && ch === '[' && depth === 1 && pendingKey === 'conclusions') {
        started = true;
        arrayDepth = depth + 1;
      } else if (started && ch === '{' && depth === arrayDepth) {
        elementStart = i;
      }
      depth += 1;
      pendingKey = null;
      i += 1;
      continue;
    }
    if (ch === '}' || ch === ']') {
      // 元素体的 `}` 会先于数组的 `]` 出现，按深度判定元素是否写完。
      if (started && elementStart >= 0 && depth === arrayDepth + 1) {
        items.push(buffer.slice(elementStart, i + 1));
        elementStart = -1;
      }
      depth = Math.max(0, depth - 1);
      pendingKey = null;
      i += 1;
      continue;
    }
    if (ch === ',') { pendingKey = null; i += 1; continue; }
    i += 1;
  }

  if (elementStart >= 0) open = buffer.slice(elementStart);
  return { items, open, started };
}

/** 容错解析「正在写」的结论元素：只保证把已经写完的字段尽早显示出来。 */
export function parsePartialConclusion(raw: string): Partial<QualityAnalysisConclusion> {
  const out: Record<string, unknown> = {};
  const body = raw.startsWith('{') ? raw.slice(1) : raw;
  let depth = 0;
  let pendingKey: string | null = null;
  /** 正在收集的字符串数组字段（evidenceSourceIds） */
  let listKey: string | null = null;
  let list: string[] = [];
  let i = 0;

  while (i < body.length) {
    const ch = body[i];
    if (ch === '"') {
      const { text, end, closed } = readString(body, i);
      if (depth === 0) {
        if (pendingKey === null) { if (closed) pendingKey = text; }
        else if (STRING_FIELDS.has(pendingKey)) { out[pendingKey] = text; pendingKey = null; }
        else pendingKey = null;
      } else if (depth === 1 && listKey) {
        list.push(text);
      }
      i = end;
      continue;
    }
    if (ch === '[') {
      if (depth === 0 && pendingKey) { listKey = pendingKey; list = []; }
      depth += 1;
      pendingKey = null;
      i += 1;
      continue;
    }
    if (ch === ']') {
      if (depth === 1 && listKey) { out[listKey] = list; listKey = null; list = []; }
      depth = Math.max(0, depth - 1);
      pendingKey = null;
      i += 1;
      continue;
    }
    if (ch === '{') { depth += 1; pendingKey = null; i += 1; continue; }
    if (ch === '}') { depth = Math.max(0, depth - 1); pendingKey = null; i += 1; continue; }
    if (ch === ',') { pendingKey = null; i += 1; continue; }
    if (ch === ':') { i += 1; continue; }
    if (depth === 0 && pendingKey && NUMBER_FIELDS.has(pendingKey)) {
      const match = /^-?\d+(?:\.\d+)?/.exec(body.slice(i));
      if (match) { out[pendingKey] = Number(match[0]); pendingKey = null; i += match[0].length; continue; }
    }
    i += 1;
  }

  const conclusion: Record<string, unknown> = {};
  for (const field of STRING_FIELDS) {
    if (typeof out[field] === 'string') conclusion[field] = out[field];
  }
  if (typeof out.confidence === 'number') conclusion.confidence = out.confidence;
  if (Array.isArray(out.evidenceSourceIds)) {
    conclusion.evidenceSourceIds = (out.evidenceSourceIds as unknown[]).filter((item): item is string => typeof item === 'string');
  }
  return conclusion as Partial<QualityAnalysisConclusion>;
}

export type ConclusionParser = {
  /** 送入一个增量块，返回本次发生变化的结论帧（帧里带的是该结论目前为止的完整字段）。 */
  push(delta: string): ConclusionDraftEvent[];
  /** 到目前的完整原始参数，用于流结束后 JSON.parse 出权威结果。 */
  raw(): string;
  /** 增量解析出的结论快照，仅用于与权威结果对账。 */
  snapshot(): Partial<QualityAnalysisConclusion>[];
  /** 是否已经解析出 conclusions 数组（用于判断这段参数是不是诊断结构化输出）。 */
  hasConclusions(): boolean;
};

/** 逐块累积并解析结论数组；每个工具调用索引一个解析器，避免多次调用的参数串在一起。 */
export function createConclusionParser(): ConclusionParser {
  let buffer = '';
  let previous: Partial<QualityAnalysisConclusion>[] = [];
  let previousOpen = -1;
  let seenArray = false;

  const parse = () => {
    const scan = scanConclusions(buffer);
    seenArray = seenArray || scan.started;
    const items: Partial<QualityAnalysisConclusion>[] = [];
    for (const rawItem of scan.items) {
      try { items.push(JSON.parse(rawItem) as QualityAnalysisConclusion); }
      catch { items.push(parsePartialConclusion(rawItem)); }
    }
    const openIndex = scan.open === null ? -1 : items.length;
    if (scan.open !== null) items.push(parsePartialConclusion(scan.open));
    return { items, openIndex };
  };

  /** 只比较已经写出来的字段，避免未出现的字段被当成变化。 */
  const changed = (left?: Partial<QualityAnalysisConclusion>, right?: Partial<QualityAnalysisConclusion>) => {
    if (!left || !right) return true;
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of keys) {
      const a = (left as Record<string, unknown>)[key];
      const b = (right as Record<string, unknown>)[key];
      if (JSON.stringify(a) !== JSON.stringify(b)) return true;
    }
    return false;
  };

  return {
    push(delta) {
      buffer += delta;
      const { items, openIndex } = parse();
      const events: ConclusionDraftEvent[] = [];
      for (let index = 0; index < items.length; index += 1) {
        const isOpen = index === openIndex;
        // 内容没变就不推：模型写别的字段时（换行、逗号、其它键）不该惊动页面，
        // 否则一条结论会推上百帧，页面白白重渲染。open 标记随内容变化一起送达。
        if (!changed(previous[index], items[index])) continue;
        events.push({ index, conclusion: items[index], open: isOpen });
      }
      // 元素写完时文本不再变化，必须补一帧 open:false，否则页面会一直显示"生成中"。
      if (previousOpen >= 0 && previousOpen !== openIndex && !events.some((event) => event.index === previousOpen)) {
        events.push({ index: previousOpen, conclusion: previous[previousOpen] ?? {}, open: false });
      }
      previous = items;
      previousOpen = openIndex;
      return events.filter((event) => event.open || Object.keys(event.conclusion).length > 0);
    },
    raw: () => buffer,
    snapshot: () => previous.map((item) => ({ ...item })),
    hasConclusions: () => seenArray && previous.length > 0,
  };
}
