/**
 * 数据库连通性与结构自检。
 *
 *   pnpm db:check
 *
 * 检查内容：
 *   1) 应用账号能否连库（而不是只有迁移账号能连）
 *   2) 迁移记录表是否存在、是否有未执行的迁移
 *   3) 关键表与视图是否齐全
 *   4) 基础数据是否就绪（规则、指标、规格、批次），否则规则引擎无事可做
 *   5) 应用账号的 DDL 权限是否被正确限制（预期：被拒绝）
 *
 * 这个脚本用于部署后的第一道自检，也是排障的起点。
 */
import process from 'node:process';
import { connectAs, connectAsApp, initScriptEnv } from './lib/db-utils';

const REQUIRED_TABLES = [
  'sys_user',
  'sys_role',
  'data_source',
  'production_line',
  'product_category',
  'product_spec',
  'equipment_type',
  'equipment',
  'quality_metric',
  'metric_spec_limit',
  'process_parameter',
  'metric_influence',
  'temp_zone',
  'production_batch',
  'production_event',
  'product_data',
  'product_data_value',
  'equipment_reading',
  'equipment_reading_value',
  'process_record',
  'process_zone_value',
  'import_job',
  'inspection_record',
  'inspection_value',
  'inspection_wall_point',
  'data_consistency_check',
  'alert_rule',
  'alert_event',
  'alert_event_record',
  'notification',
  'notification_recipient',
  'analysis_run',
  'analysis_reference_snapshot',
  'analysis_conclusion',
  'conclusion_evidence',
  'eight_d_report',
  'eight_d_field',
  'eight_d_revision',
  'analysis_archive',
  'analysis_archive_conclusion',
  'operation_log',
];

const REQUIRED_VIEWS = [
  'v_inspection_record_wide',
  'v_product_data_wide',
  'v_equipment_reading_wide',
  'v_alert_event_detail',
];

let problems = 0;

function ok(message: string): void {
  console.log(`  [通过] ${message}`);
}

function warn(message: string): void {
  console.log(`  [提示] ${message}`);
}

function fail(message: string): void {
  problems += 1;
  console.error(`  [失败] ${message}`);
}

async function main(): Promise<void> {
  const db = initScriptEnv();
  console.log(`目标数据库：${db.user}@${db.host}:${db.port}/${db.database}`);
  console.log('');

  console.log('1. 应用账号连接');
  let app: Awaited<ReturnType<typeof connectAsApp>> | null = null;
  try {
    app = await connectAsApp(db);
    const [rows] = await app.query<any[]>('SELECT VERSION() AS version, DATABASE() AS db');
    const info = rows[0] ?? {};
    ok(`连接成功：MySQL ${info.version} · 当前库 ${info.db}`);
  } catch (error) {
    fail(
      `应用账号连接失败：${error instanceof Error ? error.message : String(error)}\n` +
        '       请确认 .env.local 中的 DB_USER / DB_PASSWORD，以及账号是否已授权。',
    );
  }

  console.log('');
  console.log('2. 迁移状态');
  const migration = await connectAs(db);
  try {
    const [ledger] = await migration.query<any[]>(
      "SELECT COUNT(*) AS applied FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'schema_migration'",
    );
    if (!Number(ledger[0]?.applied)) {
      fail('找不到 schema_migration 表，说明迁移从未执行。请先运行 pnpm db:migrate。');
    } else {
      const [applied] = await migration.query<any[]>(
        'SELECT name, applied_at FROM schema_migration ORDER BY name',
      );
      ok(`已应用 ${applied.length} 个迁移`);
      for (const row of applied) {
        console.log(`         · ${row.name}（${row.applied_at}）`);
      }
    }

    console.log('');
    console.log('3. 表与视图');
    const [tables] = await migration.query<any[]>(
      'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = ?',
      ['BASE TABLE'],
    );
    const tableNames = new Set(tables.map((row) => String(row.name)));
    const missingTables = REQUIRED_TABLES.filter((name) => !tableNames.has(name));
    if (missingTables.length) fail(`缺少表：${missingTables.join('、')}`);
    else ok(`业务表齐全（${REQUIRED_TABLES.length} 张）`);

    const [views] = await migration.query<any[]>(
      'SELECT table_name AS name FROM information_schema.views WHERE table_schema = DATABASE()',
    );
    const viewNames = new Set(views.map((row) => String(row.name)));
    const missingViews = REQUIRED_VIEWS.filter((name) => !viewNames.has(name));
    if (missingViews.length) fail(`缺少视图：${missingViews.join('、')}`);
    else ok(`视图齐全（${REQUIRED_VIEWS.length} 个）`);

    console.log('');
    console.log('4. 基础数据');
    const checks: Array<[string, string, string]> = [
      ['预警规则', 'SELECT COUNT(*) AS c FROM alert_rule WHERE enabled = 1', '规则引擎需要至少 R1–R5 五条启用规则'],
      ['质量指标', "SELECT COUNT(*) AS c FROM quality_metric WHERE status = 'enabled'", '指标字典为空时无法展示任何测量值'],
      ['规格限值', 'SELECT COUNT(*) AS c FROM metric_spec_limit', '缺少限值时 R3 规则不会触发'],
      ['产品规格', 'SELECT COUNT(*) AS c FROM product_spec WHERE is_deleted = 0', '没有规格时无法建立批次'],
      ['生产批次', 'SELECT COUNT(*) AS c FROM production_batch WHERE is_deleted = 0', '没有批次时监控页为空'],
      ['抽检记录', 'SELECT COUNT(*) AS c FROM inspection_record', '没有抽检记录时规则引擎无事可做'],
      ['账号', 'SELECT COUNT(*) AS c FROM sys_user WHERE status = ?', '没有可用账号时无法登录'],
    ];

    for (const [label, sql, hint] of checks) {
      const [rows] = await migration.query<any[]>(sql, label === '账号' ? ['active'] : []);
      const count = Number(rows[0]?.c ?? 0);
      if (count === 0) fail(`${label}为空（0 条）—— ${hint}`);
      else ok(`${label}：${count} 条`);
    }
  } finally {
    await migration.end();
  }

  console.log('');
  console.log('5. 应用账号权限边界');
  if (app) {
    try {
      await app.query('CREATE TABLE __ppr_permission_probe (id INT)');
      fail('应用账号可以建表！这与最小权限原则不符，请回收 DDL 权限。');
      await app.query('DROP TABLE IF EXISTS __ppr_permission_probe');
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'ER_TABLEACCESS_DENIED_ERROR' || code === 'ER_DBACCESS_DENIED_ERROR') {
        ok('应用账号无 DDL 权限（符合预期）');
      } else {
        warn(`无法确认应用账号权限：${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } else {
    warn('应用账号不可用，跳过权限检查');
  }

  console.log('');
  if (problems === 0) {
    console.log('自检通过：数据库结构与基础数据可用。');
  } else {
    console.error(`自检发现 ${problems} 个问题，请按上面的提示处理后重试。`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\n自检失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
