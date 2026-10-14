#!/usr/bin/env node
/**
 * 浏览器端页面校验（CDP）：登录后逐个打开页面，把「渲染出来的文字 + 按钮 + 表格列头 + 控制台报错」抓回来做断言。
 *
 * 为什么不只截图：截图只能人眼看，脚本化断言能在每次改造后重跑，
 * 而且能直接证明「新增/编辑/删除按钮确实没了」「列头确实换了」这类回归点。
 *
 * 前提：本机有一个可用的调试浏览器，例如
 *   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9333 about:blank
 *
 * 用法：
 *   node scripts/cdp-check.mjs                     # 跑内置的批次号模型检查清单
 *   CDP_ENDPOINT=http://127.0.0.1:9333 node scripts/cdp-check.mjs
 */
const endpoint = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9333';
const BASE = process.env.PPR_BASE || 'http://127.0.0.1:9010';
const username = process.env.PPR_USER || 'admin';
const password = process.env.PPR_PASSWORD || 'Admin@123';

/** 每个页面要满足的条件：must 必须出现、mustNot 不能出现、列头必须出现。 */
const CHECKS = [
  {
    path: '/quality/data/batches',
    title: '批次总览',
    must: ['批次总览', '关联设备', '1号挤出机', '1号牵引机', '检验条数', '采集条数', '12121D0053'],
    mustNot: ['新增'],
    expectHeaders: ['批次号', '产品规格', '组别', '开始时间', '关联设备'],
  },
  {
    path: '/quality/data/products/1',
    title: '规格下的生产批次',
    must: ['生产批次', '12121D0050', '检验条数', '采集条数'],
    mustNot: ['新增'],
    expectHeaders: ['批次号', '生产组别', '检验条数', '关联设备'],
  },
  {
    path: '/quality/data/products/1/12121D0050',
    title: '批次下的检验记录（只导入）',
    must: ['检验记录', '共 6 条', 'Excel 导入', '本页只展示该批次下的检验记录'],
    mustNot: ['新增', '保存到数据库', '删除'],
    expectHeaders: ['检验时间', '外径 mm', '壁厚 mm', '不圆度 mm'],
  },
  {
    path: '/quality/data/equipment/1',
    title: '设备的批次列表',
    must: ['生产批次', '导入采集数据', '本设备采集条数', '12121D0050'],
    mustNot: ['新增'],
    expectHeaders: ['批次号', '本设备采集条数', '最近采集时间'],
  },
  {
    path: '/quality/data/equipment/1/12121D0050',
    title: '设备采集数据（只导入）',
    must: ['采集数据', 'Excel 导入', '温度(℃)', '压力(MPa)'],
    mustNot: ['新增', '保存到数据库'],
  },
  {
    path: '/quality/data/equipment/2',
    title: '牵引机的批次列表（按设备类型换采集项）',
    must: ['生产批次', '导入采集数据', '12121D0050'],
    mustNot: ['新增'],
  },
  {
    path: '/quality/data/equipment/2/12121D0050',
    title: '牵引机采集数据（列头随设备类型变化）',
    must: ['采集数据', '牵引速度(m/min)'],
    mustNot: ['新增', '温度'],
  },
  {
    path: '/quality/monitor',
    title: '质量工作台',
    must: ['12121D0053'],
  },
  {
    path: '/quality/diagnosis',
    title: '异常诊断',
    must: [],
  },
];

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
  if (message.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(`[exception] ${message.params.exceptionDetails.exception?.description?.slice(0, 200) ?? ''}`);
  }
});
const call = (method, params = {}) => new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const evaluate = async (expression) => (await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;

await call('Page.enable');
await call('Runtime.enable');
await call('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await sleep(500);
const login = await evaluate(`fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:${JSON.stringify(username)},password:${JSON.stringify(password)},remember:true})}).then(r=>r.json())`);
if (!login?.user && !login?.success) {
  console.error('登录失败：', JSON.stringify(login));
  process.exit(1);
}

const snapshot = () => evaluate(`(() => ({
  text: document.body.innerText,
  buttons: [...document.querySelectorAll('button')].map((b) => b.innerText.trim()).filter(Boolean),
  headers: [...document.querySelectorAll('th')].map((th) => th.innerText.trim()),
  toasts: [...document.querySelectorAll('[data-sonner-toast], .toast')].map((t) => t.innerText.trim()),
}))()`);

/** --dump <path>：只打开该页面并打印渲染文字，便于人工确认为什么断言没过。 */
const dumpIndex = process.argv.indexOf('--dump');
if (dumpIndex >= 0) {
  const path = process.argv[dumpIndex + 1];
  await call('Page.navigate', { url: `${BASE}${path}` });
  await sleep(2600);
  const snapshotResult = await snapshot();
  console.log(snapshotResult?.text);
  socket.close();
  process.exit(0);
}

let failed = 0;
for (const check of CHECKS) {
  consoleErrors.length = 0;
  await call('Page.navigate', { url: `${BASE}${check.path}` });
  await sleep(2600);
  const snapshotResult = await snapshot();
  const text = String(snapshotResult?.text ?? '');
  const buttons = snapshotResult?.buttons ?? [];
  const headers = snapshotResult?.headers ?? [];
  const problems = [];

  for (const needle of check.must) if (!text.includes(needle)) problems.push(`缺少「${needle}」`);
  for (const needle of check.mustNot ?? []) if (buttons.some((b) => b === needle || b.includes(needle))) problems.push(`不该出现按钮「${needle}」（实际按钮：${buttons.join('/')}）`);
  for (const header of check.expectHeaders ?? []) if (!headers.includes(header)) problems.push(`缺少列头「${header}」（实际：${headers.join(',')}）`);
  if (text.includes('404') && text.includes('could not be found')) problems.push('页面 404');
  if (snapshotResult?.toasts?.length) problems.push(`出现提示：${snapshotResult.toasts.join(' | ')}`);
  if (consoleErrors.length) problems.push(`控制台报错：${consoleErrors.slice(0, 2).join(' | ')}`);

  if (problems.length) { failed += 1; console.log(`❌ ${check.path}（${check.title}）\n   - ${problems.join('\n   - ')}`); }
  else console.log(`✅ ${check.path}（${check.title}）｜按钮：${buttons.join('/') || '无'}｜列头：${headers.slice(0, 4).join(',')}`);
}

console.log(failed ? `\n${failed}/${CHECKS.length} 个页面未通过` : `\n${CHECKS.length}/${CHECKS.length} 个页面通过`);
socket.close();
process.exit(failed ? 1 : 0);
