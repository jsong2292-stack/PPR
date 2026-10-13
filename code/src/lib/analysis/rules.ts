/**
 * 预警规则引擎（R1–R5 顺序判断）。
 *
 * 设计目标：把「判定规则」从流程代码里剥离出来，成为可独立阅读、可独立测试的单元。
 *
 * 结构：
 *   RuleContext  —— 规则需要的全部输入（当前记录、批次窗口、规则参数、规格限值、生产事件）
 *   RuleResult   —— 单条规则的判定结果（命中/未命中 + 风险类型 + 原因 + 指标 + 窗口）
 *   AlertRule    —— 规则接口（code / evaluateOrder / evaluate）
 *
 * 顺序判断的语义：按 evaluate_order 从小到大依次执行，**第一条命中即为结论**。
 * 这与现场「先看数据是否可信，再看是否超限，最后看趋势」的作业顺序一致：
 * 数据不可信时不讨论产品质量，避免把录入问题误报成质量异常。
 *
 * 阈值全部来自 alert_rule.params_json 与 metric_spec_limit，不写死在代码里；
 * 标定状态（calibration_status）会进入事件原因文案，提醒使用者阈值尚待现场确认。
 */
import { fmt, toNum, minutesBetween, parseDateTime } from '../format';

/** 指标在一次判定中的取值 */
export interface MetricEvaluationValue {
  metricId: number;
  metricCode: string;
  metricName: string;
  unit: string | null;
  decimalScale: number;
  /** 有效值：null 表示「无数据」 */
  value: number | null;
}

/** 一条抽检记录（判定所需的最小信息） */
export interface InspectionSnapshot {
  recordId: number;
  recordCode: string;
  sampleNo: string;
  batchId: number;
  batchNo: string;
  specId: number;
  productionGroup: string | null;
  inspectTime: string;
  recordStatus: 'valid' | 'void';
  qualityFlag: 'none' | 'qms_mes_mismatch' | 'measurement_error' | 'spec_mismatch' | 'insufficient';
  qualityNote: string | null;
  /** 该记录的全部指标取值（缺失指标不在数组中） */
  values: MetricEvaluationValue[];
}

/** 规格限值 */
export interface SpecLimit {
  metricId: number;
  lowerLimit: number | null;
  upperLimit: number | null;
  limitType: string;
  calibrationStatus: string;
  standardRef: string | null;
}

/** 规则参数（来自 alert_rule.params_json） */
export interface RuleParams {
  tolerance_mm?: number;
  match_window_minutes?: number;
  consecutive?: number;
  minimum_change_mm?: number;
  maximum_gap_minutes?: number;
  [key: string]: unknown;
}

/** 生产事件（用于趋势连续性与窗口解释） */
export interface ProductionEventSnapshot {
  batchId: number;
  eventType: string;
  occurTime: string;
  endTime: string | null;
  durationMinutes: number | null;
  reason: string | null;
}

/** 数据一致性核对记录 */
export interface ConsistencySnapshot {
  recordId: number;
  metricId: number;
  primaryValue: number;
  secondaryValue: number;
  primarySourceName: string | null;
  secondarySourceName: string | null;
  matchedTime: string | null;
  toleranceValue: number;
  result: 'pending' | 'consistent' | 'inconsistent' | 'insufficient';
}

/** 规则上下文 */
export interface RuleContext {
  /** 待判定的记录 */
  record: InspectionSnapshot;
  /**
   * 同批次 + 同规格的历史记录（含当前记录），按抽检时间升序。
   * 趋势规则只使用传入的部分，调用方负责限制查询范围。
   */
  batchRecords: InspectionSnapshot[];
  /** 规格限值，按 metricId 索引 */
  limits: Map<number, SpecLimit>;
  /** 当前记录的数据一致性核对记录，按 metricId 索引 */
  consistency: Map<number, ConsistencySnapshot>;
  /** 同批次的生产事件 */
  productionEvents: ProductionEventSnapshot[];
  /** 规格公称尺寸，用于识别「与当前规格明显不符」的记录 */
  specNominal: { outerDiameter: number | null; wallThickness: number | null };
  /** 当前规则的参数（来自 alert_rule.params_json），由引擎在执行前注入 */
  params: RuleParams;
  /**
   * 规则超时上限（毫秒）。引擎在进入趋势类规则前会检查该值，
   * 避免数据量异常时单条规则长时间占用连接。
   */
  deadlineMs?: number;
}

