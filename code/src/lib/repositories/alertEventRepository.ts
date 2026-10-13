/**
 * 预警事件（repository）。
 *
 * 事件的去重规则由数据库唯一键保证：
 *   (batch_id, rule_id, metric_id, window_start_time)
 * 含义：同一批次 + 同一规则 + 同一指标 + 同一窗口起点只产生一条事件；
 * 窗口推进（window_start_time 变化）后允许再次触发 —— 这与现场
 * 「同一异常持续期间不重复打扰，但病情进展要再次提醒」的诉求一致。
 */
import { execute, query, queryOne, type RowDataPacket } from '../db';
import type { PageResult, RiskType, HandlingStatus } from '../types';

export interface AlertEventListItem {
  id: number;
  code: string;
  ruleCode: string;
  ruleVersion: string | null;
  ruleName: string;
  ruleCalibrationStatus: string;
  riskType: RiskType;
  batchId: number;
  specId: number | null;
  metricId: number;
  batchNo: string;
  productionGroup: string | null;
  specCode: string | null;
  specName: string | null;
  metricCode: string;
  metricName: string;
  metricUnit: string | null;
  metricDecimalScale: number;
  triggerRecordId: number | null;
  triggerRecordCode: string | null;
  triggerSampleNo: string | null;
  windowStartTime: string | null;
  windowEndTime: string;
  reason: string;
  affectedLengthM: number | null;
  lineSpeedMpm: number | null;
  handlingStatus: HandlingStatus;
  handledAt: string | null;
  handlingNote: string | null;
  handlerName: string | null;
  generatedAt: string;
}

export interface AlertEventQuery {
  page: number;
  pageSize: number;
  riskType?: string;
  handlingStatus?: string;
  batchNo?: string;
  ruleCode?: string;
  keyword?: string;
  from?: string;
  to?: string;
  /** 只统计高风险 / 报错（监控首页用） */
  openOnly?: boolean;
}

interface AlertRow extends RowDataPacket {
  id: number;
  code: string;
  rule_code: string;
  rule_version: string | null;
  rule_name: string;
  rule_calibration_status: string;
  risk_type: RiskType;
  batch_id: number;
  spec_id: number | null;
  metric_id: number;
  batch_no: string;
  production_group: string | null;
  spec_code: string | null;
  spec_name: string | null;
  metric_code: string;
  metric_name: string;
  metric_unit: string | null;
  metric_decimal_scale: number;
  trigger_record_id: number | null;
  trigger_record_code: string | null;
  trigger_sample_no: string | null;
  window_start_time: string | null;
  window_end_time: string;
  reason: string;
  affected_length_m: string | null;
  line_speed_mpm: string | null;
  handling_status: HandlingStatus;
  handled_at: string | null;
  handling_note: string | null;
  handler_name: string | null;
  generated_at: string;
}

function mapEvent(row: AlertRow): AlertEventListItem {
  return {
    id: Number(row.id),
    code: String(row.code),
    ruleCode: String(row.rule_code),
    ruleVersion: row.rule_version,
    ruleName: String(row.rule_name ?? ''),
    ruleCalibrationStatus: String(row.rule_calibration_status ?? ''),
    riskType: row.risk_type,
    batchId: Number(row.batch_id),
    specId: row.spec_id === null ? null : Number(row.spec_id),
    metricId: Number(row.metric_id),
    batchNo: String(row.batch_no),
    productionGroup: row.production_group,
    specCode: row.spec_code,
    specName: row.spec_name,
    metricCode: String(row.metric_code),
    metricName: String(row.metric_name ?? ''),
    metricUnit: row.metric_unit,
    metricDecimalScale: Number(row.metric_decimal_scale ?? 3),
    triggerRecordId: row.trigger_record_id === null ? null : Number(row.trigger_record_id),
    triggerRecordCode: row.trigger_record_code,
    triggerSampleNo: row.trigger_sample_no,
    windowStartTime: row.window_start_time,
    windowEndTime: String(row.window_end_time),
    reason: String(row.reason ?? ''),
    affectedLengthM: row.affected_length_m === null ? null : Number(row.affected_length_m),
    lineSpeedMpm: row.line_speed_mpm === null ? null : Number(row.line_speed_mpm),
    handlingStatus: row.handling_status,
    handledAt: row.handled_at,
    handlingNote: row.handling_note,
    handlerName: row.handler_name,
    generatedAt: String(row.generated_at ?? ''),
  };
}

