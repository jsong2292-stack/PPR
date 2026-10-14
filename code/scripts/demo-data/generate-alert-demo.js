/**
 * 生成「告警演示」Excel 数据（产品数据 + 配套设备采集数据）。
 *
 * 与 scripts/generate-reading-demo.js 的区别：
 *   - 那份脚本从库里已有的批次出发，生成的是「正常波动」的采集曲线，不针对告警；
 *   - 这份脚本不用连数据库，按设计好的标准区间反向构造数值，每个文件的告警条数是确定的，
 *     并会在生成时用复刻的判定引擎自检，设计意图与实算结果不一致就直接报错退出。
 *
 * 输出（默认 <repo>/PPR/测试数据/演示告警数据/）：
 *   产品数据/测试数据-<批次>-<场景>.xlsx        每批 6 条检验记录 × 3 指标 = 18 条事件
 *   设备采集模拟数据/<批次>-挤出机-温度压力.xlsx   每批 12 条（每小时 1 条）
 *   设备采集模拟数据/<批次>-牵引机-牵引速度.xlsx   每批 12 条（每小时 1 条）
 *
 * 用法：
 *   node scripts/demo-data/generate-alert-demo.js                  # 输出到默认目录
 *   node scripts/demo-data/generate-alert-demo.js /tmp/alert-demo  # 指定输出目录
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const dataset = require('./alert-demo-dataset');

const DEFAULT_OUT_DIR = path.resolve(__dirname, '../../../测试数据/演示告警数据');

/** 产品数据导入模板的列（与产品台账 → 批次 → 检验记录 页面的模板一致）。 */
const PRODUCT_HEADERS = [
  'record_no', 'sample_no', 'batch_no', 'spec_code', 'production_group', 'batch_start_time',
  'inspect_time', 'outer_diameter_mm', 'min_wall_thickness_mm', 'max_wall_thickness_mm',
  'max_outer_diameter_mm', 'min_outer_diameter_mm', 'ovality_mm', 'data_source', 'quality_flag', 'remark',
];

/** 文件名里不能出现 : \ / ? * [ ] */
function safeFilePart(text) {
  return String(text).replace(/[:\\/?*[\]]/g, ' ').trim();
}

function autoWidth(rows) {
  const widths = [];
  for (const row of rows) {
    row.forEach((cell, index) => {
      const length = String(cell ?? '').length;
      // 中文按 2 个字符宽度估算，避免列宽不够需要手动拖。
      const visual = /[\u4e00-\u9fa5]/.test(String(cell ?? '')) ? length * 2 : length;
      widths[index] = Math.max(widths[index] ?? 10, Math.min(60, visual + 2));
    });
  }
  return widths.map((wch) => ({ wch }));
}

/** 产品数据表：第一行表头 + 6 行检验记录（导入只读第一个工作表）。 */
function buildProductSheet(batch) {
  const rows = [PRODUCT_HEADERS];
  for (const row of batch.rows) {
    rows.push(PRODUCT_HEADERS.map((header) => {
      if (header === 'batch_no') return batch.batch_no;
      if (header === 'spec_code') return dataset.SPEC.code;
      if (header === 'production_group') return batch.production_group;
      if (header === 'batch_start_time') return batch.start_time;
      return row[header] ?? '';
    }));
  }
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = autoWidth(rows);
  return sheet;
}

