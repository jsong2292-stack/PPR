#!/usr/bin/env node
/**
 * 生成 PPR 质量智能分析助手基线数据 SQL（0002_seed.sql 的生成器）。
 * ------------------------------------------------------------------
 * 用途：`0002_seed.sql` 的基线数据由本脚本生成；调整基线数据请改本脚本后重新生成，
 *   - adminDefaults.tables（categories/specs/equipmentTypes/equipment/batches/metrics/products/deviceReadings）
 * 变量命名沿用生成时的含义：
 *   - normalRecords（21 条样管抽检记录，3 批次 × 7 抽检时间）
 *   - scenarios[].process（7 条工艺记录 + 8 个温区设定/反馈）
 *   - 限值/趋势阈值/线速度等常量
 *   - 规则 R1–R5
 *
 * 用法：node tools/gen-seed.mjs > seed.sql
 *
 * 注意：几种「异常场景」是对同一基线数据（normalRecords）的临时
 * 改写，不是四份独立数据。因此这里只写入基线数据；需要制造异常样本时，
 * 使用生成结果末尾的「可选异常样本」段落。
 */

// ---------- 基础常量 ----------
const SPEC = 'SPEC-25-42';
const BATCH = { dm: 1, c0034: 2, d0029: 3, d0032: 4 };
const METRIC = {
  outerDiameter: 1,
  minWallThickness: 2,
  maxWallThickness: 3,
  maxOuterDiameter: 4,
  minOuterDiameter: 5,
  ovality: 6,
};
const PARAM = { temperature: 1, pressure: 2, haulOffSpeed: 3 };
const SRC = { manual: 1, mes: 2, qms: 3, device: 4, local模拟: 5, virtualProcess: 6 };
const EXTRUDER = 1;
const HAULOFF = 2;

const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const n = (v, d) => (v === null || v === undefined ? 'NULL' : Number(v).toFixed(d));
const dt = (v) => (v === null || v === undefined ? 'NULL' : `'${v}'`);

const out = [];
const w = (line = '') => out.push(line);

// ---------- 值计算（与早期方案公式一致） ----------
const baseTimes = [
  '2026-10-09 08:00:00',
  '2026-10-09 11:20:00',
  '2026-10-09 15:03:00',
  '2026-10-09 18:40:00',
  '2026-10-10 08:20:00',
  '2026-10-10 09:05:00',
  '2026-10-10 09:37:00',
];
const batchNos = ['12121C0034', '12121D0029', '12121D0032'];
const batchIds = [BATCH.c0034, BATCH.d0029, BATCH.d0032];

// normalRecords：3 批次 × 7 时间
const inspectionRows = [];
let rid = 1;
batchIds.forEach((batchId, bi) => {
  baseTimes.forEach((t, i) => {
    const code = `IR-${String(rid).padStart(3, '0')}`;
    inspectionRows.push({
      id: rid,
      code,
      sampleNo: `S-${code}`,
      batchId,
      group: bi === 0 ? 'C组' : 'D组',
      inspectTime: t,
      outerDiameter: 25.23 + ((i + bi) % 3) * 0.005,
      minWallThickness: 4.31 + ((i + bi) % 2) * 0.01,
      maxWallThickness: 4.42 + ((i + bi) % 2) * 0.01,
    });
    rid += 1;
  });
});

// 模拟Products：批次 × 生产日期，一个产品只有一份
const productRows = [
  { id: 1, code: 'PRD-001', batchId: BATCH.c0034, date: '2026-10-09', od: 25.235, min: 4.32, max: 4.43, ov: 0.18 },
  { id: 2, code: 'PRD-002', batchId: BATCH.c0034, date: '2026-10-10', od: 25.24, min: 4.31, max: 4.42, ov: 0.18 },
  { id: 3, code: 'PRD-003', batchId: BATCH.d0029, date: '2026-10-09', od: 25.23, min: 4.31, max: 4.42, ov: 0.19 },
  { id: 4, code: 'PRD-004', batchId: BATCH.d0029, date: '2026-10-10', od: 25.245, min: 4.29, max: 4.41, ov: 0.2 },
  { id: 5, code: 'PRD-005', batchId: BATCH.d0032, date: '2026-10-09', od: 25.238, min: 4.3, max: 4.42, ov: 0.17 },
  { id: 6, code: 'PRD-006', batchId: BATCH.d0032, date: '2026-10-10', od: 25.25, min: 4.26, max: 4.4, ov: 0.19 },
];

