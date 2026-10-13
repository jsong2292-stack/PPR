/**
 * 规则引擎（应用服务层）。
 *
 * 职责：把「数据库里的规则配置」与「代码里的规则实现」组装起来，
 * 对抽检记录执行顺序判定，并把命中的结果写成预警事件。
 *
 * 关键设计：
 *   1) 规则逻辑写在代码里（src/lib/analysis/rules.ts），阈值写在数据库里。
 *      现场调阈值不需要改代码、重新部署。
 *   2) 事件的唯一键由数据库保证去重，应用层用 INSERT ... ON DUPLICATE KEY
 *      处理并发，不依赖「先查后插」这种有竞态的写法。
 *   3) 判定产生的中间事实（窗口、参与记录）落 alert_event_record，
 *      保证工程师点开事件能看到「依据了哪几条记录」。
 */
import { query, queryOne, type RowDataPacket } from '../db';
import { logger } from '../logger';
import { parseDateTime } from '../format';
import {
  BUILTIN_RULES,
  type AlertRule,
  type InspectionSnapshot,
  type RuleContext,
  type RuleParams,
} from '../analysis/rules';
import { specLimitsForSpec, findSpec } from '../repositories/metricRepository';
import {
  listBatchInspections,
  listInspectionsForScan,
  type InspectionListItem,
} from '../repositories/inspectionRepository';
import {
  insertAlertEvent,
  linkEventRecord,
  type AlertEventListItem,
} from '../repositories/alertEventRepository';
import { listProductionEventsForBatch } from '../repositories/batchRepository';

/** 带数据库标识与阈值的规则（业务逻辑来自内置实现，配置来自数据库） */
export interface ConfiguredRule extends AlertRule {
  ruleId: number;
  enabled: boolean;
  /** alert_rule.params_json 解析后的阈值参数 */
  paramsFromDb: RuleParams;
}

interface RuleRow extends RowDataPacket {
  id: number;
  code: string;
  name: string;
  risk_type: string;
  evaluate_order: number;
  rule_category: string;
  params_json: unknown;
  calibration_status: string;
  is_terminal: number;
  enabled: number;
  rule_version: string;
}

/** 解析 params_json：mysql2 对 JSON 列既可能返回对象也可能返回字符串 */
function parseParams(raw: unknown): RuleParams {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as RuleParams;
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return raw as RuleParams;
  return {};
}

/**
 * 加载规则集。
 *
 * 以代码中的内置实现为准（保证逻辑可审计），用数据库中的行覆盖
 * 名称、顺序、阈值与开关。数据库中若出现代码里没有的规则编码，
 * 会记录告警并跳过 —— 只配置不实现是无效的，必须显式暴露。
 */
export async function loadRules(): Promise<ConfiguredRule[]> {
  const rows = await query<RuleRow>(
    `SELECT id, code, name, risk_type, evaluate_order, rule_category, params_json,
            calibration_status, is_terminal, enabled, rule_version
       FROM alert_rule
      WHERE enabled = 1
      ORDER BY evaluate_order ASC`,
  );

  const byCode = new Map(BUILTIN_RULES.map((rule) => [rule.code, rule]));
  const rules: ConfiguredRule[] = [];

  for (const row of rows) {
    const builtin = byCode.get(String(row.code));
    if (!builtin) {
      logger.warn(`数据库中存在未实现的预警规则，已跳过：${row.code}`);
      continue;
    }
    rules.push({
      ...builtin,
      ruleId: Number(row.id),
      // 数据库只覆盖「可配置部分」，判定逻辑始终来自代码
      name: String(row.name || builtin.name),
      evaluateOrder: Number(row.evaluate_order),
      ruleVersion: String(row.rule_version ?? builtin.ruleVersion),
      calibrationStatus: String(row.calibration_status ?? builtin.calibrationStatus),
      isTerminal: Number(row.is_terminal) === 1,
      enabled: Number(row.enabled) === 1,
      paramsFromDb: parseParams(row.params_json),
    });
  }

  if (!rules.length) {
    logger.warn('没有可用的预警规则（alert_rule 为空或全部停用），规则扫描将不产生事件');
  }
  return rules;
}

/** 把 repository 的列表项转换为规则引擎的判定输入 */
function toSnapshot(item: InspectionListItem): InspectionSnapshot {
  return {
    recordId: item.id,
    recordCode: item.code,
    sampleNo: item.sampleNo,
    batchId: item.batchId,
    batchNo: item.batchNo,
    specId: item.specId,
    productionGroup: item.productionGroup,
    inspectTime: item.inspectTime,
    recordStatus: item.recordStatus,
    qualityFlag: item.qualityFlag as InspectionSnapshot['qualityFlag'],
    qualityNote: item.qualityNote,
    values: Object.entries(item.metrics).map(([code, value]) => ({
      metricId: metricIdLookup.get(code) ?? 0,
      metricCode: code,
      metricName: metricNameLookup.get(code) ?? code,
      unit: metricUnitLookup.get(code) ?? null,
      decimalScale: metricScaleLookup.get(code) ?? 3,
      value: value === null ? null : Number(value),
    })),
  };
}

