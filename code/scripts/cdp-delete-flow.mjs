#!/usr/bin/env node
/**
 * 端到端跑一遍「批次总览 → 删除批次 → 二次确认 → 连带清理」的真实交互（CDP 驱动浏览器）。
 *
 * 为什么单独写：这是全项目唯一会「不可恢复地连带删除」的入口，
 * 也是改造前报外键错误（Cannot delete or update a parent row）的地方，
 * 必须证明：普通点击先给出连带影响说明 → 取消不动数据 → 确认后才真的按批次号清理干净。
 *
 * 安全：只操作自己创建的临时批次号（默认 ZZ-UI-DEL），跑完即删，不碰演示数据。
 *
 * 用法：node scripts/cdp-delete-flow.mjs [--batch ZZ-UI-DEL]
 */
const endpoint = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9333';
const BASE = process.env.PPR_BASE || 'http://127.0.0.1:9010';
const username = process.env.PPR_USER || 'admin';
const password = process.env.PPR_PASSWORD || 'Admin@123';

const args = process.argv.slice(2);
const index = args.indexOf('--batch');
const BATCH = index >= 0 ? args[index + 1] : 'ZZ-UI-DEL';

// ---------- 先用接口造一个临时批次（2 条检验记录） ----------
const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password, remember: true }),
});
const cookie = loginRes.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
const api = (method, path, body) => fetch(`${BASE}${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: body === undefined ? undefined : JSON.stringify(body),
}).then(async (res) => ({ status: res.status, json: await res.json().catch(() => null) }));

for (const suffix of ['R1', 'R2']) {
  const created = await api('POST', '/api/quality/master/measurements', {
    record_no: `${BATCH}-${suffix}`, sample_no: `S-${suffix}`, batch_no: BATCH, spec_code: 'SPEC-25X4.2',
    production_group: '测试班', batch_start_time: '2026-11-22 06:00:00',
    inspect_time: suffix === 'R1' ? '2026-11-22 08:00:00' : '2026-11-22 09:00:00',
    outer_diameter_mm: 25.2, min_wall_thickness_mm: 4.4,
  });
  if (!created.json?.data) { console.error(`❌ 造临时批次失败：${JSON.stringify(created)}`); process.exit(1); }
}
console.log(`已造出临时批次 ${BATCH}（2 条检验记录）`);

// ---------- CDP ----------
const target = await fetch(`${endpoint}/json/new?${encodeURIComponent(`${BASE}/login`)}`, { method: 'PUT' }).then((res) => res.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let nextId = 1;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data));
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  }
});
const call = (method, params = {}) => new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const evaluate = async (expression) => (await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;
const clickElement = async (expression) => {
  const rect = await evaluate(`(() => { const el = ${expression}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!rect) return false;
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(rect.x), y: Math.round(rect.y), button: 'left', buttons: 1, clickCount: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(rect.x), y: Math.round(rect.y), button: 'left', buttons: 0, clickCount: 1 });
  return true;
};
const dialogText = () => evaluate(`document.querySelector('[role="alertdialog"], [role="dialog"]')?.innerText ?? ''`);
const batchExists = async () => {
  const list = await api('GET', '/api/quality/master/batches');
  return (list.json?.data ?? []).some((row) => row.batch_no === BATCH);
};

await call('Page.enable');
await call('Runtime.enable');
await call('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await sleep(400);
await evaluate(`fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:${JSON.stringify(username)},password:${JSON.stringify(password)},remember:true})}).then(r=>r.json())`);

await call('Page.navigate', { url: `${BASE}/quality/data/batches` });
await sleep(2800);
if (!(await evaluate(`document.body.innerText.includes(${JSON.stringify(BATCH)})`))) {
  console.error(`❌ 批次总览里没有出现临时批次 ${BATCH}`);
  process.exit(1);
}
console.log('✅ 临时批次已出现在批次总览');

// 点这一行的删除图标（行内最后一个按钮）
const rowDeleteClicked = await clickElement(`(() => {
  const row = [...document.querySelectorAll('tr')].find((tr) => tr.innerText.includes(${JSON.stringify(BATCH)}));
  const buttons = row ? [...row.querySelectorAll('button')] : [];
  return buttons[buttons.length - 1] ?? null;
})()`);
if (!rowDeleteClicked) { console.error('❌ 没找到行内删除按钮'); process.exit(1); }
await sleep(900);

const first = await dialogText();
if (!first.includes('清理批次') || !first.includes(BATCH) || !first.includes('检验记录')) {
  console.error(`❌ 首次确认弹窗文案不符合预期：${first.slice(0, 200)}`);
  process.exit(1);
}
console.log(`✅ 首次确认弹窗：${first.split('\n').slice(0, 2).join(' / ')}`);

// 取消 → 数据必须还在
const cancelled = await clickElement(`[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '取消')`);
if (!cancelled) { console.error('❌ 没找到取消按钮'); process.exit(1); }
await sleep(1200);
if (await batchExists()) console.log('✅ 取消后批次仍在（没有误删）');
else { console.error('❌ 取消后批次被删掉了'); process.exit(1); }

// 再点一次删除 → 确认 → 应弹出「还有关联数据 / 一并删除」
const again = await clickElement(`(() => {
  const row = [...document.querySelectorAll('tr')].find((tr) => tr.innerText.includes(${JSON.stringify(BATCH)}));
  const buttons = row ? [...row.querySelectorAll('button')] : [];
  return buttons[buttons.length - 1] ?? null;
})()`);
if (!again) { console.error('❌ 第二次没找到删除按钮'); process.exit(1); }
await sleep(900);
const confirmFirst = await clickElement(`[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '删除')`);
if (!confirmFirst) { console.error('❌ 没找到「删除」确认按钮'); process.exit(1); }
await sleep(1600);

const second = await dialogText();
if (!second.includes('还有关联数据') || !second.includes('一并删除')) {
  console.error(`❌ 二次确认弹窗文案不符合预期：${second.slice(0, 300)}`);
  process.exit(1);
}
console.log(`✅ 二次确认弹窗：${second.replace(/\n+/g, ' / ').slice(0, 160)}`);

const cascade = await clickElement(`[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '一并删除')`);
if (!cascade) { console.error('❌ 没找到「一并删除」按钮'); process.exit(1); }
await sleep(2500);

const toastText = await evaluate(`[...document.querySelectorAll('[data-sonner-toast], .toast')].map((t) => t.innerText.trim()).join(' | ')`);
const stillThere = await api('GET', `/api/quality/master/measurements?batch_no=${encodeURIComponent(BATCH)}`);
const measurements = stillThere.json?.data?.length ?? -1;
if (await batchExists() || measurements !== 0) {
  console.error(`❌ 级联删除没有清理干净：批次仍存在=${await batchExists()}，检验记录=${measurements}`);
  process.exit(1);
}
console.log(`✅ 一并删除后：批次消失、检验记录 0 条（提示：${toastText || '无'}）`);

// 兜底清理（万一上面留下了东西）
await api('DELETE', `/api/quality/master/batches?id=${encodeURIComponent(BATCH)}&cascade=1`);
const alerts = await api('GET', '/api/quality/dashboard');
console.log(`收尾：当前库内批次相关事件 ${(alerts.json?.alerts ?? []).length} 条`);
socket.close();
