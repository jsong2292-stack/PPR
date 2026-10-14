/**
 * 把「演示告警数据」按新数据模型导入并核对结果。
 *
 * 流程（与页面上的操作一一对应）：
 *   1. 产品数据 → POST /api/quality/master/measurements（批次号与规格随检验记录落库，批次随即出现在视图里）
 *   2. 采集数据 → POST /api/quality/equipment/{设备ID}/batches/{批次号}/readings（按批次号挂到设备上）
 *   3. 核对每个批次的预警事件数 / 质量标记数是否与 演示结果对照表.json 一致
 *
 * 幂等：检验记录按 record_no、采集数据按 (设备, 批次号, 采集时间) 覆盖写入，重复执行不会产生脏数据。
 *
 * 用法：node scripts/demo-data/import-demo-data.mjs [--base http://127.0.0.1:9010]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';

const args = process.argv.slice(2);
const baseArgIndex = args.indexOf('--base');
const BASE = baseArgIndex >= 0 ? args[baseArgIndex + 1] : 'http://127.0.0.1:9010';
const USERNAME = process.env.DEMO_USERNAME || 'admin';
const PASSWORD = process.env.DEMO_PASSWORD || 'Admin@123';

const demoRoot = path.join(process.cwd(), '..', '测试数据', '演示告警数据');
const productDir = path.join(demoRoot, '产品数据');
const readingDir = path.join(demoRoot, '设备采集模拟数据');
const expectationFile = path.join(demoRoot, '演示结果对照表.json');

function readSheet(file) {
  const workbook = XLSX.readFile(file);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`登录失败：HTTP ${res.status}`);
  const cookie = res.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  if (!cookie) throw new Error('登录成功但没有拿到会话 Cookie');
  return cookie;
}

async function post(cookie, url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

async function main() {
  const cookie = await login();
  console.log(`已登录 ${BASE}`);

  const equipments = await fetch(`${BASE}/api/quality/master/equipment`, { headers: { Cookie: cookie } })
    .then((res) => res.json())
    .then((json) => json.data ?? []);
  const extruder = equipments.find((item) => String(item.type_name).includes('挤出'));
  const haulOff = equipments.find((item) => String(item.name).includes('牵引') || String(item.type_name).includes('牵引'));
  if (!extruder || !haulOff) throw new Error('没有找到挤出机 / 牵引机设备，请先确认设备台账主数据');
  console.log(`挤出机 #${extruder.id} ${extruder.name}；牵引机 #${haulOff.id} ${haulOff.name}`);

  // ---------- 1. 产品数据 ----------
  const productFiles = (await fs.readdir(productDir)).filter((name) => name.endsWith('.xlsx')).sort();
  for (const name of productFiles) {
    const rows = readSheet(path.join(productDir, name));
    let ok = 0;
    const failures = [];
    for (const [index, row] of rows.entries()) {
      const result = await post(cookie, '/api/quality/master/measurements', row);
      if (result.ok) ok += 1;
      else if (failures.length < 3) failures.push(`第 ${index + 2} 行：${result.json?.error ?? `HTTP ${result.status}`}`);
    }
    const batchNo = String(rows[0]?.batch_no ?? '?');
    console.log(`[产品数据] ${name} → 批次 ${batchNo}：成功 ${ok}/${rows.length}${failures.length ? `；失败 ${failures.join('；')}` : ''}`);
  }

  // ---------- 2. 采集数据 ----------
  const readingFiles = (await fs.readdir(readingDir)).filter((name) => name.endsWith('.xlsx')).sort();
  for (const name of readingFiles) {
    const match = name.match(/^(.+?)-(挤出机|牵引机)-/);
    if (!match) { console.log(`[采集数据] 跳过无法识别设备的文件：${name}`); continue; }
    const batchNo = match[1];
    const equipment = match[2] === '挤出机' ? extruder : haulOff;
    const rows = readSheet(path.join(readingDir, name));
    let ok = 0;
    const failures = [];
    for (const [index, row] of rows.entries()) {
      const result = await post(cookie, `/api/quality/equipment/${equipment.id}/batches/${encodeURIComponent(batchNo)}/readings`, row);
      if (result.ok) ok += 1;
      else if (failures.length < 3) failures.push(`第 ${index + 2} 行：${result.json?.error ?? `HTTP ${result.status}`}`);
    }
    console.log(`[采集数据] ${name} → ${equipment.name} / 批次 ${batchNo}：成功 ${ok}/${rows.length}${failures.length ? `；失败 ${failures.join('；')}` : ''}`);
  }

  // ---------- 3. 核对结果 ----------
  const expectation = JSON.parse(await fs.readFile(expectationFile, 'utf8'));
  const dashboard = await fetch(`${BASE}/api/quality/dashboard`, { headers: { Cookie: cookie } }).then((res) => res.json());
  const alerts = dashboard.alerts ?? [];
  const measurements = dashboard.measurements ?? [];
  console.log('\n=== 核对（事件数 / 质量标记）===');
  let mismatched = 0;
  for (const expected of expectation.batches) {
    const batchAlerts = alerts.filter((row) => String(row.batch_no) === expected.batch_no);
    // 预警事件表字段是 risk_level（历史字段名），这里两种都认。
    const levelOf = (row) => String(row.risk_level ?? row.level ?? '');
    const high = batchAlerts.filter((row) => levelOf(row) === 'high').length;
    const medium = batchAlerts.filter((row) => levelOf(row) === 'medium').length;
    const rows = measurements.filter((row) => String(row.batch_no) === expected.batch_no);
    const flaggedHigh = rows.filter((row) => String(row.quality_flag) === 'high').length;
    const flaggedMedium = rows.filter((row) => String(row.quality_flag) === 'medium').length;
    const pass = high === expected.high && medium === expected.medium
      && flaggedHigh === expected.flaggedHigh && flaggedMedium === expected.flaggedMedium
      && rows.length === expected.records;
    if (!pass) mismatched += 1;
    console.log(`${pass ? '✅' : '❌'} 批次 ${expected.batch_no}（${expected.label}）：事件 高${high}/中${medium}（期望 高${expected.high}/中${expected.medium}）｜标记 高${flaggedHigh}/中${flaggedMedium}（期望 高${expected.flaggedHigh}/中${expected.flaggedMedium}）｜记录 ${rows.length}（期望 ${expected.records}）`);
  }
  if (mismatched) {
    console.log(`\n有 ${mismatched} 个批次与对照表不一致。`);
    process.exitCode = 1;
  } else {
    console.log('\n全部批次与对照表一致。');
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