/** 指标元信息缓存（进程内缓存，指标字典变化极少） */
let metricIdLookup = new Map<string, number>();
let metricNameLookup = new Map<string, string>();
let metricUnitLookup = new Map<string, string | null>();
let metricScaleLookup = new Map<string, number>();

export async function refreshMetricLookups(): Promise<void> {
  const rows = await query<RowDataPacket>(
    'SELECT id, code, name, unit, decimal_scale FROM quality_metric',
  );
  metricIdLookup = new Map(rows.map((row) => [String(row.code), Number(row.id)]));
  metricNameLookup = new Map(rows.map((row) => [String(row.code), String(row.name)]));
  metricUnitLookup = new Map(rows.map((row) => [String(row.code), (row.unit as string) ?? null]));
  metricScaleLookup = new Map(rows.map((row) => [String(row.code), Number(row.decimal_scale ?? 3)]));
}

/** 确保指标元信息已加载 */
async function ensureMetricLookups(): Promise<void> {
  if (metricIdLookup.size === 0) await refreshMetricLookups();
}

/** 数据一致性核对记录（按 metricId 索引） */
async function loadConsistency(recordId: number): Promise<RuleContext['consistency']> {
  const rows = await query<RowDataPacket>(
    `SELECT c.record_id, c.metric_id, c.primary_value, c.secondary_value,
            c.matched_time, c.tolerance_value, c.result,
            ps.name AS primary_source_name, ss.name AS secondary_source_name
       FROM data_consistency_check c
       LEFT JOIN data_source ps ON ps.id = c.primary_source_id
       LEFT JOIN data_source ss ON ss.id = c.secondary_source_id
      WHERE c.record_id = ?`,
    [recordId],
  );
  const map: RuleContext['consistency'] = new Map();
  for (const row of rows) {
    map.set(Number(row.metric_id), {
      recordId: Number(row.record_id),
      metricId: Number(row.metric_id),
      primaryValue: Number(row.primary_value),
      secondaryValue: Number(row.secondary_value),
      primarySourceName: row.primary_source_name,
      secondarySourceName: row.secondary_source_name,
      matchedTime: row.matched_time,
      toleranceValue: Number(row.tolerance_value),
      result: row.result as 'pending' | 'consistent' | 'inconsistent' | 'insufficient',
    });
  }
  return map;
}

/** 组装一次判定所需的上下文 */
export async function buildRuleContext(record: InspectionListItem): Promise<RuleContext> {
  await ensureMetricLookups();

  const [batchRecords, limits, productionEvents, spec, consistency] = await Promise.all([
    listBatchInspections(record.batchId, record.specId, 200),
    specLimitsForSpec(record.specId),
    listProductionEventsForBatch(record.batchId),
    findSpec(record.specId),
    loadConsistency(record.id),
  ]);

  return {
    record: toSnapshot(record),
    batchRecords: batchRecords.map(toSnapshot),
    limits,
    consistency,
    productionEvents: productionEvents.map((event) => ({
      batchId: event.batchId,
      eventType: event.eventType,
      occurTime: event.occurTime,
      endTime: event.endTime,
      durationMinutes: event.durationMinutes,
      reason: event.reason,
    })),
    specNominal: {
      outerDiameter: spec?.nominalOuterDiameter ?? null,
      wallThickness: spec?.nominalWallThickness ?? null,
    },
    params: {},
  };
}

/** 事业部现场默认线速度（用于影响长度估算），来自最近一次工艺记录 */
async function resolveLineSpeed(batchId: number): Promise<number | null> {
  const row = await queryOne<RowDataPacket>(
    `SELECT pipe_line_speed_mpm FROM process_record
      WHERE batch_id = ? AND pipe_line_speed_mpm IS NOT NULL
      ORDER BY record_time DESC LIMIT 1`,
    [batchId],
  );
  return row?.pipe_line_speed_mpm == null ? null : Number(row.pipe_line_speed_mpm);
}

/** 估算影响长度：窗口时长（分钟） × 线速度（m/min） */
async function estimateAffectedLength(
  batchId: number,
  windowStartTime: string | null,
  windowEndTime: string,
): Promise<{ lengthM: number | null; lineSpeed: number | null }> {
  const lineSpeed = await resolveLineSpeed(batchId);
  if (lineSpeed === null || !windowStartTime) return { lengthM: null, lineSpeed };

  const start = parseDateTime(windowStartTime);
  const end = parseDateTime(windowEndTime);
  if (start === null || end === null || end <= start) return { lengthM: null, lineSpeed };

  const minutes = (end - start) / 60_000;
  return { lengthM: Number((minutes * lineSpeed).toFixed(2)), lineSpeed };
}