const SELECT_FIELDS = `
  SELECT e.id, e.code, e.rule_code, e.rule_version, e.risk_type,
         e.batch_id, e.spec_id, e.metric_id,
         ar.name AS rule_name, ar.calibration_status AS rule_calibration_status,
         b.batch_no, b.production_group,
         s.code AS spec_code, s.name AS spec_name,
         m.code AS metric_code, m.name AS metric_name, m.unit AS metric_unit,
         m.decimal_scale AS metric_decimal_scale,
         e.trigger_record_id, ir.code AS trigger_record_code, ir.sample_no AS trigger_sample_no,
         e.window_start_time, e.window_end_time, e.reason,
         e.affected_length_m, e.line_speed_mpm,
         e.handling_status, e.handled_at, e.handling_note,
         hu.display_name AS handler_name, e.generated_at
    FROM alert_event e
    JOIN alert_rule ar ON ar.id = e.rule_id
    JOIN production_batch b ON b.id = e.batch_id
    LEFT JOIN product_spec s ON s.id = e.spec_id
    JOIN quality_metric m ON m.id = e.metric_id
    LEFT JOIN inspection_record ir ON ir.id = e.trigger_record_id
    LEFT JOIN sys_user hu ON hu.id = e.handler_user_id
`;

function buildWhere(options: AlertEventQuery): { sql: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];

  if (options.riskType) {
    where.push('e.risk_type = ?');
    params.push(options.riskType);
  }
  if (options.handlingStatus) {
    where.push('e.handling_status = ?');
    params.push(options.handlingStatus);
  }
  if (options.batchNo) {
    where.push('b.batch_no = ?');
    params.push(options.batchNo);
  }
  if (options.ruleCode) {
    where.push('e.rule_code = ?');
    params.push(options.ruleCode);
  }
  if (options.openOnly) {
    where.push("e.handling_status IN ('pending','processing')");
  }
  if (options.keyword) {
    const like = `%${options.keyword}%`;
    where.push('(e.code LIKE ? OR b.batch_no LIKE ? OR e.reason LIKE ?)');
    params.push(like, like, like);
  }
  if (options.from) {
    where.push('e.window_end_time >= ?');
    params.push(options.from);
  }
  if (options.to) {
    where.push('e.window_end_time <= ?');
    params.push(options.to);
  }

  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