// 模拟DeviceReadings：6 组（批次 × 日期）× 11 小时 × 2 台设备
const hours = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
const devicePlan = [
  { batchId: BATCH.c0034, date: '2026-10-09', t0: 199.9, tStep: 0.04, p0: 8.1, pStep: 0.004, h0: 12.55, hStep: 0.008 },
  { batchId: BATCH.c0034, date: '2026-10-10', t0: 200.2, tStep: 0.06, p0: 8.12, pStep: 0.006, h0: 12.58, hStep: 0.01 },
  { batchId: BATCH.d0029, date: '2026-10-09', t0: 200.1, tStep: 0.05, p0: 8.14, pStep: 0.006, h0: 12.6, hStep: 0.01 },
  { batchId: BATCH.d0029, date: '2026-10-10', t0: 200.9, tStep: 0.08, p0: 8.2, pStep: 0.01, h0: 12.7, hStep: 0.016 },
  { batchId: BATCH.d0032, date: '2026-10-09', t0: 200.4, tStep: 0.05, p0: 8.16, pStep: 0.005, h0: 12.6, hStep: 0.01 },
  { batchId: BATCH.d0032, date: '2026-10-10', t0: 201.4, tStep: 0.22, p0: 8.2, pStep: 0.02, h0: 12.62, hStep: 0.026 },
];
const readingRows = [];
const readingValueRows = [];
let devId = 1;
devicePlan.forEach((plan) => {
  const batchNo = batchNos[plan.batchId - BATCH.c0034];
  hours.forEach((collectTime, index) => {
    const stamp = `${plan.date} ${collectTime}:00`;
    const exCode = `DEV-EX-${batchNo.slice(-4)}-${plan.date.slice(5).replace('-', '')}-${collectTime.replace(':', '')}`;
    readingRows.push({
      id: devId,
      code: exCode,
      batchId: plan.batchId,
      date: plan.date,
      equipmentId: EXTRUDER,
      collectTime,
      collectedAt: stamp,
    });
    readingValueRows.push({ readingId: devId, parameterId: PARAM.temperature, value: (plan.t0 + plan.tStep * index).toFixed(1) });
    readingValueRows.push({ readingId: devId, parameterId: PARAM.pressure, value: (plan.p0 + plan.pStep * index).toFixed(2) });
    devId += 1;

    const hoCode = `DEV-HO-${batchNo.slice(-4)}-${plan.date.slice(5).replace('-', '')}-${collectTime.replace(':', '')}`;
    readingRows.push({
      id: devId,
      code: hoCode,
      batchId: plan.batchId,
      date: plan.date,
      equipmentId: HAULOFF,
      collectTime,
      collectedAt: stamp,
    });
    readingValueRows.push({ readingId: devId, parameterId: PARAM.haulOffSpeed, value: (plan.h0 + plan.hStep * index).toFixed(2) });
    devId += 1;
  });
});

// 温区
const zoneDefs = [
  { id: 1, code: 'M1-barrel-1', name: 'M1 机筒1区', setpoint: 188 },
  { id: 2, code: 'M1-barrel-2', name: 'M1 机筒2区', setpoint: 192 },
  { id: 3, code: 'M1-barrel-3', name: 'M1 机筒3区', setpoint: 198 },
  { id: 4, code: 'M1-barrel-4', name: 'M1 机筒4区', setpoint: 202 },
  { id: 5, code: 'M1-adapter-1', name: 'M1 适配器1区', setpoint: 204 },
  { id: 6, code: 'M1-adapter-2', name: 'M1 适配器2区', setpoint: 205 },
  { id: 7, code: 'M1-adapter-3', name: 'M1 适配器3区', setpoint: 206 },
  { id: 8, code: 'M1-adapter-4', name: 'M1 适配器4区', setpoint: 207 },
];
const zoneOffset = [0.1, -0.2, 0.3, -0.1, 0.2, -0.3, 0.15, -0.05];
const timeDrift = [0, 0.05, 0.1, 0.2, 0.35, 0.55, 0.7];
const haulOffFeedback = [0, 0.01, 0.02, 0.03, 0.08, 0.17, 0.26];
const processRows = baseTimes.map((t, i) => ({
  id: i + 1,
  code: `PR-${String(i + 1).padStart(3, '0')}`,
  batchId: BATCH.d0032,
  recordTime: t,
  haulOffFeedback: 12.62 + haulOffFeedback[i],
}));