/** 规则判定结果 */
export interface RuleResult {
  /** 是否命中该规则 */
  hit: boolean;
  /** 命中时给出的风险类型 */
  riskType: 'normal' | 'medium' | 'high' | 'error';
  /** 命中的指标（兜底规则为 null） */
  metricId: number | null;
  /** 触发原因（面向工程师，必须说明「能得出什么结论、不能得出什么结论」） */
  reason: string;
  /** 异常窗口起点 */
  windowStartTime: string | null;
  /** 窗口终点（通常为当前记录时间） */
  windowEndTime: string;
  /** 参与判定的记录 ID（用于事件与记录关联） */
  relatedRecordIds: number[];
}

export interface AlertRule {
  code: string;
  name: string;
  evaluateOrder: number;
  ruleVersion: string;
  calibrationStatus: string;
  params: RuleParams;
  isTerminal: boolean;
  evaluate(context: RuleContext): RuleResult;
}

/** 未命中时的构造工具 */
function miss(context: RuleContext): RuleResult {
  return {
    hit: false,
    riskType: 'normal',
    metricId: null,
    reason: '',
    windowStartTime: null,
    windowEndTime: context.record.inspectTime,
    relatedRecordIds: [],
  };
}

function hit(
  context: RuleContext,
  riskType: RuleResult['riskType'],
  metricId: number | null,
  reason: string,
  options?: { windowStartTime?: string | null; relatedRecordIds?: number[] },
): RuleResult {
  return {
    hit: true,
    riskType,
    metricId,
    reason,
    windowStartTime: options?.windowStartTime ?? null,
    windowEndTime: context.record.inspectTime,
    relatedRecordIds: options?.relatedRecordIds ?? [context.record.recordId],
  };
}

/** 按指标代码取当前记录的值对象 */
function valueOf(context: RuleContext, metricCode: string): MetricEvaluationValue | undefined {
  return context.record.values.find((item) => item.metricCode === metricCode);
}

/** 数值格式化，缺失返回「无数据」 */
function formatValue(value: number | null, digits: number): string {
  return value === null ? '无数据' : fmt(value, digits);
}

// =====================================================================
// R1 · 数据记录差异待核对
// 两条来源（如 MES 与 QMS）对同一指标的记录差值超过容差时命中。
// 语义边界：只提示核对原始记录，不构成产品不合格结论。
// =====================================================================
export const r1DataConsistency: AlertRule = {
  code: 'R1',
  name: '数据记录差异待核对',
  evaluateOrder: 1,
  ruleVersion: 'v1',
  calibrationStatus: 'demo',
  params: {},
  isTerminal: false,
  evaluate(context) {
    for (const check of context.consistency.values()) {
      if (check.result === 'consistent') continue;

      const metric = context.record.values.find((item) => item.metricId === check.metricId);
      const digits = metric?.decimalScale ?? 3;
      const diff = Math.abs(check.primaryValue - check.secondaryValue);
      const tolerance = toNum(check.toleranceValue) ?? 0;

      // 核对未完成时也提示：差异存在但尚未确认样管/时间是否可比
      const pending = check.result === 'pending' || check.result === 'insufficient';
      if (!pending && diff <= tolerance) continue;

      return hit(
        context,
        'error',
        check.metricId,
        `同一指标存在两条来源记录：${check.primarySourceName ?? '主记录'} ${fmt(
          check.primaryValue,
          digits,
        )} ${metric?.unit ?? ''}，${check.secondarySourceName ?? '待核对记录'} ${fmt(
          check.secondaryValue,
          digits,
        )} ${metric?.unit ?? ''}，差值 ${fmt(diff, digits)} ${metric?.unit ?? ''}` +
          `，${pending ? '核对结论尚未确认' : `大于比对容差 ${fmt(tolerance, digits)} ${metric?.unit ?? ''}`}` +
          `。请先核对样管编号、原始检验单与仪器，差异核实前不作产品质量结论。`,
        { windowStartTime: check.matchedTime, relatedRecordIds: [check.recordId] },
      );
    }
    return miss(context);
  },
};

