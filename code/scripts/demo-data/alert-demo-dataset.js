/**
 * 演示用告警数据集（纯数据 + 判定规则复刻）。
 *
 * 这个模块只做两件事，不碰数据库：
 *   1. 用「标准区间 + 接近带」正向设计出每个检验点的数值，让告警结果可预期；
 *   2. 复刻 alert-engine.ts 的 R0/R3/R5 判定，供生成脚本自检、验证脚本比对。
 *
 * 判定参数必须与 src/lib/quality-analysis/alert-engine.ts 保持一致：
 *   PROXIMITY_RATIO = 0.15、PROXIMITY_RUN_LENGTH = 3、
 *   指标只有 外径 / 壁厚 / 不圆度（不圆度下限恒为 0）。
 *
 * 判定口径提醒（容易误读）：
 *   一个连续接近段只产出 1 条 R5 事件（挂在段末），但段内每个点的 quality_flag 都会被抬到 medium。
 */

/** 演示规格：与库里 SPEC-25X4.2 / PPR S2.5 25×4.2 瓷芯管 一致。 */
const SPEC = {
  code: 'SPEC-25X4.2',
  name: 'PPR S2.5 25×4.2 瓷芯管',
  outer: { lower: 25.0, upper: 25.5 },
  wall: { lower: 4.2, upper: 4.8 },
  ovality: { lower: 0, upper: 0.35 },
};

const PROXIMITY_RATIO = 0.15;
const PROXIMITY_RUN_LENGTH = 3;

const METRICS = [
  { code: 'outer_diameter', label: '外径', suffix: 'OD', key: 'outer_diameter_mm', band: 'outer' },
  { code: 'min_wall_thickness', label: '壁厚', suffix: 'WT', key: 'min_wall_thickness_mm', band: 'wall' },
  { code: 'ovality', label: '不圆度', suffix: 'OV', key: 'ovality_mm', band: 'ovality' },
];

function rangeOf(metric) {
  const { lower, upper } = SPEC[metric.band];
  return { lower, upper, band: (upper - lower) * PROXIMITY_RATIO };
}

/** 判定单一批次的全部指标，返回事件列表与每条记录的质量标记（复刻 planBatch）。 */
function planBatch(rows) {
  const alerts = [];
  /** 以「行下标」代替数据库主键做标识，生成阶段还没有 measurement_id。 */
  const flagByIndex = new Map();
  const weight = { normal: 0, medium: 1, high: 2 };
  const raise = (index, level) => {
    const current = flagByIndex.get(index);
    if (!current || weight[level] > weight[current]) flagByIndex.set(index, level);
  };
  const mm = (value) => `${value.toFixed(3)} mm`;

  for (const metric of METRICS) {
    const series = rows.map((row, index) => {
      const range = rangeOf(metric);
      const value = Number(row[metric.key]);
      const judgeable = Number.isFinite(value);
      const violation = judgeable && (value < range.lower || value > range.upper);
      const distance = judgeable ? Math.min(value - range.lower, range.upper - value) : null;
      return { index, row, value, range, judgeable, violation, proximate: judgeable && !violation && distance <= range.band, runLength: 0 };
    });
    if (!series.some((point) => point.judgeable)) continue;

    const runEnds = new Map();
    for (let start = 0; start < series.length; ) {
      if (!series[start].proximate) { start += 1; continue; }
      let end = start;
      while (end + 1 < series.length && series[end + 1].proximate) end += 1;
      const length = end - start + 1;
      if (length >= PROXIMITY_RUN_LENGTH) {
        for (let i = start; i <= end; i += 1) series[i].runLength = length;
        for (let i = start; i <= end; i += 1) raise(series[i].index, 'medium');
        runEnds.set(end, start);
      }
      start = end + 1;
    }

    for (let index = 0; index < series.length; index += 1) {
      const { row, value, range, judgeable, violation, proximate } = series[index];
      if (!judgeable) continue;
      if (violation) {
        const nearLower = value - range.lower <= range.upper - value;
        const excess = nearLower ? range.lower - value : value - range.upper;
        alerts.push({ point: index + 1, recordNo: row.record_no, metric, metricCode: metric.code, riskLevel: 'high', ruleCode: 'R3',
          text: `${mm(range.lower)}–${mm(range.upper)}，实测 ${mm(value)}，${nearLower ? '低于下限' : '高于上限'} ${mm(excess)}` });
        raise(index, 'high');
        continue;
      }
      const runStart = runEnds.get(index);
      if (runStart !== undefined) {
        const values = series.slice(runStart, index + 1).map((point) => point.value.toFixed(3));
        const nearLower = value - range.lower <= range.upper - value;
        alerts.push({ point: index + 1, recordNo: row.record_no, metric, metricCode: metric.code, riskLevel: 'medium', ruleCode: 'R5',
          text: `${mm(range.lower)}–${mm(range.upper)}，连续 ${series[index].runLength} 点进入接近带（距${nearLower ? '下限' : '上限'} ≤ ${mm(range.band)}，为区间宽度的 15%）：${values.join(' / ')}` });
        raise(index, 'medium');
        continue;
      }
      alerts.push({ point: index + 1, recordNo: row.record_no, metric, metricCode: metric.code, riskLevel: 'normal', ruleCode: 'R0',
        text: `${mm(range.lower)}–${mm(range.upper)}，实测 ${mm(value)}，${proximate ? '已进入接近带但未连续 3 点' : '未进入接近带'}` });
      raise(index, 'normal');
    }
  }

  rows.forEach((row, index) => { row.quality_flag = flagByIndex.get(index) ?? 'normal'; });
  return alerts;
}

