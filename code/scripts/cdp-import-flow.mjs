#!/usr/bin/env node
/**
 * 端到端跑一遍「设备台账 → 选批次号 → 导入采集数据」的真实交互（CDP 驱动浏览器）。
 *
 * 为什么单独写：这是改造后新增的核心流程（采集数据必须挂到某个批次号上），
 * 只验证接口不够——还要证明「弹窗里能选到批次号」「选了之后文件真的按这个批次号落库」。
 *
 * 幂等安全：默认对已有批次重导同一个文件（按 `(equipment_id, batch_no, collect_time)` 覆盖），
 * 不新增数据、不改动演示数据规模。
 *
 * 前提：本机有调试浏览器（--remote-debugging-port=9333）。
 * 用法：
 *   node scripts/cdp-import-flow.mjs
 *   node scripts/cdp-import-flow.mjs --batch 12121D0053 --file ../测试数据/演示告警数据/设备采集模拟数据/12121D0053-挤出机-温度压力.xlsx
 */
import path from 'node:path';

const endpoint = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9333';
const BASE = process.env.PPR_BASE || 'http://127.0.0.1:9010';
const username = process.env.PPR_USER || 'admin';
const password = process.env.PPR_PASSWORD || 'Admin@123';

const args = process.argv.slice(2);
const argValue = (name, fallback) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
const BATCH = argValue('--batch', '12121D0053');
const FILE = path.resolve(argValue('--file', path.join(process.cwd(), '..', '测试数据', '演示告警数据', '设备采集模拟数据', `${BATCH}-挤出机-温度压力.xlsx`)));

const target = await fetch(`${endpoint}/json/new?${encodeURIComponent(`${BASE}/login`)}`, { method: 'PUT' }).then((res) => res.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });

let nextId = 1;
const pending = new Map();
const consoleErrors = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data));
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    consoleErrors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ').slice(0, 200));
  }
});
const call = (method, params = {}) => new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const evaluate = async (expression) => (await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;

await call('Page.enable');
await call('Runtime.enable');
await call('DOM.enable');
await call('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await sleep(500);
const login = await evaluate(`fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:${JSON.stringify(username)},password:${JSON.stringify(password)},remember:true})}).then(r=>r.json())`);
if (!login?.user && !login?.success) { console.error('登录失败：', JSON.stringify(login)); process.exit(1); }
console.log(`已登录，准备导入 ${FILE} → 批次 ${BATCH}`);

await call('Page.navigate', { url: `${BASE}/quality/data/equipment/1` });
await sleep(2600);

const opened = await evaluate(`(() => { const button = [...document.querySelectorAll('button')].find((b) => b.innerText.includes('导入采集数据')); if (!button) return false; button.click(); return true; })()`);
if (!opened) { console.error('❌ 没找到「导入采集数据」按钮'); process.exit(1); }
await sleep(900);

const dialogText = await evaluate(`document.querySelector('[role="dialog"]')?.innerText ?? ''`);
if (!dialogText.includes('批次号')) { console.error(`❌ 弹窗内容不符合预期：${dialogText.slice(0, 200)}`); process.exit(1); }
console.log(`✅ 弹窗已打开：${dialogText.split('\n').slice(0, 3).join(' / ')}`);

/** 用 CDP 派发真实鼠标点击（Radix 的交互靠 pointer 事件，程序化 .click() 不生效）。 */
const clickElement = async (expression) => {
  const rect = await evaluate(`(() => { const el = ${expression}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!rect) return false;
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(rect.x), y: Math.round(rect.y), button: 'left', buttons: 1, clickCount: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(rect.x), y: Math.round(rect.y), button: 'left', buttons: 0, clickCount: 1 });
  return true;
};

// 打开批次号下拉（Radix Select），列出候选
const comboboxOpened = await clickElement(`document.querySelector('[role="dialog"] [role="combobox"]')`);
if (!comboboxOpened) { console.error('❌ 没找到批次号下拉框'); process.exit(1); }
await sleep(900);
const options = await evaluate(`[...document.querySelectorAll('[role="option"]')].map((o) => o.innerText.trim())`);
console.log(`✅ 候选批次号：${options.join(' | ')}`);
if (!options.some((option) => option.includes(BATCH))) { console.error(`❌ 候选里没有 ${BATCH}`); process.exit(1); }

const optionPicked = await clickElement(`[...document.querySelectorAll('[role="option"]')].find((o) => o.innerText.includes(${JSON.stringify(BATCH)}))`);
if (!optionPicked) { console.error('❌ 找不到批次号选项（下拉可能已关闭）'); process.exit(1); }
await sleep(900);
const selectedText = await evaluate(`document.querySelector('[role="dialog"] [role="combobox"]')?.innerText.trim() ?? ''`);
if (!selectedText.includes(BATCH)) { console.error(`❌ 批次号没有真正选中（下拉框显示：${selectedText || '空'}）`); process.exit(1); }
console.log(`✅ 已选择批次号 ${selectedText}`);

// 通过 CDP 把文件塞进弹窗里的 file input（等价于用户选文件）
const documentNode = await call('DOM.getDocument', { depth: -1 });
const inputNode = await call('DOM.querySelector', { nodeId: documentNode.root.nodeId, selector: '[role="dialog"] input[type=file]' });
if (!inputNode.nodeId) { console.error('❌ 弹窗里没有 file input'); process.exit(1); }
await call('DOM.setFileInputFiles', { nodeId: inputNode.nodeId, files: [FILE] });
console.log('已选择文件，等待导入完成…');
let result = { toasts: [], dialogOpen: true };
for (let attempt = 0; attempt < 15; attempt += 1) {
  await sleep(1000);
  result = await evaluate(`(() => ({
    toasts: [...document.querySelectorAll('[data-sonner-toast], .toast')].map((t) => t.innerText.trim()),
    dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
  }))()`);
  if (result.toasts.length) break;
}
console.log(`导入提示：${result.toasts.join(' | ') || '（无）'}`);
if (consoleErrors.length) console.log(`控制台报错：${consoleErrors.slice(0, 3).join(' | ')}`);
const ok = result.toasts.some((toast) => toast.includes('成功 12 / 12') && toast.includes(BATCH));
if (!ok) {
  console.error('❌ 未看到预期的导入成功提示');
  process.exit(1);
}
const row = await evaluate(`fetch('/api/quality/master/batches').then((r) => r.json()).then((j) => { const b = (j.data || []).find((x) => x.batch_no === ${JSON.stringify(BATCH)}); return b ? { batch_no: b.batch_no, reading_count: b.reading_count, extruder: b.extruder_name } : null; })`);
console.log(`✅ 导入成功，批次 ${row?.batch_no} 现有采集数据 ${row?.reading_count} 条，关联设备 ${row?.extruder ?? '—'}`);
socket.close();
