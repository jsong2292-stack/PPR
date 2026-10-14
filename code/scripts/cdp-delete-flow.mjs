#!/usr/bin/env node
/**
 * 端到端验证「按来源清理」：产品侧与设备侧的清理互不牵连（CDP 驱动真实浏览器点击）。
 *
 * 背景：批次不是表，`ppr_batch` 是按批次号把产品检验记录与设备采集数据聚合出来的视图，
 * 两边没有从属关系。所以清理必须分开，这个脚本就是用来证明「真的分开了」：
 *
 *   1. 批次总览页的行 → 只清理该批次的【检验记录】（连带其预警事件），采集数据必须原封不动；
 *   2. 设备台账页的行 → 只清理【本设备】该批次的采集数据，产品数据与【其他设备】的数据必须原封不动；
 *   3. 两处清理前都先给真实条数、取消则一个字节都不删。
 *
 * 安全：只操作自己创建的临时批次号（默认 ZZ-UI-DEL）与其采集数据，跑完即清，不碰演示数据。
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

// ---------- 用接口造临时数据：2 条检验记录 + 两台设备各 2 条采集数据 ----------
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

const EQUIPMENT = [
  { id: 1, name: '1号挤出机', metrics: { temperature_c: 205.5, pressure_mpa: 18.2 } },
  { id: 2, name: '1号牵引机', metrics: { haul_off_speed_mpm: 3.55 } },
];
const created = { measurements: 0, readings: {} };

const countMeasurements = async () => (await api('GET', `/api/quality/master/measurements?batch_no=${encodeURIComponent(BATCH)}`)).json?.data?.length ?? 0;
const countReadings = async (equipmentId) => {
  const result = await api('GET', `/api/quality/equipment/${equipmentId}/batches/${encodeURIComponent(BATCH)}/readings`);
  return result.status === 200 ? (result.json?.readings?.length ?? 0) : 0;
};
const batchInOverview = async () => {
  const list = await api('GET', '/api/quality/master/batches');
  return (list.json?.data ?? []).find((row) => row.batch_no === BATCH) ?? null;
};

for (const suffix of ['R1', 'R2']) {
  const result = await api('POST', '/api/quality/master/measurements', {
    record_no: `${BATCH}-${suffix}`, sample_no: `S-${suffix}`, batch_no: BATCH, spec_code: 'SPEC-25X4.2',
    production_group: '测试班', batch_start_time: '2026-11-22 06:00:00',
    inspect_time: suffix === 'R1' ? '2026-11-22 08:00:00' : '2026-11-22 09:00:00',
    outer_diameter_mm: 25.2, min_wall_thickness_mm: 4.4,
  });
  if (!result.json?.data) { console.error(`❌ 造检验记录失败：${JSON.stringify(result)}`); process.exit(1); }
  created.measurements += 1;
}
for (const equipment of EQUIPMENT) {
  created.readings[equipment.id] = 0;
  for (const hour of [10, 11]) {
    const result = await api('POST', `/api/quality/equipment/${equipment.id}/batches/${encodeURIComponent(BATCH)}/readings`, {
      collect_time: `2026-11-22 ${hour}:00:00`, ...equipment.metrics,
    });
    if (result.status !== 201) { console.error(`❌ 造采集数据失败（${equipment.name}）：${JSON.stringify(result)}`); process.exit(1); }
    created.readings[equipment.id] += 1;
  }
}
console.log(`已造临时数据：批次 ${BATCH}｜检验记录 ${created.measurements} 条｜${EQUIPMENT.map((e) => `${e.name} ${created.readings[e.id]} 条`).join('、')}`);

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
const clickRowTrash = (batchNo) => clickElement(`(() => {
  const row = [...document.querySelectorAll('tr')].find((tr) => tr.innerText.includes(${JSON.stringify(batchNo)}));
  const buttons = row ? [...row.querySelectorAll('button')] : [];
  return buttons[buttons.length - 1] ?? null;
})()`);
const clickButtonByText = (text) => clickElement(`[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === ${JSON.stringify(text)})`);

await call('Page.enable');
await call('Runtime.enable');
await call('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await sleep(400);
await evaluate(`fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:${JSON.stringify(username)},password:${JSON.stringify(password)},remember:true})}).then(r=>r.json())`);

let failed = false;
const check = (ok, label, extra = '') => {
  if (ok) console.log(`✅ ${label}`);
  else { failed = true; console.error(`❌ ${label}${extra ? `（${extra}）` : ''}`); }
};

// ================= 1) 批次总览页：只清理检验记录 =================
await call('Page.navigate', { url: `${BASE}/quality/data/batches` });
await sleep(2800);
check(await evaluate(`document.body.innerText.includes(${JSON.stringify(BATCH)})`), '临时批次出现在批次总览');

await clickRowTrash(BATCH);
await sleep(1000);
const overviewDialog = await dialogText();
check(overviewDialog.includes('清理本批检验记录'), '批次总览弹出「清理本批检验记录」确认框', overviewDialog.slice(0, 60));
check(/有 2 条检验记录/.test(overviewDialog) && /不影响设备采集数据/.test(overviewDialog), '确认框给出检验记录条数并写明不影响采集数据', overviewDialog.replace(/\n+/g, ' ').slice(0, 160));

await clickButtonByText('取消');
await sleep(1200);
check(await countMeasurements() === 2, '取消后检验记录一条没删');
check(await countReadings(1) === 2, '取消后设备采集数据一条没删');

await clickRowTrash(BATCH);
await sleep(1000);
await clickButtonByText('确认清理');
await sleep(2500);
check(await countMeasurements() === 0, '确认后检验记录已清空');
check(await countReadings(1) === 2 && await countReadings(2) === 2, '设备采集数据完全没被动（两台设备各 2 条仍在）');
const afterMeasurements = await batchInOverview();
check(Boolean(afterMeasurements), '批次仍留在总览里（因为采集数据还在）', JSON.stringify(afterMeasurements ?? {}));
check(Number(afterMeasurements?.reading_count ?? 0) === 4 && Number(afterMeasurements?.measurement_count ?? -1) === 0, '总览里显示检验 0 条 / 采集 4 条');

// ================= 2) 设备台账页：只清理本设备采集数据 =================
await call('Page.navigate', { url: `${BASE}/quality/data/equipment/1` });
await sleep(2800);
check(await evaluate(`document.body.innerText.includes(${JSON.stringify(BATCH)})`), '临时批次出现在 1号挤出机 的批次列表');

await clickRowTrash(BATCH);
await sleep(1000);
const equipmentDialog = await dialogText();
check(equipmentDialog.includes('清理本设备该批次的采集数据'), '设备页弹出「清理本设备该批次的采集数据」确认框', equipmentDialog.slice(0, 60));
check(/1号挤出机/.test(equipmentDialog) && /2 条采集数据/.test(equipmentDialog) && /也不影响同一批次下其他设备的采集数据/.test(equipmentDialog), '确认框写明只清本设备、不牵连产品与其他设备', equipmentDialog.replace(/\n+/g, ' ').slice(0, 200));

await clickButtonByText('取消');
await sleep(1200);
check(await countReadings(1) === 2, '取消后本设备采集数据仍在');

await clickRowTrash(BATCH);
await sleep(1000);
await clickButtonByText('确认清理');
await sleep(2500);
check(await countReadings(1) === 0, '确认后本设备该批次采集数据已清空');
check(await countReadings(2) === 2, '同批次下 1号牵引机 的采集数据没被动');
check(await batchInOverview() !== null, '批次因牵引机数据仍在而保留在总览里');

// ================= 3) 收尾：清掉剩下的牵引机数据，批次应自动消失 =================
const cleanup = await api('DELETE', `/api/quality/equipment/2/batches/${encodeURIComponent(BATCH)}/readings?confirm=1`);
check(cleanup.status === 200, '清理牵引机采集数据成功');
check(await batchInOverview() === null, '两边都清空后，批次自动从视图里消失（批次不落表）');
check(await countMeasurements() === 0, '没有残留临时检验记录');

console.log(failed ? '\n存在未通过项' : '\n全部通过：产品侧与设备侧的清理互不牵连');
socket.close();
process.exit(failed ? 1 : 0);