// =====================================================================
// R2 · 原始测量数据错误或样管规格匹配待核对
// 两类问题都归到「数据不可信」，必须在讨论产品质量之前解决：
//   1) 物理关系不成立（非正值、最大值小于最小值、最小壁厚大于最大壁厚）
//   2) 测量值与当前规格公称尺寸差异过大（疑似样管或规格匹配错误）
// =====================================================================
export const r2MeasurementValidity: AlertRule = {
  code: 'R2',
  name: '原始测量数据错误或样管规格匹配待核对',
  evaluateOrder: 2,
  ruleVersion: 'v1',
  calibrationStatus: 'demo',
  params: {},
  isTerminal: false,
  evaluate(context) {
    const { record } = context;

    // 1) 非正值
    for (const item of record.values) {
      if (item.value === null) continue;
      if (item.value <= 0) {
        return hit(
          context,
          'error',
          item.metricId,
          `${item.metricName}测量值为 ${fmt(item.value, item.decimalScale)} ${
            item.unit ?? ''
          }，不是有效测量值。请核对原始测点与录入内容，本记录不参与规格判定。`,
        );
      }
    }

    // 2) 同截面外径的物理关系：最大外径必须不小于最小外径
    const maxOuter = valueOf(context, 'max_outer_diameter');
    const minOuter = valueOf(context, 'min_outer_diameter');
    if (maxOuter?.value != null && minOuter?.value != null && maxOuter.value < minOuter.value) {
      return hit(
        context,
        'error',
        maxOuter.metricId,
        `同一样管同一截面的最大外径 ${fmt(maxOuter.value, maxOuter.decimalScale)} ${
          maxOuter.unit ?? ''
        } 小于最小外径 ${fmt(minOuter.value, minOuter.decimalScale)} ${
          minOuter.unit ?? ''
        }，物理关系不成立。请核对原始测点与测量方向。`,
      );
    }

    // 3) 壁厚关系：最小壁厚不得大于最大壁厚
    const minWall = valueOf(context, 'min_wall_thickness');
    const maxWall = valueOf(context, 'max_wall_thickness');
    if (minWall?.value != null && maxWall?.value != null && minWall.value > maxWall.value) {
      return hit(
        context,
        'error',
        minWall.metricId,
        `最小壁厚 ${fmt(minWall.value, minWall.decimalScale)} ${minWall.unit ?? ''} 大于最大壁厚 ${fmt(
          maxWall.value,
          maxWall.decimalScale,
        )} ${maxWall.unit ?? ''}，请核对原始测点。`,
      );
    }

    // 4) 与规格公称尺寸明显不符（样管身份或规格映射可能有误）
    const { specNominal } = context;
    const outer = valueOf(context, 'outer_diameter');
    if (outer?.value != null && specNominal.outerDiameter) {
      const deviation = Math.abs(outer.value - specNominal.outerDiameter);
      // 超过公称外径 10% 视为明显不符；这是匹配性检查，不是合格判定
      if (deviation > specNominal.outerDiameter * 0.1) {
        return hit(
          context,
          'error',
          outer.metricId,
          `外径测量值 ${fmt(outer.value, outer.decimalScale)} ${outer.unit ?? ''} 与当前规格公称外径 ${fmt(
            specNominal.outerDiameter,
            3,
          )} mm 相差 ${fmt(deviation, 3)} mm，差异明显。请先核对样管编号、规格映射与原始检验单，不触发产品不合格结论。`,
        );
      }
    }
    if (minWall?.value != null && specNominal.wallThickness) {
      const deviation = Math.abs(minWall.value - specNominal.wallThickness);
      if (deviation > specNominal.wallThickness * 0.2) {
        return hit(
          context,
          'error',
          minWall.metricId,
          `最小壁厚测量值 ${fmt(minWall.value, minWall.decimalScale)} ${minWall.unit ?? ''} 与当前规格公称壁厚 ${fmt(
            specNominal.wallThickness,
            3,
          )} mm 相差 ${fmt(deviation, 3)} mm，差异明显。请先核对样管身份与规格映射。`,
        );
      }
    }

    return miss(context);
  },
};

