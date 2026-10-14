/**
 * 校验「告警演示 Excel」：走真实导入路径写本地 MySQL，再用真实判定引擎复算，比对设计意图。
 *
 * 为什么要走真实路径：生成脚本里的自检只是复刻规则算数，证明不了
 *   「表头能不能被导入逻辑识别」「decimal/datetime 精度会不会丢」「唯一键会不会撞」
 * 这三件事。这个脚本直接用项目自己的模块：
 *   - XLSX + sheet_to_json（与 DataManager.importFile 同一读法，只读第一个工作表）
 *   - resolveMeasurementBatch（与 POST /api/quality/master/measurements 同一批次解析）
 *   - RESOURCE_CONFIG.measurements + normalizeValue（与接口同一份列白名单与规范化）
 *   - evaluateAlerts / planBatch（真实判定引擎，写 ppr_alert_event 并回写 quality_flag）
 *
 * 安全说明：本地 system_config 里企微推送是开启的且配有真实 Webhook，脚本会在判定前把
 * wecom_alert_enabled 临时改成 false，并在 finally 里按原值恢复，保证不会真的往群里发消息。
 *
 * 用法（在 PPR/code 目录下）：
 *   npx tsx scripts/demo-data/verify-alert-demo.mts              # 校验后清理
 *   npx tsx scripts/demo-data/verify-alert-demo.mts --keep       # 保留数据，便于页面点检
 *   npx tsx scripts/demo-data/verify-alert-demo.mts --dir=/tmp/x --keep
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as dotenv from 'dotenv';
import type { MeasurementRow } from '@/lib/quality-analysis/alert-engine';

process.env.WECOM_ALERT_ENABLED = 'false';
process.env.WECOM_ALERT_WEBHOOK = '';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
// here = PPR/code/scripts/demo-data → 上溯两级回到 PPR/code
const repoRoot = resolve(here, '../..');

// 环境必须先加载：mysql-client 的 loadEnv 只找 .env，找不到会去走平台侧注入。
for (const file of ['.env.local', '.env']) {
  const candidate = join(repoRoot, file);
  if (existsSync(candidate)) dotenv.config({ path: candidate, quiet: true, override: file === '.env.local' });
}
if (!process.env.MYSQL_URL && !process.env.DATABASE_URL) {
  console.error('未找到 MYSQL_URL / DATABASE_URL：请确认 PPR/code/.env.local 存在且可读。');
  process.exit(1);
}

interface DatasetMetric { code: string; label: string; suffix: string; key: 'outer_diameter_mm' | 'min_wall_thickness_mm' | 'ovality_mm'; band: string }
interface DatasetExpect {
  high: number; medium: number; normal: number;
  mediumFlaggedRecords: number; highFlaggedRecords: number; note: string;
}
interface DatasetBatch {
  batch_no: string; label: string; scenario: string; purpose: string;
  rows: MeasurementRow[]; expect: DatasetExpect;
}
interface Dataset {
  METRICS: DatasetMetric[];
  buildBatches: () => DatasetBatch[];
}
interface AlertRow extends Record<string, unknown> {
  event_no: string; metric_code: string; risk_level: string; rule_code: string;
  threshold_text: string; status: string; record_no: string;
}
interface DbClient {
  query: (sql: string, params?: unknown[]) => Promise<{ affectedRows?: number }>;
  queryOne: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T | null>;
  queryAll: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
}

const dataset = require('./alert-demo-dataset.js') as Dataset;
const XLSX = require('xlsx');

const dirArg = process.argv.find((arg) => arg.startsWith('--dir='));
const DEFAULT_DIR = resolve(repoRoot, '../测试数据/演示告警数据');
const OUT_DIR = dirArg ? resolve(dirArg.slice('--dir='.length)) : DEFAULT_DIR;
const PRODUCT_DIR = join(OUT_DIR, '产品数据');
const READING_DIR = join(OUT_DIR, '设备采集模拟数据');
const KEEP = process.argv.includes('--keep');

const failures: string[] = [];
let checks = 0;

function check(condition: unknown, message: string): boolean {
  checks += 1;
  if (!condition) failures.push(message);
  return Boolean(condition);
}

/** 与 DataManager.importFile 完全一致的读法：只读第一个工作表，defval 为空串。 */
function readFirstSheet(filePath: string): Record<string, unknown>[] {
  const workbook = XLSX.read(readFileSync(filePath));
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];
}