/** 把外径/不圆度补成自洽的一组值：不圆度 = 同截面最大外径 - 最小外径。 */
function withOvality(point) {
  const ovality = point.ovality_mm;
  const minOuter = Number((point.outer_diameter_mm - ovality / 3).toFixed(3));
  const maxOuter = Number((minOuter + ovality).toFixed(3));
  return { ...point, max_outer_diameter_mm: maxOuter, min_outer_diameter_mm: minOuter };
}

/** 六个检验点的默认值：三指标都稳稳落在区间中段，作为每个场景的「正常底噪」。 */
function normalPoints(batch, values) {
  return values.map((value, index) => withOvality({
    record_no: `IR-${batch.dateCode}-${String(index + 1).padStart(3, '0')}`,
    sample_no: `S-${batch.sampleBase + index}`,
    inspect_time: `${batch.dateKey} ${String(8 + index).padStart(2, '0')}:${['15', '20', '25', '30', '35', '40'][index]}:00`,
    outer_diameter_mm: value.outer,
    min_wall_thickness_mm: value.wall,
    max_wall_thickness_mm: Number((value.wall + 0.11).toFixed(3)),
    ovality_mm: value.ovality,
    data_source: 'MES_IMPORT',
    quality_flag: '',
    remark: value.remark ?? '',
  }));
}

/**
 * 演示批次定义。
 * design 里每个数组按检验时间顺序给出 6 个点的三指标实测值；
 * expect 是人工写死的设计意图，生成脚本会与 planBatch 的结果比对，任何不一致都会报错。
 */