// =====================================================================
// R3 · 规格限值对照
// 测量值落在规格上下限之外时命中。
// 限值来自 metric_spec_limit；标定状态会写入原因文案。
// =====================================================================
export const r3SpecLimit: AlertRule = {
  code: 'R3',
  name: '规格限值对照',
  evaluateOrder: 3,
  ruleVersion: 'v1',
  calibrationStatus: 'demo',
  params: {},
  isTerminal: false,
  evaluate(context) {
    for (const item of context.record.values) {
      if (item.value === null) continue;
      const limit = context.limits.get(item.metricId);
      if (!limit) continue;

      const lower = toNum(limit.lowerLimit);
      const upper = toNum(limit.upperLimit);
      const digits = item.decimalScale;

      let violation: string | null = null;
      if (lower !== null && item.value < lower) {
        violation = `低于下限 ${fmt(lower, digits)} ${item.unit ?? ''} 共 ${fmt(
          lower - item.value,
          digits,
        )} ${item.unit ?? ''}`;
      } else if (upper !== null && item.value > upper) {
        violation = `高于上限 ${fmt(upper, digits)} ${item.unit ?? ''} 共 ${fmt(
          item.value - upper,
          digits,
        )} ${item.unit ?? ''}`;
      }
      if (!violation) continue;

      const calibrationNote =
        limit.calibrationStatus === 'validated'
          ? limit.standardRef
            ? `对照依据：${limit.standardRef}。`
            : '对照依据：已标定规格限值。'
          : '当前规格限值尚未完成现场标定，本条仅用于提示复核，不作为合格判定依据。';

      return hit(
        context,
        'medium',
        item.metricId,
        `${item.metricName}测量值 ${fmt(item.value, digits)} ${item.unit ?? ''}，${violation}（对照范围 ${formatValue(
          lower,
          digits,
        )}–${formatValue(upper, digits)} ${item.unit ?? ''}）。${calibrationNote}`,
      );
    }
    return miss(context);
  },
};