const EVENT_CODE_PREFIX = 'QE';

/** 事件编号：QE-批次号-日期-序号（同批次同日期内递增） */
async function nextEventCode(batchNo: string, referenceTime: string): Promise<string> {
  const datePart = referenceTime.slice(0, 10).replace(/-/g, '');
  const prefix = `${EVENT_CODE_PREFIX}-${batchNo}-${datePart}-`;
  const row = await queryOne<RowDataPacket>(
    'SELECT code FROM alert_event WHERE code LIKE ? ORDER BY code DESC LIMIT 1',
    [`${prefix}%`],
  );
  const lastSeq = row?.code ? Number(String(row.code).slice(prefix.length)) : 0;
  const next = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

export interface ScanOutcome {
  scanned: number;
  normal: number;
  eventsCreated: number;
  events: AlertEventListItem[];
  skipped: number;
}

/**
 * 对若干抽检记录执行规则判定。
 *
 * @param records 待判定记录（已按时间升序）
 * @param rules 规则集；省略时从数据库加载
 */
export async function evaluateRecords(
  records: InspectionListItem[],
  rules?: ConfiguredRule[],
): Promise<ScanOutcome> {
  const activeRules = rules ?? (await loadRules());
  await ensureMetricLookups();

  let normal = 0;
  let eventsCreated = 0;
  let skipped = 0;

  for (const record of records) {
    if (record.recordStatus !== 'valid') {
      skipped += 1;
      continue;
    }

    const context = await buildRuleContext(record);

    // 逐条规则执行，每次执行前把该规则的参数注入上下文
    let matched: { result: ReturnType<AlertRule['evaluate']>; rule: ConfiguredRule } | null = null;
    const ordered = [...activeRules].sort((a, b) => a.evaluateOrder - b.evaluateOrder);
    for (const rule of ordered) {
      const outcome = rule.evaluate({ ...context, params: rule.paramsFromDb ?? {} });
      if (outcome.hit) {
        matched = { result: outcome, rule };
        break;
      }
    }

    if (!matched) {
      skipped += 1;
      continue;
    }

    // 正常记录不产生事件：R5 的价值在于「明确告知未触发」，而不是堆积噪声
    if (matched.result.riskType === 'normal') {
      normal += 1;
      continue;
    }

    const { result, rule } = matched;
    if (result.metricId === null) {
      skipped += 1;
      continue;
    }

    // 兜底规则不应产生事件
    if (rule.isTerminal) {
      normal += 1;
      continue;
    }

    // 窗口起点必须早于或等于终点：数据核对类规则的「匹配时间」可能晚于抽检时间，
    // 这种情况下窗口起点回落到触发记录时间，避免出现 start > end 的反常窗口。
    const rawStart = result.windowStartTime;
    const startMs = parseDateTime(rawStart);
    const endMs = parseDateTime(result.windowEndTime);
    const windowStartTime =
      rawStart && startMs !== null && endMs !== null && startMs <= endMs
        ? rawStart
        : result.windowEndTime;
    const { lengthM, lineSpeed } = await estimateAffectedLength(
      record.batchId,
      windowStartTime,
      result.windowEndTime,
    );

    const code = await nextEventCode(record.batchNo, result.windowEndTime);
    const eventId = await insertAlertEvent({
      code,
      ruleId: rule.ruleId,
      ruleCode: rule.code,
      ruleVersion: rule.ruleVersion,
      riskType: result.riskType as 'medium' | 'high' | 'error',
      batchId: record.batchId,
      specId: record.specId,
      metricId: result.metricId,
      triggerRecordId: record.id,
      windowStartTime,
      windowEndTime: result.windowEndTime,
      reason: result.reason,
      affectedLengthM: lengthM,
      lineSpeedMpm: lineSpeed,
    });

    for (const [index, recordId] of result.relatedRecordIds.entries()) {
      await linkEventRecord(eventId, recordId, recordId === record.id, index);
    }

    eventsCreated += 1;
  }

  return { scanned: records.length, normal, eventsCreated, events: [], skipped };
}

/** 采集待判定的记录并执行判定 */
export async function scanInspections(options: {
  lookbackHours: number;
  batchSize: number;
}): Promise<ScanOutcome> {
  const from = new Date(Date.now() - options.lookbackHours * 3600_000);
  const pad = (value: number) => String(value).padStart(2, '0');
  const fromText =
    `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())} ` +
    `${pad(from.getHours())}:${pad(from.getMinutes())}:${pad(from.getSeconds())}`;

  const records = await listInspectionsForScan({ from: fromText, limit: options.batchSize });
  return evaluateRecords(records);
}