function findProductFile(batchNo: string): string {
  const name = readdirSync(PRODUCT_DIR).find((file) => file.startsWith(`测试数据-${batchNo}-`));
  if (!name) throw new Error(`找不到批次 ${batchNo} 的产品数据文件`);
  return join(PRODUCT_DIR, name);
}

/**
 * 精确清理演示批次及其下游数据。
 * ppr_batch 是视图（批次不落表），所以只能按批次号删下游数据：事件 → 采集 → 检验；
 * 删完下游数据后，该批次号自然从视图里消失，不需要（也不能）再删批次本身。
 */
async function cleanup(dbClient: DbClient, batchNos: string[]): Promise<void> {
  if (!batchNos.length) return;
  const placeholders = batchNos.map(() => '?').join(',');
  await dbClient.query(
    `DELETE a FROM ppr_alert_event a JOIN ppr_product_measurement m ON m.id=a.measurement_id
     WHERE m.batch_no IN (${placeholders})`, batchNos);
  await dbClient.query(`DELETE FROM ppr_equipment_reading WHERE batch_no IN (${placeholders})`, batchNos);
  await dbClient.query(`DELETE FROM ppr_product_measurement WHERE batch_no IN (${placeholders})`, batchNos);
}

async function main(): Promise<void> {
  if (!existsSync(PRODUCT_DIR)) {
    console.error(`找不到产品数据目录：${PRODUCT_DIR}\n先运行 node scripts/demo-data/generate-alert-demo.js`);
    process.exit(1);
  }

  const { dbClient, RESOURCE_CONFIG, normalizeValue } = await import('@/lib/quality');
  const { resolveMeasurementBatch } = await import('@/lib/quality-import');
  const { evaluateAlerts, planBatch } = await import('@/lib/quality-analysis/alert-engine');
  const { getConfigValue } = await import('@/lib/system-config');
  const db = dbClient as unknown as DbClient;

  const batches = dataset.buildBatches();
  const batchNos = batches.map((batch) => batch.batch_no);

  // ---- 推送保险：临时关闭，finally 里按原值恢复 ----
  const originalFlag = await getConfigValue('wecom_alert_enabled');
  await db.query("UPDATE system_config SET `value`='false' WHERE `key`='wecom_alert_enabled'");
  if ((await getConfigValue('wecom_alert_enabled')) !== 'false') {
    console.error('无法临时关闭企微推送开关，为避免误发消息已中止。');
    process.exit(1);
  }
  console.log(`已临时关闭企微推送（原值 ${originalFlag ?? 'NULL'}），校验结束后恢复。\n`);

  try {
    await cleanup(db, batchNos);

    console.log('== 走真实导入路径写库 ==');
    for (const batch of batches) {
      const rows = readFirstSheet(findProductFile(batch.batch_no));
      check(rows.length === batch.rows.length, `${batch.batch_no} 文件行数 ${rows.length} ≠ 设计 ${batch.rows.length}`);

      let inserted = 0;
      for (const body of rows) {
        // 与接口一致：批次号与规格直接落在检验记录行上（批次不落表），空字符串按「没填」处理。
        const resolved = await resolveMeasurementBatch(body);
        const config = RESOURCE_CONFIG.measurements;
        const payload: Record<string, unknown> = { ...body, batch_no: resolved.batchNo, spec_id: resolved.specId };
        const columns = config.columns.filter((column) => payload[column] !== undefined && payload[column] !== '');
        const result = await db.query(
          `INSERT INTO ${config.table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
          columns.map((column) => normalizeValue(payload[column])),
        );
        inserted += result.affectedRows ?? 1;
      }
      check(inserted === batch.rows.length, `${batch.batch_no} 入库 ${inserted} 条 ≠ 设计 ${batch.rows.length} 条`);

      // 设备采集：列头必须是该设备类型的专用模板列，采集点数不少于 10。
      const deviceFiles = [
        { file: join(READING_DIR, `${batch.batch_no}-挤出机-温度压力.xlsx`), fields: ['temperature_c', 'pressure_mpa'] },
        { file: join(READING_DIR, `${batch.batch_no}-牵引机-牵引速度.xlsx`), fields: ['haul_off_speed_mpm'] },
      ];
      for (const device of deviceFiles) {
        if (!check(existsSync(device.file), `缺少设备采集文件 ${device.file}`)) continue;
        const readingRows = readFirstSheet(device.file);
        const headers = Object.keys(readingRows[0] ?? {});
        check(
          headers.includes('collect_time') && device.fields.every((field) => headers.includes(field)),
          `${device.file} 表头 ${headers.join(',')} 与设备类型模板不一致`,
        );
        check(readingRows.length >= 10, `${device.file} 采集点数 ${readingRows.length} < 10`);
      }
      console.log(`  ✓ ${batch.batch_no} 产品数据 ${inserted} 条 + 设备采集 2 个文件已就绪`);
    }

    // ---- 真实判定引擎复算 ----
    // 批次号本身就是关联键，直接用它重算即可，不需要再过一遍 ppr_batch 视图取自增 id。
    const summary = await evaluateAlerts({ batchNos });
    console.log(`\n== 真实判定引擎复算 ==\n  评估批次 ${summary.batches} 个 · 记录 ${summary.records} 条 · 事件 ${summary.created} 条`);
    console.log(`  引擎汇总：高风险 ${summary.high} · 中风险 ${summary.medium} · 正常 ${summary.normal}\n`);

    const expectAll = batches.reduce((acc, batch) => ({
      high: acc.high + batch.expect.high,
      medium: acc.medium + batch.expect.medium,
      normal: acc.normal + batch.expect.normal,
    }), { high: 0, medium: 0, normal: 0 });

    check(summary.high === expectAll.high, `引擎高风险 ${summary.high} ≠ 设计合计 ${expectAll.high}`);
    check(summary.medium === expectAll.medium, `引擎中风险 ${summary.medium} ≠ 设计合计 ${expectAll.medium}`);
    check(summary.normal === expectAll.normal, `引擎正常 ${summary.normal} ≠ 设计合计 ${expectAll.normal}`);

    // ---- 逐批次比对：事件明细 + 落库数值精度 + quality_flag ----
    for (const batch of batches) {
      const measurements = await db.queryAll<MeasurementRow>(
        `SELECT m.*, s.name AS spec_name,
                s.outer_lower_mm, s.outer_upper_mm, s.wall_lower_mm, s.wall_upper_mm, s.ovality_upper_mm
         FROM ppr_product_measurement m
         JOIN ppr_product_spec s ON s.id=m.spec_id
         WHERE m.batch_no=? ORDER BY m.inspect_time, m.id`,
        [batch.batch_no],
      );
      check(measurements.length === batch.rows.length, `${batch.batch_no} 库中检验记录 ${measurements.length} 条 ≠ 设计 ${batch.rows.length} 条`);

      // 用真实引擎的纯函数对「库里读出来的行」判定：同时验证 decimal 精度没有丢。
      const planned = planBatch(measurements);
      const counts: Record<string, number> = { high: 0, medium: 0, normal: 0 };
      for (const alert of planned.alerts) counts[alert.riskLevel] += 1;

      check(counts.high === batch.expect.high, `${batch.batch_no} 高风险 ${counts.high} ≠ 设计 ${batch.expect.high}`);
      check(counts.medium === batch.expect.medium, `${batch.batch_no} 中风险 ${counts.medium} ≠ 设计 ${batch.expect.medium}`);
      check(counts.normal === batch.expect.normal, `${batch.batch_no} 正常 ${counts.normal} ≠ 设计 ${batch.expect.normal}`);

      // 落库数值必须与设计值逐位一致（decimal(10,3) 只保留 3 位，设计值本身都是 3 位）。
      for (const [index, row] of measurements.entries()) {
        for (const metric of dataset.METRICS) {
          const stored = Number(row[metric.key]);
          const designed = Number(batch.rows[index][metric.key]);
          check(stored === designed, `${batch.batch_no} 第${index + 1}点 ${metric.label} 落库 ${stored} ≠ 设计 ${designed}`);
        }
      }

      // 引擎回写后的 quality_flag 必须与设计一致。
      const flags: Record<string, number> = { high: 0, medium: 0, normal: 0 };
      for (const row of measurements) flags[row.quality_flag] = (flags[row.quality_flag] ?? 0) + 1;
      check(flags.high === batch.expect.highFlaggedRecords,
        `${batch.batch_no} 高风险标记 ${flags.high} 条 ≠ 设计 ${batch.expect.highFlaggedRecords} 条`);
      check(flags.medium === batch.expect.mediumFlaggedRecords,
        `${batch.batch_no} 中风险标记 ${flags.medium} 条 ≠ 设计 ${batch.expect.mediumFlaggedRecords} 条`);

      // 关键事件抽检：事件编号后缀、状态、规则码都要对得上。
      const dbAlerts = await db.queryAll<AlertRow>(
        `SELECT a.event_no, a.metric_code, a.risk_level, a.rule_code, a.threshold_text, a.status, m.record_no
         FROM ppr_alert_event a JOIN ppr_product_measurement m ON m.id=a.measurement_id
         WHERE m.batch_no=? ORDER BY a.event_no`,
        [batch.batch_no],
      );
      const suffixes: Record<string, string> = { outer_diameter: 'OD', min_wall_thickness: 'WT', ovality: 'OV' };
      for (const alert of dbAlerts) {
        check(String(alert.event_no).endsWith(suffixes[alert.metric_code]),
          `${batch.batch_no} 事件编号 ${alert.event_no} 后缀与指标 ${alert.metric_code} 不符`);
        check(alert.status === (alert.risk_level === 'normal' ? 'closed' : 'open'),
          `${batch.batch_no} 事件 ${alert.event_no} 状态 ${alert.status} 与级别 ${alert.risk_level} 不符`);
      }

      const abnormal = dbAlerts.filter((alert) => alert.risk_level !== 'normal');
      console.log(`  ${batch.batch_no} ${batch.label}`);
      console.log(`     事件：高 ${counts.high} / 中 ${counts.medium} / 正常 ${counts.normal}｜标记：高 ${flags.high} 条记录 / 中 ${flags.medium} 条记录`);
      for (const alert of abnormal) {
        console.log(`     [${alert.rule_code} ${alert.risk_level === 'high' ? '高风险' : '中风险'}] ${alert.event_no} ${alert.record_no}`);
        console.log(`         ${alert.threshold_text}`);
      }
    }

    if (!KEEP) {
      await cleanup(db, batchNos);
      console.log('\n已清理本地校验数据（批次、检验记录、设备采集、预警事件）。');
    } else {
      console.log(`\n保留了本地校验数据（--keep），批次号：${batchNos.join(', ')}`);
      console.log('清理时重跑一次不带 --keep 的校验即可。');
    }
  } finally {
    if (originalFlag === null) {
      await db.query("DELETE FROM system_config WHERE `key`='wecom_alert_enabled'");
    } else {
      await db.query("UPDATE system_config SET `value`=? WHERE `key`='wecom_alert_enabled'", [originalFlag]);
    }
    console.log(`企微推送开关已恢复为 ${(await getConfigValue('wecom_alert_enabled')) ?? 'NULL'}。`);
  }

  console.log(`\n== 校验结论：${checks - failures.length} / ${checks} 项通过 ==`);
  if (failures.length) {
    console.error('\n未通过项：');
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    process.exitCode = 1;
  } else {
    console.log('全部通过：Excel 表头、落库精度、设备采集点数、真实引擎判定与设计意图完全一致。');
  }
}

main()
  .catch((error) => {
    console.error('校验失败：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    // 连接池不关掉，Node 事件循环会一直挂着不退，脚本看起来像「卡死」。
    const { closePool } = await import('@/storage/database/mysql-client');
    await closePool().catch(() => {});
    process.exit(process.exitCode ?? 0);
  });