// =====================================================================
// R4 · 连续抽检点趋势变化待复核
// 同一批次、同一规格的连续可比较点同向变化幅度超过阈值时命中。
//
// 「可比较」的判定条件（全部满足才算连续）：
//   - 与当前记录同批次、同规格，且抽检时间不晚于当前记录
//   - 记录有效（record_status = valid）且该指标有数值
//   - 相邻两点间隔不超过 params.maximum_gap_minutes
//   - 两点之间没有停机 / 换规格事件
// =====================================================================
export const r4Trend: AlertRule = {
  code: 'R4',
  name: '连续抽检点趋势变化待复核',
  evaluateOrder: 4,
  ruleVersion: 'v1',
  calibrationStatus: 'demo',
  params: {},
  isTerminal: false,
  evaluate(context) {
    const consecutive = numericParam(context, 'consecutive', 3);
    const minimumChange = numericParam(context, 'minimum_change_mm', 0.015);
    const maximumGapMinutes = numericParam(context, 'maximum_gap_minutes', 240);

    // 趋势比较窗口：默认「同一生产日」。
    // 理由：跨日比较会把交接班、清洗、开停机造成的水平位移误判成趋势，
    // 现场判断趋势也是按班次/生产日进行的。
    // 需要更长窗口时把 maximum_window_hours 调大（例如跨夜连续生产设为 48），
    // 参数存在 alert_rule.params_json，由系统管理 → 预警规则维护。
    const maximumWindowHours = numericParam(context, 'maximum_window_hours', 24);
    const windowStartMs =
      (parseDateTime(context.record.inspectTime) ?? 0) - maximumWindowHours * 3_600_000;
    const targetDay = context.record.inspectTime.slice(0, 10);
    const sameCalendarDay = maximumWindowHours <= 24;

    const candidates = context.batchRecords
      .filter(
        (item) =>
          item.batchId === context.record.batchId &&
          item.specId === context.record.specId &&
          item.recordStatus === 'valid' &&
          // 24 小时以内按生产日切分；超过 24 小时按滚动时间窗，避免参数名与行为不符
          (sameCalendarDay
            ? item.inspectTime.slice(0, 10) === targetDay
            : (parseDateTime(item.inspectTime) ?? 0) >= windowStartMs) &&
          (parseDateTime(item.inspectTime) ?? 0) <= (parseDateTime(context.record.inspectTime) ?? 0),
      )
      .sort((a, b) => (parseDateTime(a.inspectTime) ?? 0) - (parseDateTime(b.inspectTime) ?? 0));

    // 逐个主指标检查趋势（外径 / 最小壁厚 / 不圆度）
    for (const metric of context.record.values) {
      if (metric.value === null) continue;

      const series: InspectionSnapshot[] = [];
      const targetIndex = candidates.findIndex((item) => item.recordId === context.record.recordId);
      if (targetIndex < 0) continue;

      series.push(candidates[targetIndex]);
      for (let index = targetIndex; index > 0 && series.length < consecutive; index -= 1) {
        const previous = candidates[index - 1];
        const current = candidates[index];

        const gap = minutesBetween(previous.inspectTime, current.inspectTime);
        if (gap === null || gap <= 0 || gap > maximumGapMinutes) break;
        if (previous.recordStatus !== 'valid') break;
        if (hasBreakEvent(context, previous.inspectTime, current.inspectTime)) break;

        const previousValue = previous.values.find((item) => item.metricId === metric.metricId)?.value;
        if (previousValue === null || previousValue === undefined) break;

        series.unshift(previous);
      }

      if (series.length < consecutive) continue;

      const values = series.map(
        (item) => item.values.find((entry) => entry.metricId === metric.metricId)?.value ?? null,
      );
      if (values.some((value) => value === null)) continue;

      const numbers = values as number[];
      const deltas = numbers.slice(1).map((value, index) => value - numbers[index]);
      const sameDirection = deltas.every((delta) => delta > 0) || deltas.every((delta) => delta < 0);
      const change = Math.abs(numbers[numbers.length - 1] - numbers[0]);
      if (!sameDirection || change < minimumChange) continue;

      const digits = metric.decimalScale;
      const trendText = numbers.map((value) => fmt(value, digits)).join(' → ');
      const breakNote = describeBreakEvents(context, series[0].inspectTime, context.record.inspectTime);

      return hit(
        context,
        'medium',
        metric.metricId,
        `最近 ${consecutive} 个连续可比较点的${metric.metricName}为 ${trendText} ${
          metric.unit ?? ''
        }，${
          numbers[numbers.length - 1] < numbers[0] ? '下降' : '上升'
        } ${fmt(change, digits)} ${metric.unit ?? ''}，超过趋势阈值 ${fmt(
          minimumChange,
          digits,
        )} ${metric.unit ?? ''}。${breakNote}趋势为待复核变化，请结合运行连续性与工艺记录判断，不预测必然不合格。`,
        {
          windowStartTime: series[0].inspectTime,
          relatedRecordIds: series.map((item) => item.recordId),
        },
      );
    }
    return miss(context);
  },
};