// ---------- 输出 ----------
w('-- =====================================================================');
w('-- PPR 质量智能分析助手 · 基线数据（MySQL 8.0）');
w('-- 由 tools/gen-seed.mjs 生成，请勿手工修改；改数据请改生成脚本或直接改库');
w('-- ---------------------------------------------------------------------');
w('-- 前置：先执行 schema.sql（本脚本按全新库设计，重复执行会因主键冲突报错）');
w('-- 数据性质：联调基线数据，data_source.is_simulated = 1，');
w('--           不得作为正式生产能力或合格判定依据');
w('-- =====================================================================');
w();
w('USE ppr_quality;');
w("SET NAMES utf8mb4;");
w("SET time_zone = '+08:00';");
w();
w('START TRANSACTION;');
w();

// 角色
w('-- ---------- A. 角色与用户（种子用户初始无密码，必须首登重置） ----------');
w('INSERT INTO sys_role (id, code, name, description, is_builtin) VALUES');
w(
  [
    [1, 'admin', '系统管理员', '账号、字典与规则维护', 1],
    [2, 'quality_manager', '质量负责人', '定稿与结案确认', 1],
    [3, 'quality_engineer', '质量工程师', '异常诊断、结论确认与 8D 编制', 1],
    [4, 'production_leader', '生产领班', '现场处置与生产状态确认', 1],
    [5, 'equipment_engineer', '设备工程师', '设备与工艺参数核查', 1],
    [6, 'viewer', '只读查看', '只读访问监控与归档', 1],
  ]
    .map((r) => `  (${r[0]}, ${q(r[1])}, ${q(r[2])}, ${q(r[3])}, ${r[4]})`)
    .join(',\n') + ';'
);
w();
w('INSERT INTO sys_user (id, username, password_hash, must_reset_password, display_name, employee_no, email, department, status) VALUES');
w(
  [
    [1, 'admin', '系统管理员', 'EMP0001', 'admin@example.com', '信息部'],
    [2, 'qe_zhang', '张工', 'EMP0002', 'zhang@example.com', '质量部'],
    [3, 'pl_li', '李领班', 'EMP0003', 'li@example.com', '生产部'],
    [4, 'ee_wang', '王工', 'EMP0004', 'wang@example.com', '设备部'],
    [5, 'qm_zhao', '赵主管', 'EMP0005', 'zhao@example.com', '质量部'],
  ]
    .map((u) => `  (${u[0]}, ${q(u[1])}, NULL, 1, ${q(u[2])}, ${q(u[3])}, ${q(u[4])}, ${q(u[5])}, 'active')`)
    .join(',\n') + ';'
);
w();
w('-- 角色分配：admin / 质量工程师 / 生产领班 / 设备工程师 / 质量负责人');
w('INSERT INTO sys_user_role (user_id, role_id) VALUES (1, 1), (2, 3), (3, 4), (4, 5), (5, 2);');
w();

// 数据来源
w('-- ---------- 数据来源字典（全部标记为联调模拟来源） ----------');
w('INSERT INTO data_source (id, code, name, system_type, is_simulated, description, sort_no) VALUES');
w(
  [
    [SRC.manual, 'manual_entry', '生产录入', 'manual', 1, '现场录入的模拟数据'],
    [SRC.mes, 'mes_demo', 'MES模拟', 'mes', 1, '模拟 MES 生产数据，未接入真实 MES'],
    [SRC.qms, 'qms_demo', 'QMS模拟', 'qms', 1, '模拟 QMS 检验数据，未接入真实 QMS'],
    [SRC.device, 'device_demo', '设备采集', 'device', 1, '模拟设备逐小时采集数据，未接入真实数采'],
    [SRC.local模拟, 'inspection_ledger', '抽检台账', 'other', 1, '样管抽检记录的本地模拟数据集'],
    [SRC.virtualProcess, 'virtual_process_data', '工艺记录', 'other', 1, '温区与牵引的模拟工艺数据'],
  ]
    .map((r) => `  (${r[0]}, ${q(r[1])}, ${q(r[2])}, ${q(r[3])}, ${r[4]}, ${q(r[5])}, ${r[0]})`)
    .join(',\n') + ';'
);
w();