const BATCHES = [
  {
    batch_no: '12121D0050',
    label: '全正常基线',
    scenario: '场景 0 · 全正常基线',
    production_group: '甲班',
    dateKey: '2026-11-16',
    dateCode: '20261116',
    sampleBase: 500,
    start_time: '2026-11-16 06:00:00',
    end_time: '2026-11-16 16:00:00',
    purpose: '对照基线：18 条事件全部正常，异常页签为空。演示时先看「没有告警」的正常态。',
    design: (batch) => normalPoints(batch, [
      { outer: 25.245, wall: 4.420, ovality: 0.215, remark: '点1 三指标均在区间中段' },
      { outer: 25.235, wall: 4.405, ovality: 0.225, remark: '点2 正常' },
      { outer: 25.255, wall: 4.430, ovality: 0.205, remark: '点3 正常' },
      { outer: 25.240, wall: 4.395, ovality: 0.230, remark: '点4 正常' },
      { outer: 25.250, wall: 4.415, ovality: 0.220, remark: '点5 正常' },
      { outer: 25.230, wall: 4.400, ovality: 0.210, remark: '点6 正常' },
    ]),
    expect: { high: 0, medium: 0, normal: 18, mediumFlaggedRecords: 0, highFlaggedRecords: 0,
      note: '三段连续接近都没有，全部 R0。' },
  },
  {
    batch_no: '12121D0051',
    label: '壁厚连续3点接近下限',
    scenario: '场景 1 · 连续 3 点接近下限（R5 中风险）',
    production_group: '乙班',
    dateKey: '2026-11-17',
    dateCode: '20261117',
    sampleBase: 510,
    start_time: '2026-11-17 06:00:00',
    end_time: '2026-11-17 16:00:00',
    purpose: '壁厚第 2–4 点连续 3 点落进下限接近带 4.200–4.290，第 4 点（段末）产出 1 条中风险事件。',
    design: (batch) => normalPoints(batch, [
      { outer: 25.240, wall: 4.320, ovality: 0.220, remark: '点1 壁厚4.320 距下限0.120，未进接近带' },
      { outer: 25.235, wall: 4.285, ovality: 0.215, remark: '点2 壁厚4.285 距下限0.085 → 进入接近带（第1点）' },
      { outer: 25.250, wall: 4.270, ovality: 0.225, remark: '点3 壁厚4.270 距下限0.070 → 接近带（第2点）' },
      { outer: 25.245, wall: 4.255, ovality: 0.210, remark: '点4 壁厚4.255 距下限0.055 → 接近带（第3点）→ 段末产出R5中风险' },
      { outer: 25.238, wall: 4.360, ovality: 0.220, remark: '点5 壁厚回到4.360，连续段中断' },
      { outer: 25.252, wall: 4.400, ovality: 0.215, remark: '点6 正常' },
    ]),
    expect: { high: 0, medium: 1, normal: 17, mediumFlaggedRecords: 3, highFlaggedRecords: 0,
      note: '队列异常页签 1 条中风险（挂第4点壁厚）；产品数据列表第2/3/4行显示中风险。' },
  },
  {
    batch_no: '12121D0052',
    label: '外径连续4点接近上限+不圆度2点接近',
    scenario: '场景 2 · 连续 4 点接近上限 / 2 点接近不告警（R5 边界）',
    production_group: '甲班',
    dateKey: '2026-11-18',
    dateCode: '20261118',
    sampleBase: 520,
    start_time: '2026-11-18 06:00:00',
    end_time: '2026-11-18 16:00:00',
    purpose: '外径第 1–4 点连续 4 点贴上限接近带，段末只产出 1 条中风险（段长 4 也只是一条）；'
      + '不圆度第 2–3 点只有 2 点接近，按规则不升级，事件文本注明「已进入接近带但未连续 3 点」，用来演示边界反例。',
    design: (batch) => normalPoints(batch, [
      { outer: 25.450, wall: 4.390, ovality: 0.210, remark: '点1 外径25.450 距上限0.050 → 接近带（第1点）' },
      { outer: 25.480, wall: 4.380, ovality: 0.325, remark: '点2 外径接近带（第2点）；不圆度0.325 距上限0.025 → 接近带（第1点）' },
      { outer: 25.470, wall: 4.400, ovality: 0.310, remark: '点3 外径接近带（第3点）；不圆度接近带（第2点，仅2点不升级）' },
      { outer: 25.435, wall: 4.385, ovality: 0.215, remark: '点4 外径接近带（第4点）→ 段末产出R5中风险，段长4' },
      { outer: 25.300, wall: 4.410, ovality: 0.220, remark: '点5 外径回到区间中段，连续段中断' },
      { outer: 25.260, wall: 4.395, ovality: 0.205, remark: '点6 正常' },
    ]),
    expect: { high: 0, medium: 1, normal: 17, mediumFlaggedRecords: 4, highFlaggedRecords: 0,
      note: '不圆度2点接近不升级（边界反例）；外径4点连续段只算1条中风险。' },
  },
  {
    batch_no: '12121D0053',
    label: '三指标越限含一条记录双越限',
    scenario: '场景 3 · 超出标准区间（R3 高风险，含上/下越限与双指标同越）',
    production_group: '乙班',
    dateKey: '2026-11-19',
    dateCode: '20261119',
    sampleBase: 530,
    start_time: '2026-11-19 06:00:00',
    end_time: '2026-11-19 16:00:00',
    purpose: '分别造出「外径越高限」「壁厚越低限」「不圆度越高限」，并让第 4 点同时命中外径越高限与壁厚越低限，'
      + '验证一条记录多指标越限时事件条数与质量标记取最严重值。',
    design: (batch) => normalPoints(batch, [
      { outer: 25.240, wall: 4.420, ovality: 0.330, remark: '点1 正常；不圆度0.330 距上限0.020 单点接近，不升级' },
      { outer: 25.230, wall: 4.170, ovality: 0.230, remark: '点2 壁厚4.170 低于下限4.200 → 高风险R3（低于下限）（越低限）' },
      { outer: 25.250, wall: 4.360, ovality: 0.240, remark: '点3 正常' },
      { outer: 25.520, wall: 4.130, ovality: 0.225, remark: '点4 外径25.520 高于上限25.500 → R3；壁厚4.130 低于下限 → R3（同一条记录双越限）' },
      { outer: 25.245, wall: 4.410, ovality: 0.395, remark: '点5 不圆度0.395 高于上限0.350 → 高风险R3（越高限）' },
      { outer: 25.255, wall: 4.430, ovality: 0.220, remark: '点6 正常' },
    ]),
    expect: { high: 4, medium: 0, normal: 14, mediumFlaggedRecords: 0, highFlaggedRecords: 3,
      note: '高风险事件 4 条（外径1/壁厚2/不圆度1），分属 3 条记录；第4点一条记录贡献 2 条高风险事件（外径 + 壁厚）。' },
  },
];