/** 填写说明表：写清期望告警结果，演示当天可直接对照。 */
function buildProductGuideSheet(batch, alerts) {
  const byLevel = { high: [], medium: [], normal: [] };
  for (const alert of alerts) byLevel[alert.riskLevel].push(alert);
  const flagCount = (level) => batch.rows.filter((row) => row.quality_flag === level).length;

  const rows = [
    ['本文件用途'],
    ['', batch.scenario],
    ['', batch.purpose],
    [''],
    ['期望判定结果'],
    ['', `事件总数 ${alerts.length} 条：高风险 ${byLevel.high.length} 条、中风险 ${byLevel.medium.length} 条、正常 ${byLevel.normal.length} 条。`],
    ['', `产品数据的 quality_flag 分布：高风险 ${flagCount('high')} 条、中风险 ${flagCount('medium')} 条、正常 ${flagCount('normal')} 条。`],
    ['', batch.expect.note],
    [''],
    ['规格标准区间与接近带（接近带 = 区间宽度 × 15%）', '', '', ''],
    ['指标', '标准区间', '接近带', '本批 6 点实测值'],
  ];
  for (const metric of dataset.METRICS) {
    const range = dataset.rangeOf(metric);
    rows.push([
      `${metric.label} mm`,
      `${range.lower.toFixed(3)} – ${range.upper.toFixed(3)}`,
      `${range.lower.toFixed(3)}–${(range.lower + range.band).toFixed(4)} / ${(range.upper - range.band).toFixed(4)}–${range.upper.toFixed(3)}`,
      batch.rows.map((row) => row[metric.key]).join(', '),
    ]);
  }
  rows.push(['']);
  rows.push(['逐条事件明细（判定引擎口径，事件编号在产品数据落库后才生成）']);
  rows.push(['检验点', '记录编号', '指标', '风险级别', '规则', '判定说明']);
  for (const alert of alerts) {
    const levelLabel = alert.riskLevel === 'high' ? '高风险' : alert.riskLevel === 'medium' ? '中风险' : '正常';
    rows.push([`第${alert.point}点`, alert.recordNo, alert.metric.label, levelLabel, alert.ruleCode, alert.text]);
  }
  rows.push(['']);
  rows.push(['导入位置：质量中心 → 产品台账 → 选择规格「PPR S2.5 25×4.2 瓷芯管」→ 生产批次 → 检验数据 → Excel 导入']);
  rows.push(['本文件自带批次号，导入时会自动新建/复用批次；quality_flag 留空，由判定引擎在保存后自动回写。']);

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [{ wch: 10 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 96 }];
  return sheet;
}

/** 设备采集表：collect_time + 该设备类型的数据项两列，与页面模板完全一致。 */
function buildReadingSheet(batch, fields) {
  const headers = ['collect_time', ...fields];
  const rows = [headers];
  const times = dataset.collectTimes(batch);
  times.forEach((time, index) => {
    const row = [dataset.formatDateTime(time)];
    for (const field of fields) {
      const profile = dataset.DEVICE_PROFILE[field];
      const driftKey = field === 'temperature_c' ? 'temperature' : field === 'pressure_mpa' ? 'pressure' : 'haul_off';
      const drift = batch.equipment[driftKey][index] ?? 0;
      // 叠一点正弦抖动，曲线看起来像真实运行而不是斜线。
      const wobble = Math.sin(index * 1.3 + field.length) * (field === 'temperature_c' ? 0.06 : 0.004);
      row.push(Number((profile.base + drift + wobble).toFixed(profile.decimals)));
    }
    rows.push(row);
  });
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = autoWidth(rows);
  return sheet;
}

function writeWorkbook(filePath, sheets) {
  const workbook = XLSX.utils.book_new();
  for (const [name, sheet] of sheets) XLSX.utils.book_append_sheet(workbook, sheet, name.slice(0, 31));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  XLSX.writeFile(workbook, filePath);
}

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exitCode = 1;
}