// 产线 / 主数据
w('-- ---------- B. 产线、产品类别、规格、设备 ----------');
w("INSERT INTO production_line (id, code, name, workshop, description) VALUES (1, 'LINE-A', '产线 A', '挤出车间', '模拟产线');");
w();
w("INSERT INTO product_category (id, code, name, description) VALUES (1, 'CAT-PPR', 'PPR 管材', '产品主数据');");
w();
w(
  "INSERT INTO product_spec (id, code, name, category_id, nominal_outer_diameter_mm, nominal_wall_thickness_mm, ovality_max_mm, status) VALUES\n" +
    `  (1, 'SPEC-25-42', '25×4.2', 1, 25.000, 4.200, 0.350, 'enabled');`
);
w();
w(
  "INSERT INTO equipment_type (id, code, name, description) VALUES\n" +
    "  (1, 'ETYPE-EXTRUDER', '挤出机', '设备类型'),\n" +
    "  (2, 'ETYPE-HAULOFF', '牵引机', '设备类型');"
);
w();
w(
  "INSERT INTO equipment (id, code, name, type_id, line_id, status, description) VALUES\n" +
    "  (1, 'EQ-EX-01', '挤出机-01', 1, 1, 'enabled', '设备'),\n" +
    "  (2, 'EQ-HO-01', '牵引机-01', 2, 1, 'enabled', '设备');"
);
w();

// 指标
w('-- ---------- C. 质量指标、限值、过程参数、温区 ----------');
w('INSERT INTO quality_metric (id, code, name, unit, decimal_scale, metric_role, derived_expr, check_direction_hint, sort_no) VALUES');
w(
  [
    [METRIC.outerDiameter, 'outer_diameter', '外径', 'mm', 3, 'primary', null, '优先核查真空定径、冷却、出料与牵引匹配；这些是排查方向，不是已验证根因。', 1],
    [METRIC.minWallThickness, 'min_wall_thickness', '最小壁厚', 'mm', 3, 'primary', null, '区分整体变薄迹象与局部最薄处变化；缺少其他壁厚测点时，不能据此断定整体变薄。', 2],
    [METRIC.maxWallThickness, 'max_wall_thickness', '最大壁厚', 'mm', 3, 'raw', null, null, 3],
    [METRIC.maxOuterDiameter, 'max_outer_diameter', '最大外径', 'mm', 3, 'raw', null, null, 4],
    [METRIC.minOuterDiameter, 'min_outer_diameter', '最小外径', 'mm', 3, 'raw', null, null, 5],
    [METRIC.ovality, 'ovality', '不圆度', 'mm', 3, 'derived', 'max_outer_diameter - min_outer_diameter', '先核对同一样管同一截面的最大/最小外径和测量口径，再核查定径、冷却、支撑与牵引。', 6],
  ]
    .map(
      (m) =>
        `  (${m[0]}, ${q(m[1])}, ${q(m[2])}, ${q(m[3])}, ${m[4]}, '${m[5]}', ${q(m[6])}, ${q(m[7])}, ${m[8]})`
    )
    .join(',\n') + ';'
);
w();
w('-- 待标定限值：limit_type=demo，早期方案明确"待标定限值不代表国标要求，不作合格判定"');
w('INSERT INTO metric_spec_limit (spec_id, metric_id, lower_limit, upper_limit, limit_type, calibration_status, remark) VALUES');
w(
  [
    [METRIC.outerDiameter, 25.0, 25.5],
    [METRIC.minWallThickness, 4.2, 4.8],
    [METRIC.ovality, 0.0, 0.35],
  ]
    .map((r) => `  (1, ${r[0]}, ${r[1].toFixed(3)}, ${r[2].toFixed(3)}, 'demo', 'demo', '待标定限值，正式标准与产品限值待确认')`)
    .join(',\n') + ';'
);
w();
w(
  "INSERT INTO process_parameter (id, code, name, unit, decimal_scale, sort_no) VALUES\n" +
    "  (1, 'temperature', '温度', '°C', 1, 1),\n" +
    "  (2, 'pressure', '压力', 'MPa', 2, 2),\n" +
    "  (3, 'haul_off_speed', '牵引速度', 'm/min', 2, 3);"
);
w();
w('-- 指标与影响因素关联 [对应 metrics.influences]');
w(
  'INSERT INTO metric_influence (metric_id, parameter_id, remark) VALUES\n' +
    `  (${METRIC.outerDiameter}, ${PARAM.temperature}, '模拟关联，未验证因果'),\n` +
    `  (${METRIC.outerDiameter}, ${PARAM.pressure}, '模拟关联，未验证因果'),\n` +
    `  (${METRIC.minWallThickness}, ${PARAM.temperature}, '模拟关联，未验证因果'),\n` +
    `  (${METRIC.minWallThickness}, ${PARAM.haulOffSpeed}, '模拟关联，未验证因果'),\n` +
    `  (${METRIC.ovality}, ${PARAM.temperature}, '模拟关联，未验证因果'),\n` +
    `  (${METRIC.ovality}, ${PARAM.pressure}, '模拟关联，未验证因果'),\n` +
    `  (${METRIC.ovality}, ${PARAM.haulOffSpeed}, '模拟关联，未验证因果');`
);
w();
w('INSERT INTO temp_zone (id, code, name, equipment_id, default_setpoint_c, sort_no) VALUES');
w(zoneDefs.map((z) => `  (${z.id}, ${q(z.code)}, ${q(z.name)}, ${EXTRUDER}, ${z.setpoint.toFixed(2)}, ${z.id})`).join(',\n') + ';');
w();