/** 读取规则参数（params 由引擎在调用 evaluate 前注入 context） */
function numericParam(context: RuleContext, key: string, fallback: number): number {
  return toNum(context.params?.[key]) ?? fallback;
}

/** 两点之间是否存在停机 / 换规格事件 */
function hasBreakEvent(context: RuleContext, from: string, to: string): boolean {
  const start = parseDateTime(from) ?? 0;
  const end = parseDateTime(to) ?? 0;
  return context.productionEvents.some((event) => {
    if (!['stop', 'spec_changeover'].includes(event.eventType)) return false;
    const occur = parseDateTime(event.occurTime) ?? 0;
    return occur >= start && occur <= end;
  });
}

/** 生成运行连续性说明，避免工程师误判趋势成因 */
function describeBreakEvents(context: RuleContext, from: string, to: string): string {
  const start = parseDateTime(from) ?? 0;
  const end = parseDateTime(to) ?? 0;
  const related = context.productionEvents.filter((event) => {
    const occur = parseDateTime(event.occurTime) ?? 0;
    return occur >= start && occur <= end;
  });
  if (!related.length) return '该窗口内未记录停机或换规格事件。';
  const label = { stop: '停机', spec_changeover: '换规格', adjustment: '调机', restart: '复产' } as Record<
    string,
    string
  >;
  return `该窗口内存在${related
    .map((event) => `${label[event.eventType] ?? event.eventType}（${event.occurTime}${
      event.reason ? ` · ${event.reason}` : ''
    }）`)
    .join('、')}记录，运行连续性受限，趋势需人工复核。`;
}

// =====================================================================
// R5 · 兜底规则
// R1–R4 均未命中时给出「按当前规则集未发现问题」，并明确这不等于合格判定。
// =====================================================================
export const r5Fallback: AlertRule = {
  code: 'R5',
  name: '未命中预警规则',
  evaluateOrder: 5,
  ruleVersion: 'v1',
  calibrationStatus: 'demo',
  params: {},
  isTerminal: true,
  evaluate(context) {
    return {
      hit: true,
      riskType: 'normal',
      metricId: null,
      reason:
        '按当前规则集（R1–R4）未发现问题。本条只表示规则未触发，' +
        '不代表产品已完成正式合格判定，也不能替代成品检验结论。',
      windowStartTime: null,
      windowEndTime: context.record.inspectTime,
      relatedRecordIds: [context.record.recordId],
    };
  },
};

/** 内置规则注册表：新增规则只需在这里追加并给出 evaluateOrder */
export const BUILTIN_RULES: AlertRule[] = [
  r1DataConsistency,
  r2MeasurementValidity,
  r3SpecLimit,
  r4Trend,
  r5Fallback,
];

/**
 * 顺序执行规则集，返回第一条命中的结果。
 *
 * @param rules 已按数据库 evaluate_order 排序、并注入 params 的规则列表
 */
export function evaluateRules(rules: AlertRule[], context: RuleContext): {
  result: RuleResult;
  rule: AlertRule;
} {
  const ordered = [...rules].sort((a, b) => a.evaluateOrder - b.evaluateOrder);
  for (const rule of ordered) {
    const result = rule.evaluate(context);
    if (result.hit) return { result, rule };
  }
  // 没有任何规则命中（正常情况下 R5 会命中）——按「未触发」处理
  const fallback = ordered[ordered.length - 1];
  return {
    result: {
      hit: true,
      riskType: 'normal',
      metricId: null,
      reason: '按当前规则集未发现问题，不代表产品已完成正式合格判定。',
      windowStartTime: null,
      windowEndTime: context.record.inspectTime,
      relatedRecordIds: [],
    },
    rule: fallback,
  };
}