function main() {
  const outDir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_OUT_DIR;
  const productDir = path.join(outDir, '产品数据');
  const readingDir = path.join(outDir, '设备采集模拟数据');

  const batches = dataset.buildBatches();
  const report = [];
  let failed = false;

  console.log(`输出目录：${outDir}\n`);
  console.log('== 自检：复刻判定引擎的结果 vs 设计意图 ==');

  for (const batch of batches) {
    const alerts = dataset.planBatch(batch.rows);
    const counts = {
      high: alerts.filter((alert) => alert.riskLevel === 'high').length,
      medium: alerts.filter((alert) => alert.riskLevel === 'medium').length,
      normal: alerts.filter((alert) => alert.riskLevel === 'normal').length,
    };
    const flagged = {
      medium: batch.rows.filter((row) => row.quality_flag === 'medium').length,
      high: batch.rows.filter((row) => row.quality_flag === 'high').length,
    };
    const expect = batch.expect;
    const mismatches = [];
    if (counts.high !== expect.high) mismatches.push(`高风险 ${counts.high} ≠ 设计 ${expect.high}`);
    if (counts.medium !== expect.medium) mismatches.push(`中风险 ${counts.medium} ≠ 设计 ${expect.medium}`);
    if (counts.normal !== expect.normal) mismatches.push(`正常 ${counts.normal} ≠ 设计 ${expect.normal}`);
    if (flagged.medium !== expect.mediumFlaggedRecords) mismatches.push(`中风险标记记录 ${flagged.medium} ≠ 设计 ${expect.mediumFlaggedRecords}`);
    if (flagged.high !== expect.highFlaggedRecords) mismatches.push(`高风险标记记录 ${flagged.high} ≠ 设计 ${expect.highFlaggedRecords}`);

    if (mismatches.length) {
      failed = true;
      fail(`批次 ${batch.batch_no}（${batch.label}）自检不通过：\n    - ${mismatches.join('\n    - ')}`);
    } else {
      console.log(`  ✓ ${batch.batch_no}（${batch.label}）高风险 ${counts.high} · 中风险 ${counts.medium} · 正常 ${counts.normal}` +
        `｜标记：高 ${flagged.high} / 中 ${flagged.medium} / 正常 ${batch.rows.length - flagged.high - flagged.medium}`);
    }

    writeWorkbook(
      path.join(productDir, `测试数据-${batch.batch_no}-${safeFilePart(batch.label)}.xlsx`),
      [['产品数据', buildProductSheet(batch)], ['填写说明', buildProductGuideSheet(batch, alerts)]],
    );

    const times = dataset.collectTimes(batch);
    writeWorkbook(
      path.join(readingDir, `${batch.batch_no}-挤出机-温度压力.xlsx`),
      [['采集数据', buildReadingSheet(batch, ['temperature_c', 'pressure_mpa'])]],
    );
    writeWorkbook(
      path.join(readingDir, `${batch.batch_no}-牵引机-牵引速度.xlsx`),
      [['采集数据', buildReadingSheet(batch, ['haul_off_speed_mpm'])]],
    );

    report.push({
      batch_no: batch.batch_no,
      label: batch.label,
      scenario: batch.scenario,
      records: batch.rows.length,
      readingPoints: times.length,
      high: counts.high,
      medium: counts.medium,
      normal: counts.normal,
      flaggedHigh: flagged.high,
      flaggedMedium: flagged.medium,
      note: expect.note,
    });
  }

  if (failed) {
    console.error('\n自检未通过，文件已生成但请先修正数据集设计。');
    return;
  }

  console.log('\n== 生成结果 ==');
  let productFiles = 0;
  let readingFiles = 0;
  for (const item of report) {
    console.log(`  ${item.batch_no} ${item.label}`);
    console.log(`     产品数据 1 个文件（${item.records} 条记录 → 高风险 ${item.high} / 中风险 ${item.medium} / 正常 ${item.normal}）`);
    console.log(`     设备采集 2 个文件（每设备 ${item.readingPoints} 条，每小时 1 条）`);
    productFiles += 1;
    readingFiles += 2;
  }
  console.log(`\n共 ${productFiles} 个产品数据文件、${readingFiles} 个设备采集文件。`);
  console.log(`产品数据：${productDir}`);
  console.log(`设备采集：${readingDir}`);

  fs.writeFileSync(path.join(outDir, '演示结果对照表.json'), `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    spec: dataset.SPEC.code,
    proximityRatio: dataset.PROXIMITY_RATIO,
    proximityRunLength: dataset.PROXIMITY_RUN_LENGTH,
    batches: report,
  }, null, 2)}\n`);
  console.log(`对照表：${path.join(outDir, '演示结果对照表.json')}`);
}

main();
