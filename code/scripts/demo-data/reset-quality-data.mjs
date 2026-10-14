/**
 * 清空业务数据（保留主数据），用于演示前重置到空白状态。
 *
 * 保留：产品类别 / 产品规格 / 设备类型 / 设备 / 质量指标（这些是主数据，手工维护）
 * 清空：历史归档 → 8D 报告 → 诊断结论 → 诊断任务 → 预警事件 → 检验记录 → 设备采集数据
 *
 * 批次是视图（由检验记录 + 采集数据实时聚合），所以清空上面两张子表后批次自然消失。
 *
 * 用法：node scripts/demo-data/reset-quality-data.mjs --yes
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';

if (!process.argv.includes('--yes')) {
  console.error('这会清空全部检验记录 / 采集数据 / 预警 / 诊断 / 归档。确认请加 --yes 参数。');
  process.exit(1);
}

const envText = await fs.readFile(path.join(process.cwd(), '.env.local'), 'utf8');
const dsn = envText.split('\n').map((line) => line.trim()).find((line) => line.startsWith('MYSQL_URL=')).slice('MYSQL_URL='.length);
const url = new URL(dsn);
const connection = await mysql.createConnection({
  host: url.hostname, port: Number(url.port || 3306), user: url.username,
  password: decodeURIComponent(url.password), database: url.pathname.slice(1),
});

// 顺序不能颠倒：归档 RESTRICT 住 8D 报告，8D / 结论 / 任务 / 预警是层层 CASCADE 下来的。
const steps = [
  'ppr_history_archive',
  'ppr_eight_d_report',
  'ppr_analysis_conclusion',
  'ppr_analysis_run',
  'ppr_alert_event',
  'ppr_product_measurement',
  'ppr_equipment_reading',
];

for (const table of steps) {
  const [result] = await connection.query(`DELETE FROM \`${table}\``);
  console.log(`${table}: 删除 ${result.affectedRows} 行`);
}

const [remaining] = await connection.query('SELECT COUNT(*) AS n FROM ppr_batch');
console.log(`批次视图剩余 ${remaining[0].n} 个批次（清空后应为 0）`);
await connection.end();