export async function listAlertEvents(
  options: AlertEventQuery,
): Promise<PageResult<AlertEventListItem>> {
  const { sql, params } = buildWhere(options);

  const countRow = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS total
       FROM alert_event e
       JOIN production_batch b ON b.id = e.batch_id
      ${sql}`,
    params,
  );

  const rows = await query<AlertRow>(
    `${SELECT_FIELDS}
     ${sql}
     ORDER BY e.window_end_time DESC, e.id DESC
     LIMIT ? OFFSET ?`,
    [...params, options.pageSize, (options.page - 1) * options.pageSize],
  );

  return {
    rows: rows.map(mapEvent),
    total: Number(countRow?.total ?? 0),
    page: options.page,
    pageSize: options.pageSize,
  };
}

export async function findAlertEvent(id: number): Promise<AlertEventListItem | null> {
  const row = await queryOne<AlertRow>(`${SELECT_FIELDS} WHERE e.id = ?`, [id]);
  return row ? mapEvent(row) : null;
}

export async function findAlertEventByCode(code: string): Promise<AlertEventListItem | null> {
  const row = await queryOne<AlertRow>(`${SELECT_FIELDS} WHERE e.code = ?`, [code]);
  return row ? mapEvent(row) : null;
}

/** 事件关联的抽检记录（触发点 + 窗口内可比较点），用于证据定位 */
export async function listEventRecords(eventId: number): Promise<
  Array<{ recordId: number; recordCode: string; isTriggering: boolean; inspectTime: string }>
> {
  const rows = await query<RowDataPacket>(
    `SELECT er.record_id, er.is_triggering, r.code AS record_code, r.inspect_time
       FROM alert_event_record er
       JOIN inspection_record r ON r.id = er.record_id
      WHERE er.event_id = ?
      ORDER BY er.is_triggering DESC, r.inspect_time ASC`,
    [eventId],
  );
  return rows.map((row) => ({
    recordId: Number(row.record_id),
    recordCode: String(row.record_code),
    isTriggering: Number(row.is_triggering) === 1,
    inspectTime: String(row.inspect_time),
  }));
}

/** 统计：按风险类型 / 处置状态汇总（监控首页） */
export async function alertEventSummary(): Promise<{
  total: number;
  open: number;
  byRisk: Record<string, number>;
  byHandling: Record<string, number>;
  byRule: Record<string, number>;
  latestAt: string | null;
}> {
  const riskRows = await query<RowDataPacket>(
    'SELECT risk_type, COUNT(*) AS total FROM alert_event GROUP BY risk_type',
  );
  const handlingRows = await query<RowDataPacket>(
    'SELECT handling_status, COUNT(*) AS total FROM alert_event GROUP BY handling_status',
  );
  const ruleRows = await query<RowDataPacket>(
    'SELECT rule_code, COUNT(*) AS total FROM alert_event GROUP BY rule_code',
  );
  const latest = await queryOne<RowDataPacket>(
    'SELECT MAX(generated_at) AS latest_at FROM alert_event',
  );

  const byRisk: Record<string, number> = {};
  for (const row of riskRows) byRisk[String(row.risk_type)] = Number(row.total);

  const byHandling: Record<string, number> = {};
  for (const row of handlingRows) byHandling[String(row.handling_status)] = Number(row.total);

  const byRule: Record<string, number> = {};
  for (const row of ruleRows) byRule[String(row.rule_code)] = Number(row.total);

  const total = Object.values(byRisk).reduce((sum, value) => sum + value, 0);
  const open = (byHandling.pending ?? 0) + (byHandling.processing ?? 0);

  return {
    total,
    open,
    byRisk,
    byHandling,
    byRule,
    latestAt: (latest?.latest_at as string) ?? null,
  };
}

/** 某批次是否已存在同规则同指标同窗口的事件（用于应用层预判，最终仍由唯一键保证） */
export async function eventExists(options: {
  batchId: number;
  ruleId: number;
  metricId: number;
  windowStartTime: string | null;
}): Promise<boolean> {
  const row = await queryOne<RowDataPacket>(
    `SELECT id FROM alert_event
      WHERE batch_id = ? AND rule_id = ? AND metric_id = ?
        AND ((window_start_time IS NULL AND ? IS NULL) OR window_start_time = ?)
      LIMIT 1`,
    [
      options.batchId,
      options.ruleId,
      options.metricId,
      options.windowStartTime,
      options.windowStartTime,
    ],
  );
  return !!row;
}

/** 记录某条抽检记录最近一次参与判定的时间，避免重复扫描 */
export async function lastScanTime(): Promise<string | null> {
  const row = await queryOne<RowDataPacket>(
    "SELECT MAX(created_at) AS last_at FROM operation_log WHERE action_type = 'rule_scan'",
  );
  return (row?.last_at as string) ?? null;
}

export async function countEventsForRecord(recordId: number): Promise<number> {
  const row = await queryOne<RowDataPacket>(
    'SELECT COUNT(*) AS total FROM alert_event WHERE trigger_record_id = ?',
    [recordId],
  );
  return Number(row?.total ?? 0);
}

export async function insertAlertEvent(input: {
  code: string;
  ruleId: number;
  ruleCode: string;
  ruleVersion: string | null;
  riskType: RiskType;
  batchId: number;
  specId: number | null;
  metricId: number;
  triggerRecordId: number | null;
  windowStartTime: string | null;
  windowEndTime: string;
  reason: string;
  affectedLengthM: number | null;
  lineSpeedMpm: number | null;
}): Promise<number> {
  const result = await execute(
    `INSERT INTO alert_event
       (code, rule_id, rule_code, rule_version, risk_type, batch_id, spec_id, metric_id,
        trigger_record_id, window_start_time, window_end_time, reason,
        affected_length_m, line_speed_mpm, handling_status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending')
     ON DUPLICATE KEY UPDATE
       id = LAST_INSERT_ID(id),
       -- 重复触发时刷新窗口与依据：规则修复或阈值调整后，
       -- 同一去重键上的旧文案必须被覆盖，否则界面会一直显示过时的说明
       window_start_time = VALUES(window_start_time),
       window_end_time = VALUES(window_end_time),
       reason = VALUES(reason),
       affected_length_m = VALUES(affected_length_m),
       line_speed_mpm = VALUES(line_speed_mpm),
       rule_version = VALUES(rule_version),
       updated_at = NOW()`,
    [
      input.code,
      input.ruleId,
      input.ruleCode,
      input.ruleVersion,
      input.riskType,
      input.batchId,
      input.specId,
      input.metricId,
      input.triggerRecordId,
      input.windowStartTime,
      input.windowEndTime,
      input.reason,
      input.affectedLengthM,
      input.lineSpeedMpm,
    ],
  );
  return Number(result.insertId);
}

/** 关联事件与记录（幂等） */
export async function linkEventRecord(
  eventId: number,
  recordId: number,
  isTriggering: boolean,
  sortNo = 0,
): Promise<void> {
  await execute(
    `INSERT INTO alert_event_record (event_id, record_id, is_triggering, sort_no)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE is_triggering = VALUES(is_triggering), sort_no = VALUES(sort_no)`,
    [eventId, recordId, isTriggering ? 1 : 0, sortNo],
  );
}

export async function updateHandlingStatus(options: {
  eventId: number;
  status: HandlingStatus;
  note: string | null;
  handlerUserId: number;
}): Promise<void> {
  await execute(
    `UPDATE alert_event
        SET handling_status = ?, handling_note = ?, handled_at = NOW(), handler_user_id = ?
      WHERE id = ?`,
    [options.status, options.note, options.handlerUserId, options.eventId],
  );
}