// 批次
w('-- ---------- D. 生产批次、产品数据、设备采集、工艺记录 ----------');
w("INSERT INTO production_batch (id, batch_no, spec_id, line_id, extruder_id, haul_off_id, production_group, start_time, batch_status, data_source_id) VALUES");
w(
  [
    [BATCH.dm, 'DM-B-001', 'A 组', '2026-10-10 08:00:00'],
    [BATCH.c0034, '12121C0034', 'C组', '2026-10-09 08:00:00'],
    [BATCH.d0029, '12121D0029', 'D组', '2026-10-09 08:00:00'],
    [BATCH.d0032, '12121D0032', 'D组', '2026-10-09 08:00:00'],
  ]
    .map((b) => `  (${b[0]}, ${q(b[1])}, 1, 1, ${EXTRUDER}, ${HAULOFF}, ${q(b[2])}, ${dt(b[3])}, 'completed', ${SRC.mes})`)
    .join(',\n') + ';'
);
w();
w('-- 产品数据：批次号 + 生产日期唯一（一个产品只有一份）');
w('INSERT INTO product_data (id, code, batch_id, production_date, data_source_id, remark) VALUES');
w(productRows.map((p) => `  (${p.id}, ${q(p.code)}, ${p.batchId}, '${p.date}', ${SRC.mes}, '早期方案 模拟 产品数据')`).join(',\n') + ';');
w();
w('INSERT INTO product_data_value (product_data_id, metric_id, metric_value, is_derived) VALUES');
w(
  productRows
    .flatMap((p) => [
      `  (${p.id}, ${METRIC.outerDiameter}, ${p.od.toFixed(4)}, 0)`,
      `  (${p.id}, ${METRIC.minWallThickness}, ${p.min.toFixed(4)}, 0)`,
      `  (${p.id}, ${METRIC.maxWallThickness}, ${p.max.toFixed(4)}, 0)`,
      `  (${p.id}, ${METRIC.ovality}, ${p.ov.toFixed(4)}, 1)`,
    ])
    .join(',\n') + ';'
);
w();
w('-- 设备采集数据：设备编号 + 生产日期 + 采集时间唯一，每小时 1 条');
w('INSERT INTO equipment_reading (id, code, batch_id, production_date, equipment_id, collect_time, collected_at, data_source_id) VALUES');
w(
  readingRows
    .map(
      (r) =>
        `  (${r.id}, ${q(r.code)}, ${r.batchId}, '${r.date}', ${r.equipmentId}, '${r.collectTime}:00', ${dt(r.collectedAt)}, ${SRC.mes})`
    )
    .join(',\n') + ';'
);
w();
w('INSERT INTO equipment_reading_value (reading_id, parameter_id, parameter_value) VALUES');
w(
  readingValueRows
    .map((v) => `  (${v.readingId}, ${v.parameterId}, ${v.value})`)
    .join(',\n') + ';'
);
w();
w('-- 工艺记录（早期方案 scenarios[].process；四个异常场景内容一致，此处只写一份）');
w('INSERT INTO process_record (id, code, batch_id, equipment_id, record_time, data_source_id, time_match_status, haul_off_feedback_mpm, pipe_line_speed_mpm, mass_output_kgh, measured_unit_weight_kgpm, production_group) VALUES');
w(
  processRows
    .map(
      (p) =>
        `  (${p.id}, ${q(p.code)}, ${p.batchId}, ${EXTRUDER}, ${dt(p.recordTime)}, ${SRC.virtualProcess}, 'pending', ${p.haulOffFeedback.toFixed(2)}, 12.70, 186.00, 0.2600, 'D组')`
    )
    .join(',\n') + ';'
);
w();
w('INSERT INTO process_zone_value (process_record_id, zone_id, setpoint_c, feedback_c) VALUES');
w(
  processRows
    .flatMap((p, i) =>
      zoneDefs.map(
        (z) => `  (${p.id}, ${z.id}, ${z.setpoint.toFixed(2)}, ${(z.setpoint + zoneOffset[z.id - 1] + timeDrift[i]).toFixed(2)})`
      )
    )
    .join(',\n') + ';'
);
w();

