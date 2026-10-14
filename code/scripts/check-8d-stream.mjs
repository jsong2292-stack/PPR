#!/usr/bin/env node
/**
 * 验证 8D 生成的 `draft` 帧是**真流式**（模型边写边推），而不是生成完再一次性下发。
 *
 * 判据（缺一不可）：
 *   1) 同一个字段会收到多个 draft 帧，且文本长度随时间单调增长 → 不是一次性下发；
 *   2) draft 帧的时刻分布在 result 帧之前，且首帧与末帧之间有明显时间跨度；
 *   3) 各字段的开始时刻互不相同（模型依次写 D1→D8），呈现真实的字段切换节奏；
 *   4) 流式收到的最终文本与落库内容逐字段一致 → 展示与落库没有偏差。
 *
 * 用法：node scripts/check-8d-stream.mjs [analysisId]
 * 环境变量：PPR_BASE / PPR_USER / PPR_PASSWORD
 */
const BASE = process.env.PPR_BASE || 'http://localhost:9010';
const username = process.env.PPR_USER || 'admin';
const password = process.env.PPR_PASSWORD || 'Admin@123';
const analysisId = Number(process.argv[2] || process.env.PPR_ANALYSIS_ID || 21);

const fail = [];
const check = (condition, message) => { (condition ? console.log(`✅ ${message}`) : (fail.push(message), console.log(`❌ ${message}`))); };

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password, remember: true }),
});
if (!login.ok) throw new Error(`登录失败：HTTP ${login.status}`);
const cookie = (login.headers.getSetCookie?.() || []).map((item) => item.split(';')[0]).join('; ');

const startedAt = Date.now();
const response = await fetch(`${BASE}/api/quality/reports/generate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', cookie },
  body: JSON.stringify({ analysisId, regenerate: true }),
});
if (!response.ok || !response.body) throw new Error(`无法建立流：HTTP ${response.status}`);

/** field → [{at, length}]，用于判断是否为真流式。 */
const timeline = new Map();
let draftFrames = 0;
let resultAt = null;
let result = null;
let errorMessage = '';
let buffer = '';

const handle = (block) => {
  if (!block.trim()) return;
  let name = 'progress';
  const data = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) name = line.slice(6).trim();
    if (line.startsWith('data:')) data.push(line.slice(5).trim());
  }
  if (!data.length) return;
  const payload = JSON.parse(data.join('\n'));
  if (name === 'draft') {
    draftFrames += 1;
    const at = Date.now() - startedAt;
    const text = String(payload.text || '');
    const list = timeline.get(payload.field) || [];
    list.push({ at, length: text.length, open: Boolean(payload.open), text });
    timeline.set(payload.field, list);
  } else if (name === 'result') {
    resultAt = Date.now() - startedAt;
    result = payload;
  } else if (name === 'error') {
    errorMessage = payload.message || '生成失败';
  }
};

const reader = response.body.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
  const blocks = buffer.split('\n\n');
  buffer = blocks.pop() || '';
  blocks.forEach(handle);
  if (done) break;
}
if (buffer.trim()) handle(buffer);

if (errorMessage) { console.log(`❌ 生成失败：${errorMessage}`); process.exit(1); }
console.log(`draft 帧合计 ${draftFrames} 个 | result 帧在 ${resultAt} ms\n`);

const fields = [...timeline.keys()];
check(fields.length >= 8, `收到 ${fields.length} 个字段的流式内容（title + D1–D8）`);
check(draftFrames > 0 && resultAt !== null && Math.max(...[...timeline.values()].flat().map((item) => item.at)) < resultAt,
  'draft 帧全部早于 result 帧（边生成边推送，不是生成完再下发）');

console.log('\n字段  帧数   首帧(ms)   末帧(ms)   跨度(ms)   最终字数   单调增长');
let allGrow = true;
let allMultiFrame = true;
for (const field of fields) {
  const list = timeline.get(field);
  const grows = list.every((item, index) => index === 0 || item.length >= list[index - 1].length);
  if (!grows) allGrow = false;
  if (list.length < 3) allMultiFrame = false;
  console.log(`${field.padEnd(6)}${String(list.length).padStart(4)}${String(list[0].at).padStart(10)}${String(list[list.length - 1].at).padStart(11)}${String(list[list.length - 1].at - list[0].at).padStart(11)}${String(list[list.length - 1].length).padStart(11)}   ${grows ? '是' : '否'}`);
}

check(allGrow, '每个字段的文本长度随时间单调不减（真实增量累积）');
check(allMultiFrame, '每个字段都有多个中间态帧（不是只推最终值）');

const firstAt = Math.min(...[...timeline.values()].flat().map((item) => item.at));
const lastAt = Math.max(...[...timeline.values()].flat().map((item) => item.at));
check(lastAt - firstAt > 3000, `首帧到末帧跨度 ${lastAt - firstAt} ms，出字过程持续可见`);

const starts = fields.map((field) => ({ field, at: timeline.get(field)[0].at })).sort((a, b) => a.at - b.at);
const distinct = new Set(starts.map((item) => Math.round(item.at / 100))).size;
check(distinct >= 5, `字段开始时刻互不相同，呈现依次出字：${starts.map((item) => `${item.field}@${item.at}ms`).join(' → ')}`);

// 与落库内容对账：流式展示的最终文本必须与数据库里的报告逐字一致
if (result?.data) {
  const saved = result.data;
  const drift = fields.filter((field) => {
    const list = timeline.get(field);
    const last = list[list.length - 1];
    return last.text !== String(saved[field] ?? '');
  });
  check(drift.length === 0, `流式最终文本与落库内容逐字一致${drift.length ? `（不一致：${drift.join('、')}）` : ''}`);
  console.log(`\n落库报告：${saved.report_no} · ${saved.generation_engine} · ${saved.model_name} · ${saved.latency_ms} ms`);
}

console.log(`\n失败 ${fail.length} 项`);
process.exit(fail.length ? 1 : 0);
