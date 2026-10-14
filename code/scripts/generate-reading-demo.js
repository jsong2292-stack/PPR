/**
 * 生成「设备采集数据」的模拟导入 Excel。
 *
 * 采集数据改成「设备台账 → 设备 → 生产批次 → 采集项」下按批次导入后，
 * 每个文件的列头必须和该设备类型的专用模板完全一致（记录编号、批次号、设备都不用填），
 * 所以这里直接从库里读批次与设备类型，按类型生成对应的数据项列。
 *
 * 输出（默认 <repo>/PPR/测试数据/设备采集模拟数据/）：
 *   12121D0032-挤出机-温度压力.xlsx
 *   12121D0032-牵引机-牵引速度.xlsx
 *   ...
 *
 * 用法：
 *   node scripts/generate-reading-demo.js                    # 输出到默认目录
 *   node scripts/generate-reading-demo.js /tmp/reading-demo  # 指定输出目录
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const XLSX = require('xlsx');

try {
  require('dotenv').config({ path: '.env.local' });
  require('dotenv').config();
} catch {
  // 忽略：没有 dotenv 时直接用进程环境变量
}

const DEFAULT_OUT_DIR = path.resolve(__dirname, '../../测试数据/设备采集模拟数据');

/** 每个采集项的取值范围与逐点漂移量，让模拟数据看起来像真实运行曲线 */
const FIELD_PROFILE = {
  temperature_c: { base: 205.0, drift: 0.18, label: '温度(℃)', decimals: 2 },
  pressure_mpa: { base: 12.55, drift: -0.06, label: '压力(MPa)', decimals: 3 },
  haul_off_speed_mpm: { base: 8.2, drift: 0.035, label: '牵引速度(m/min)', decimals: 3 },
};

/** 设备类型编码 → 该类型采集的数据项（与 src/lib/quality-equipment.ts 保持一致） */
const TYPE_FIELDS = {
  'ETYPE-EXTRUDER': { fields: ['temperature_c', 'pressure_mpa'], suffix: '挤出机-温度压力' },
  'ETYPE-HAULOFF': { fields: ['haul_off_speed_mpm'], suffix: '牵引机-牵引速度' },
};

function resolveConnection() {
  const url = process.env.MYSQL_URL || process.env.DATABASE_URL;
  if (url) {
    const parsed = new URL(url.replace(/^postgres(ql)?:\/\//i, 'mysql://'));
    return {
      host: parsed.hostname || '127.0.0.1',
      port: parsed.port ? Number(parsed.port) : 3306,
      user: decodeURIComponent(parsed.username || 'root'),
      password: decodeURIComponent(parsed.password || ''),
      database: decodeURIComponent(parsed.pathname.replace(/^\//, '')) || '',
    };
  }
  if (!process.env.MYSQL_HOST || !process.env.MYSQL_DATABASE) return null;
  return {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE,
  };
}

function pad(value) {
  return String(value).padStart(2, '0');
}

/** 把 Date 按 UTC 口径格式化成 'YYYY-MM-DD HH:mm:ss'（与连接层 timezone:'Z' 一致） */
function formatDateTime(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} `
    + `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

/** 在 [start+2h, end-1h] 区间内按整点生成采集时刻，最多 maxPoints 个 */
function collectTimes(startTime, endTime, maxPoints = 8) {
  const start = new Date(startTime);
  const end = endTime ? new Date(endTime) : new Date(start.getTime() + 10 * 3600 * 1000);
  const times = [];
  let cursor = new Date(start.getTime() + 2 * 3600 * 1000);
  while (cursor.getTime() <= end.getTime() - 3600 * 1000 && times.length < maxPoints) {
    times.push(new Date(cursor));
    cursor = new Date(cursor.getTime() + 3600 * 1000);
  }
  return times;
}

function buildSheet(fields, times, seed) {
  const headers = ['collect_time', ...fields];
  const rows = [headers];
  times.forEach((time, index) => {
    const row = [formatDateTime(time)];
    for (const field of fields) {
      const profile = FIELD_PROFILE[field];
      const value = profile.base + profile.drift * (index + seed) + Math.sin(index + seed) * 0.05;
      row.push(Number(value.toFixed(profile.decimals)));
    }
    rows.push(row);
  });
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(14, header.length + 4) }));
  return sheet;
}

async function main() {
  const outDir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_OUT_DIR;
  const config = resolveConnection();
  if (!config || !config.database) {
    console.error('未配置数据库连接（MYSQL_URL 或 MYSQL_HOST / MYSQL_DATABASE）。');
    process.exit(1);
  }

  const connection = await mysql.createConnection({ ...config, charset: 'utf8mb4_unicode_ci', timezone: 'Z' });
  try {
    // 按「批次 × 关联设备」取数：批次表的 extruder_id / haul_off_id 指向哪台设备，就为那台设备生成一份文件。
    const [rows] = await connection.query(`
      SELECT b.id AS batch_id, b.batch_no, b.start_time, b.end_time,
             ex.id AS extruder_id, ex.name AS extruder_name, ext.code AS extruder_type_code,
             ha.id AS haul_off_id, ha.name AS haul_off_name, hat.code AS haul_off_type_code
      FROM ppr_batch b
      LEFT JOIN ppr_equipment ex ON ex.id = b.extruder_id
      LEFT JOIN ppr_equipment_type ext ON ext.id = ex.type_id
      LEFT JOIN ppr_equipment ha ON ha.id = b.haul_off_id
      LEFT JOIN ppr_equipment_type hat ON hat.id = ha.type_id
      ORDER BY b.start_time, b.id`);

    if (!rows.length) {
      console.error('库里没有生产批次，先生成批次后再运行。');
      process.exit(1);
    }

    fs.mkdirSync(outDir, { recursive: true });
    let written = 0;
    let seed = 0;

    for (const row of rows) {
      const devices = [
        { id: row.extruder_id, name: row.extruder_name, typeCode: row.extruder_type_code },
        { id: row.haul_off_id, name: row.haul_off_name, typeCode: row.haul_off_type_code },
      ].filter((device) => device.id);

      for (const device of devices) {
        const spec = TYPE_FIELDS[device.typeCode];
        if (!spec) {
          console.warn(`跳过：批次 ${row.batch_no} 的 ${device.name}（类型 ${device.typeCode} 未定义采集项）`);
          continue;
        }
        const times = collectTimes(row.start_time, row.end_time);
        if (!times.length) {
          console.warn(`跳过：批次 ${row.batch_no} × ${device.name}（时间区间内排不出采集时刻）`);
          continue;
        }
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, buildSheet(spec.fields, times, seed), `采集数据`);
        const filename = `${row.batch_no}-${spec.suffix}.xlsx`;
        XLSX.writeFile(workbook, path.join(outDir, filename));
        written += 1;
        seed += 1;
        console.log(`已生成 ${filename}（${times.length} 条 · 列为 collect_time + ${spec.fields.join(', ')}）`);
      }
    }

    console.log(`\n共 ${written} 个文件，输出目录：${outDir}`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('生成失败：', error.message);
  process.exit(1);
});