/**
 * 设备采集曲线：与产品异常时刻对应，让诊断页的工艺趋势图有「看起来相关」的数据。
 * drift 索引按采集点顺序，点数 = DEVICE_SHIFTS 小时。
 */
const DEVICE_SHIFTS = 12;

/** 批次 → 设备曲线的偏移设计（温度/压力/牵引速度相对基准的加法偏移）。 */
const EQUIPMENT_DRIFT = {
  '12121D0050': { temperature: [0.00, 0.04, -0.03, 0.06, -0.02, 0.05, 0.01, -0.04, 0.03, 0.00, 0.05, -0.02],
                  pressure: [0.000, 0.012, -0.008, 0.015, -0.010, 0.006, 0.002, -0.012, 0.009, 0.000, 0.010, -0.006],
                  haul_off: [0.000, 0.008, -0.006, 0.010, -0.004, 0.006, 0.001, -0.008, 0.005, 0.000, 0.007, -0.003] },
  '12121D0051': { temperature: [0.02, 0.00, -0.10, -0.25, -0.42, -0.58, -0.70, -0.66, -0.52, -0.30, -0.15, -0.04],
                  pressure: [0.005, 0.000, 0.030, 0.075, 0.120, 0.170, 0.205, 0.190, 0.150, 0.090, 0.045, 0.010],
                  haul_off: [0.000, 0.004, 0.010, 0.022, 0.035, 0.048, 0.058, 0.055, 0.045, 0.030, 0.015, 0.005] },
  '12121D0052': { temperature: [0.02, 0.10, 0.22, 0.34, 0.42, 0.38, 0.30, 0.22, 0.14, 0.08, 0.03, 0.00],
                  pressure: [0.000, -0.025, -0.060, -0.095, -0.120, -0.110, -0.085, -0.060, -0.040, -0.020, -0.008, 0.000],
                  haul_off: [0.000, 0.006, 0.014, 0.024, 0.032, 0.030, 0.024, 0.017, 0.011, 0.006, 0.002, 0.000] },
  '12121D0053': { temperature: [0.00, -0.08, 0.04, 0.12, 0.20, 0.28, 0.22, 0.16, 0.10, 0.06, 0.03, 0.00],
                  pressure: [0.005, 0.030, -0.015, -0.060, -0.045, -0.020, -0.010, 0.000, 0.005, 0.008, 0.006, 0.000],
                  haul_off: [0.000, 0.012, 0.006, -0.018, 0.024, 0.030, 0.020, 0.012, 0.008, 0.004, 0.002, 0.000] },
};

const DEVICE_PROFILE = {
  temperature_c: { base: 205.0, decimals: 2 },
  pressure_mpa: { base: 12.55, decimals: 3 },
  haul_off_speed_mpm: { base: 8.2, decimals: 3 },
};

/** 每个批次的设备采集时间：从批次开始时间起，每小时一条。 */
function collectTimes(batch) {
  const start = new Date(`${batch.start_time.replace(' ', 'T')}Z`);
  return Array.from({ length: DEVICE_SHIFTS }, (_, index) =>
    new Date(start.getTime() + index * 3600 * 1000));
}

function formatDateTime(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} `
    + `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function buildBatches() {
  return BATCHES.map((definition) => {
    const rows = definition.design(definition);
    return { ...definition, rows, equipment: EQUIPMENT_DRIFT[definition.batch_no] };
  });
}

module.exports = {
  SPEC,
  PROXIMITY_RATIO,
  PROXIMITY_RUN_LENGTH,
  METRICS,
  DEVICE_SHIFTS,
  DEVICE_PROFILE,
  BATCHES,
  buildBatches,
  planBatch,
  collectTimes,
  formatDateTime,
  rangeOf,
};