// 抽检记录
w('-- ---------- F. 样管抽检记录（早期方案 normalRecords 基线：3 批次 × 7 时间） ----------');
w('INSERT INTO inspection_record (id, code, sample_no, batch_id, spec_id, production_group, inspect_time, measurement_stage, inspection_method, instrument_info, quality_flag, simulated_ovality, data_source_id, record_status) VALUES');
w(
  inspectionRows
    .map(
      (r) =>
        `  (${r.id}, ${q(r.code)}, ${q(r.sampleNo)}, ${r.batchId}, 1, ${q(r.group)}, ${dt(r.inspectTime)}, 'unconfirmed', '待确认', '待确认', 'none', 0, ${SRC.local模拟}, 'valid')`
    )
    .join(',\n') + ';'
);
w();
w('-- 抽检指标值：不圆度在本基线中无数据 → 不写值行，接口应返回"无数据"');
w('INSERT INTO inspection_value (record_id, metric_id, metric_value, is_derived, is_simulated) VALUES');
w(
  inspectionRows
    .flatMap((r) => [
      `  (${r.id}, ${METRIC.outerDiameter}, ${r.outerDiameter.toFixed(4)}, 0, 1)`,
      `  (${r.id}, ${METRIC.minWallThickness}, ${r.minWallThickness.toFixed(4)}, 0, 1)`,
      `  (${r.id}, ${METRIC.maxWallThickness}, ${r.maxWallThickness.toFixed(4)}, 0, 1)`,
    ])
    .join(',\n') + ';'
);
w();

// 规则
w('-- ---------- 预警规则 R1–R5（顺序判断；阈值均为未标定阈值，待现场验证） ----------');
w('INSERT INTO alert_rule (id, code, name, risk_type, evaluate_order, rule_category, metric_id, params_json, calibration_status, is_terminal, description) VALUES');
w(
  // [id, code, name, risk_type, evaluate_order, rule_category, metric_id, params_json, is_terminal, description]
  [
    [1, 'R1', '数据记录差异待核对', 'error', 1, 'data_consistency', null, '{"tolerance_mm":0.05,"match_window_minutes":30}', 0, '两条来源记录差值超过容差：先核对样管编号与原始记录，不作产品不合格结论'],
    [2, 'R2', '原始测量数据错误 / 样管规格匹配待核对', 'error', 2, 'data_validity', null, '{}', 0, '最大外径小于最小外径、缺少同截面测点，或记录与当前规格差异明显时触发'],
    [3, 'R3', '待标定限值对照（待确认）', 'medium', 3, 'spec_limit', null, '{}', 0, '对照 metric_spec_limit；limit_type=demo 时不构成合格判定'],
    [4, 'R4', '待复核趋势', 'medium', 4, 'trend', null, '{"consecutive":3,"minimum_change_mm":0.015,"maximum_gap_minutes":240}', 0, '连续同向变化达阈值：需人工复核运行连续性，停机/换规格状态由 production_event 提供'],
    [5, 'R5', '未发现模拟框架触发项', 'normal', 5, 'fallback', null, '{}', 1, '兜底规则：未触发任何项，不代表产品已完成正式判定'],
  ]
    .map(
      (r) =>
        `  (${r[0]}, ${q(r[1])}, ${q(r[2])}, '${r[3]}', ${r[4]}, '${r[5]}', ${r[6]}, CAST(${q(r[7])} AS JSON), 'demo', ${r[8]}, ${q(r[9])})`
    )
    .join(',\n') + ';'
);
w();
w('COMMIT;');
w();
w('-- =====================================================================');
w('-- 校验查询（可选执行）');
w('-- =====================================================================');
w('-- SELECT COUNT(*) AS batch_cnt FROM production_batch;                 -- 4');
w('-- SELECT COUNT(*) AS reading_cnt FROM equipment_reading;              -- 132');
w('-- SELECT COUNT(*) AS reading_value_cnt FROM equipment_reading_value;  -- 198');
w('-- SELECT COUNT(*) AS inspection_cnt FROM inspection_record;           -- 21');
w('-- SELECT COUNT(*) AS inspection_value_cnt FROM inspection_value;      -- 63（不圆度无数据）');
w('-- SELECT COUNT(*) AS process_zone_cnt FROM process_zone_value;        -- 56');
w('-- SELECT batch_no, data_source_name, outer_diameter_mm, min_wall_thickness_mm, ovality_effective_mm FROM v_inspection_record_wide LIMIT 5;');
w();
w('-- =====================================================================');
w('-- 可选模拟异常：默认不启用。取消注释后执行，可在新系统中复现');
w('-- 早期方案场景 A（R4 待复核趋势）与场景 C（R1 QMS/MES 差异）。');
w('-- 注意：这会改写基线数据，仅用于模拟环境。');
w('-- =====================================================================');
w('-- 场景 A：批次 12121D0032 最近三个点最小壁厚连续下降 4.29 → 4.27 → 4.26');
w('-- UPDATE inspection_value v JOIN inspection_record r ON r.id = v.record_id');
w('--   JOIN production_batch b ON b.id = r.batch_id');
w('--   SET v.metric_value = CASE r.inspect_time');
w("--       WHEN '2026-10-10 08:20:00' THEN 4.290");
w("--       WHEN '2026-10-10 09:05:00' THEN 4.270");
w("--       WHEN '2026-10-10 09:37:00' THEN 4.260 END");
w("-- WHERE b.batch_no = '12121D0032' AND v.metric_id = 2");
w("--   AND r.inspect_time IN ('2026-10-10 08:20:00','2026-10-10 09:05:00','2026-10-10 09:37:00');");
w('--');
w('-- 场景 C：批次 12121D0032 09:37 记录与 QMS 记录差 0.08 mm（容差 0.05 mm）');
w('-- INSERT INTO data_consistency_check');
w('--   (record_id, metric_id, primary_value, secondary_value, primary_source_id, secondary_source_id, matched_time, tolerance_value, result, conclusion_note)');
w("-- SELECT r.id, 2, 4.310, 4.390, 2, 3, '2026-10-10 09:24:00', 0.0500, 'pending',");
w("--        '模拟 QMS/MES 差异：先核对样管编号与原始检验单，不作产品结论'");
w("-- FROM inspection_record r JOIN production_batch b ON b.id = r.batch_id");
w("-- WHERE b.batch_no = '12121D0032' AND r.inspect_time = '2026-10-10 09:37:00';");
w();

process.stdout.write(out.join('\n'));
