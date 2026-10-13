/**
 * 8D 报告引擎。
 *
 * 8D 是现场质量问题的标准处理格式，D1–D8 八个小节缺一不可。
 * 本模块负责两件事：
 *
 *   一、预填（ai_prefill）
 *       把已经落库的事实搬到报告里：事件信息、规则与阈值状态、抽检测量值、
 *       工程师已确认的结论。预填只搬事实，不写结论性语言——
 *       没把握的字段留空，并在页面明确提示「待工程师填写」。
 *
 *   二、定稿校验（finalize）
 *       D1/D2/D3 必须填写；D4–D7 必须至少有一条「工程师已确认」的根因结论。
 *       校验不通过就拒绝定稿，不允许出现「空着就定稿」的报告。
 *
 * 版本与留痕：每次预填/保存/定稿都写 eight_d_revision，并带内容快照，
 * 这样可以回答「报告在什么时候被改成了什么样」。
 */
import { execute, query, queryOne, withTransaction, type RowDataPacket } from '../db';
import { AppError } from '../errors';
import { writeAudit } from '../audit';
import { fmt, NO_DATA } from '../format';
import { CALIBRATION_LABELS, RISK_LABELS, type CalibrationStatus, type RiskType } from '../types';
import { findAlertEventByCode } from '../repositories/alertEventRepository';
import { metricDictionaryById, specLimitsForSpec } from '../repositories/metricRepository';

/** 8D 小节定义：顺序、名称、是否必填 */
export const EIGHT_D_FIELDS: Array<{
  code: 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6' | 'D7' | 'D8';
  name: string;
  required: boolean;
  hint: string;
}> = [
  { code: 'D1', name: '小组成员', required: true, hint: '列出角色与姓名（质量、工艺、设备、生产），没有名单时不要定稿。' },
  { code: 'D2', name: '问题描述', required: true, hint: '写清批次、时间、指标、实测值与判定依据；由系统预填后请人工核对。' },
  { code: 'D3', name: '临时遏制措施', required: true, hint: '记录隔离、加严抽检、暂停发货等已执行动作，含数量与时间。' },
  { code: 'D4', name: '根本原因', required: false, hint: '只能填写工程师已确认的结论；未确认的假设不要写进定稿，验证方法：五问法 / 对比试验 / 相关性分析。' },
  { code: 'D5', name: '纠正措施', required: false, hint: '针对已确认根因的措施，写明责任人与完成时间。' },
  { code: 'D6', name: '实施与验证', required: false, hint: '措施执行后的验证数据与效果确认（建议给出对比批次的数据）。' },
  { code: 'D7', name: '预防再发生', required: false, hint: '标准化动作：工艺卡、作业指导书、检验要求、培训与系统控制点的更新。' },
  { code: 'D8', name: '小组总结', required: false, hint: '本次处理的经验与遗留问题。' },
];

export interface ReportField {
  code: string;
  name: string;
  content: string;
  sourceType: 'pending' | 'ai_prefill' | 'engineer';
  isRequired: boolean;
  updatedBy: number | null;
  updatedAt: string | null;
  hint: string;
}

export interface ReportDetail {
  report: {
    id: number;
    code: string;
    eventId: number;
    eventCode: string;
    batchNo: string;
    ruleCode: string;
    productionGroup: string | null;
    status: string;
    versionNo: number;
    riskType: RiskType;
    metricName: string;
    windowStartTime: string | null;
    windowEndTime: string;
    affectedLengthM: number | null;
    savedAt: string | null;
    finalizedAt: string | null;
    ownerName: string | null;
    reviewerNote: string | null;
    createdAt: string;
  };
  fields: ReportField[];
  /** 已确认的结论，供 D4 引用 */
  confirmedConclusions: Array<{ seq: number; hypothesis: string; actualFinding: string | null }>;
  revisions: Array<{
    id: number;
    versionNo: number;
    action: string;
    summary: string | null;
    operatorName: string | null;
    createdAt: string;
  }>;
}

const FIELD_HINTS = new Map<string, string>(EIGHT_D_FIELDS.map((field) => [field.code, field.hint]));

// ── 生成报告 ────────────────────────────────────────────────────────

export interface CreateReportOptions {
  eventCode: string;
  userId: number;
  request?: Request;
}

/**
 * 由预警事件生成 8D 报告并预填 D1–D3、D4/D5 骨架。
 * 同一事件已存在草稿时直接返回该草稿，避免重复建单。
 */
export async function createReportFromEvent(options: CreateReportOptions) {
  const event = await findAlertEventByCode(options.eventCode);
  if (!event) throw AppError.notFound('预警事件不存在。');

  const existing = await queryOne<RowDataPacket>(
    `SELECT id, code FROM eight_d_report WHERE event_id = ? AND status <> 'obsolete'
      ORDER BY id DESC LIMIT 1`,
    [event.id],
  );
  if (existing) {
    return { reportId: Number(existing.id), code: String(existing.code), created: false };
  }

  const countRow = await queryOne<RowDataPacket>('SELECT COUNT(*) AS total FROM eight_d_report');
  const seq = Number(countRow?.total ?? 0) + 1;
  const code = `8D-${event.code}-${String(seq).padStart(3, '0')}`;

  const fields = await buildPrefillFields(event.code);

  const reportId = await withTransaction(async (connection) => {
    const [reportResult] = await connection.execute(
      `INSERT INTO eight_d_report
         (code, event_id, batch_id, spec_id, production_group, metric_id, rule_code,
          window_start_time, window_end_time, affected_length_m, status, version_no,
          owner_user_id, created_by, saved_at)
       VALUES (?,?,?,?,?,?,?,?,?,?, 'draft', 1, ?, ?, NOW())`,
      [
        code,
        event.id,
        event.batchId,
        event.specId,
        event.productionGroup,
        event.metricId,
        event.ruleCode,
        event.windowStartTime,
        event.windowEndTime,
        event.affectedLengthM,
        options.userId,
        options.userId,
      ],
    );
    const newReportId = Number((reportResult as { insertId: number }).insertId);

    for (const field of fields) {
      await connection.execute(
        `INSERT INTO eight_d_field
           (report_id, field_code, field_name, content, source_type, is_required, updated_by)
         VALUES (?,?,?,?,?,?,?)`,
        [
          newReportId,
          field.code,
          field.name,
          field.content,
          field.sourceType,
          field.isRequired ? 1 : 0,
          field.sourceType === 'ai_prefill' ? options.userId : null,
        ],
      );
    }

    await connection.execute(
      `INSERT INTO eight_d_revision (report_id, version_no, action, operator_user_id, summary, content_snapshot)
       VALUES (?, 1, 'create', ?, ?, ?)`,
      [
        newReportId,
        options.userId,
        `由事件 ${event.code} 生成 8D 报告，预填 D1–D5`,
        JSON.stringify(fields),
      ],
    );

    return newReportId;
  });

  await writeAudit({
    user: { userId: options.userId },
    module: 'eight_d',
    action: 'create',
    targetType: 'eight_d_report',
    targetId: reportId,
    detail: `生成 8D 报告 ${code}（事件 ${event.code}）`,
    request: options.request,
  });

  return { reportId, code, created: true };
}

/** 预填内容：只搬事实，不写结论 */
async function buildPrefillFields(eventCode: string) {
  const event = await findAlertEventByCode(eventCode);
  if (!event) throw AppError.notFound('预警事件不存在。');

  const [metricDict, limits] = await Promise.all([
    metricDictionaryById(),
    event.specId ? specLimitsForSpec(event.specId) : Promise.resolve(new Map()),
  ]);
  const metric = metricDict.get(event.metricId);
  const limit = limits.get(event.metricId);
  const calibration = (limit?.calibrationStatus ?? 'demo') as CalibrationStatus;

  const limitText =
    limit && (limit.lowerLimit !== null || limit.upperLimit !== null)
      ? `${fmt(limit.lowerLimit, metric?.decimalScale ?? 3)} – ${fmt(
          limit.upperLimit,
          metric?.decimalScale ?? 3,
        )} ${metric?.unit ?? ''}（${CALIBRATION_LABELS[calibration]}）`
      : `未配置${event.metricName}限值`;

  const problemDescription = [
    `批次 ${event.batchNo}${event.productionGroup ? `（${event.productionGroup}）` : ''} ` +
      `在 ${event.windowEndTime} 触发规则 ${event.ruleCode}（${event.ruleName}）。`,
    `风险等级：${RISK_LABELS[event.riskType]}。异常指标：${event.metricName}，对照范围：${limitText}。`,
    `判定依据：${event.reason}`,
    event.affectedLengthM !== null
      ? `影响长度估算：${fmt(event.affectedLengthM, 1)} m（按窗口时长 × 线速度 ${fmt(
          event.lineSpeedMpm,
          2,
        )} m/min 估算）。`
      : '影响长度：缺少该批次线速度记录，暂无法估算，需人工按生产记录补算。',
    calibration !== 'validated'
      ? '注意：当前阈值为「阈值待现场标定」状态，本次触发用于提示复核，不构成产品不合格结论。'
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const content: Record<string, string> = {
    D1: '',
    D2: problemDescription,
    D3: '',
    D4: '',
    D5: '',
    D6: '',
    D7: '',
    D8: '',
  };

  const sourceType: Record<string, 'pending' | 'ai_prefill'> = {
    D1: 'pending',
    D2: 'ai_prefill',
    D3: 'pending',
    D4: 'pending',
    D5: 'pending',
    D6: 'pending',
    D7: 'pending',
    D8: 'pending',
  };

  return EIGHT_D_FIELDS.map((field) => ({
    code: field.code,
    name: field.name,
    content: content[field.code] ?? '',
    sourceType: sourceType[field.code] ?? 'pending',
    isRequired: field.required,
  }));
}

// ── 读取报告 ────────────────────────────────────────────────────────

export async function loadReport(reportId: number): Promise<ReportDetail | null> {
  const report = await queryOne<RowDataPacket>(
    `SELECT d.id, d.code, d.event_id AS eventId, e.code AS eventCode, b.batch_no AS batchNo,
            d.rule_code AS ruleCode, d.production_group AS productionGroup, d.status,
            d.version_no AS versionNo, e.risk_type AS riskType, m.name AS metricName,
            d.window_start_time AS windowStartTime, d.window_end_time AS windowEndTime,
            d.affected_length_m AS affectedLengthM, d.saved_at AS savedAt,
            d.finalized_at AS finalizedAt, d.reviewer_note AS reviewerNote,
            u.display_name AS ownerName, d.created_at AS createdAt
       FROM eight_d_report d
       JOIN alert_event e ON e.id = d.event_id
       JOIN production_batch b ON b.id = d.batch_id
       LEFT JOIN quality_metric m ON m.id = d.metric_id
       LEFT JOIN sys_user u ON u.id = d.owner_user_id
      WHERE d.id = ?`,
    [reportId],
  );
  if (!report) return null;

  const fieldRows = await query<RowDataPacket>(
    `SELECT field_code AS code, field_name AS name, content, source_type AS sourceType,
            is_required AS isRequired, updated_by AS updatedBy, updated_at AS updatedAt
       FROM eight_d_field WHERE report_id = ?
      ORDER BY FIELD(field_code, 'D1','D2','D3','D4','D5','D6','D7','D8')`,
    [reportId],
  );

  const conclusionRows = await query<RowDataPacket>(
    `SELECT c.seq, c.hypothesis, c.actual_finding AS actualFinding
       FROM analysis_conclusion c
       JOIN analysis_run r ON r.id = c.run_id
      WHERE r.event_id = ? AND c.engineer_decision = 'confirmed'
      ORDER BY r.run_no DESC, c.seq`,
    [report.eventId],
  );

  const revisionRows = await query<RowDataPacket>(
    `SELECT v.id, v.version_no AS versionNo, v.action, v.summary,
            u.display_name AS operatorName, v.created_at AS createdAt
       FROM eight_d_revision v
       LEFT JOIN sys_user u ON u.id = v.operator_user_id
      WHERE v.report_id = ?
      ORDER BY v.id DESC`,
    [reportId],
  );

  return {
    report: {
      id: Number(report.id),
      code: String(report.code),
      eventId: Number(report.eventId),
      eventCode: String(report.eventCode),
      batchNo: String(report.batchNo),
      ruleCode: String(report.ruleCode ?? ''),
      productionGroup: report.productionGroup === null ? null : String(report.productionGroup),
      status: String(report.status),
      versionNo: Number(report.versionNo),
      riskType: report.riskType as RiskType,
      metricName: String(report.metricName ?? ''),
      windowStartTime: report.windowStartTime === null ? null : String(report.windowStartTime),
      windowEndTime: String(report.windowEndTime),
      affectedLengthM: report.affectedLengthM === null ? null : Number(report.affectedLengthM),
      savedAt: report.savedAt === null ? null : String(report.savedAt),
      finalizedAt: report.finalizedAt === null ? null : String(report.finalizedAt),
      ownerName: report.ownerName === null ? null : String(report.ownerName),
      reviewerNote: report.reviewerNote === null ? null : String(report.reviewerNote),
      createdAt: String(report.createdAt),
    },
    fields: fieldRows.map((row) => ({
      code: String(row.code),
      name: String(row.name),
      content: String(row.content ?? ''),
      sourceType: row.sourceType,
      isRequired: Number(row.isRequired) === 1,
      updatedBy: row.updatedBy === null ? null : Number(row.updatedBy),
      updatedAt: row.updatedAt === null ? null : String(row.updatedAt),
      hint: FIELD_HINTS.get(String(row.code)) ?? '',
    })),
    confirmedConclusions: conclusionRows.map((row) => ({
      seq: Number(row.seq),
      hypothesis: String(row.hypothesis),
      actualFinding: row.actualFinding === null ? null : String(row.actualFinding),
    })),
    revisions: revisionRows.map((row) => ({
      id: Number(row.id),
      versionNo: Number(row.versionNo),
      action: String(row.action),
      summary: row.summary === null ? null : String(row.summary),
      operatorName: row.operatorName === null ? null : String(row.operatorName),
      createdAt: String(row.createdAt),
    })),
  };
}

export async function listReports(options: {
  page: number;
  pageSize: number;
  status?: string;
  keyword?: string;
}) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (options.status) {
    where.push('d.status = ?');
    params.push(options.status);
  }
  if (options.keyword) {
    where.push('(d.code LIKE ? OR b.batch_no LIKE ? OR e.code LIKE ?)');
    const like = `%${options.keyword}%`;
    params.push(like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS total FROM eight_d_report d
       JOIN alert_event e ON e.id = d.event_id
       JOIN production_batch b ON b.id = d.batch_id ${whereSql}`,
    params,
  );

  const rows = await query<RowDataPacket>(
    `SELECT d.id, d.code, d.status, d.version_no AS versionNo, d.rule_code AS ruleCode,
            b.batch_no AS batchNo, e.risk_type AS riskType, e.code AS eventCode,
            m.name AS metricName, d.window_end_time AS windowEndTime,
            d.finalized_at AS finalizedAt, d.saved_at AS savedAt,
            u.display_name AS ownerName,
            (SELECT COUNT(*) FROM eight_d_field f WHERE f.report_id = d.id AND f.is_required = 1 AND (f.content IS NULL OR f.content = '')) AS missingRequired
       FROM eight_d_report d
       JOIN alert_event e ON e.id = d.event_id
       JOIN production_batch b ON b.id = d.batch_id
       LEFT JOIN quality_metric m ON m.id = d.metric_id
       LEFT JOIN sys_user u ON u.id = d.owner_user_id
       ${whereSql}
      ORDER BY d.created_at DESC, d.id DESC
      LIMIT ? OFFSET ?`,
    [...params, options.pageSize, (options.page - 1) * options.pageSize],
  );

  return {
    total: Number(total?.total ?? 0),
    page: options.page,
    pageSize: options.pageSize,
    rows: rows.map((row) => ({
      id: Number(row.id),
      code: String(row.code),
      status: String(row.status),
      versionNo: Number(row.versionNo),
      ruleCode: String(row.ruleCode ?? ''),
      batchNo: String(row.batchNo),
      eventCode: String(row.eventCode),
      riskType: row.riskType as RiskType,
      metricName: String(row.metricName ?? NO_DATA),
      windowEndTime: String(row.windowEndTime),
      finalizedAt: row.finalizedAt === null ? null : String(row.finalizedAt),
      savedAt: row.savedAt === null ? null : String(row.savedAt),
      ownerName: row.ownerName === null ? null : String(row.ownerName),
      missingRequired: Number(row.missingRequired ?? 0),
    })),
  };
}

// ── 保存与定稿 ──────────────────────────────────────────────────────

export interface SaveReportOptions {
  reportId: number;
  fields: Array<{ code: string; content: string }>;
  reviewerNote?: string | null;
  userId: number;
  request?: Request;
}

/** 保存草稿（部分字段更新） */
export async function saveReportDraft(options: SaveReportOptions) {
  const report = await queryOne<RowDataPacket>(
    'SELECT id, code, status, version_no AS versionNo FROM eight_d_report WHERE id = ?',
    [options.reportId],
  );
  if (!report) throw AppError.notFound('8D 报告不存在。');
  if (report.status === 'finalized') {
    throw AppError.conflict('报告已定稿，不能直接修改。如需变更请先重新打开（reopen）。');
  }

  await withTransaction(async (connection) => {
    for (const field of options.fields) {
      const definition = EIGHT_D_FIELDS.find((item) => item.code === (field.code as 'D1'));
      if (!definition) continue;
      await connection.execute(
        `UPDATE eight_d_field
            SET content = ?, source_type = 'engineer', field_name = ?, updated_by = ?
          WHERE report_id = ? AND field_code = ?`,
        [field.content ?? '', definition.name, options.userId, options.reportId, field.code],
      );
    }

    await connection.execute(
      `UPDATE eight_d_report
          SET saved_at = NOW(), reviewer_note = ?, version_no = version_no + 1
        WHERE id = ?`,
      [options.reviewerNote ?? null, options.reportId],
    );

    const snapshot = await loadFieldSnapshot(options.reportId);
    await connection.execute(
      `INSERT INTO eight_d_revision (report_id, version_no, action, operator_user_id, summary, content_snapshot)
       VALUES (?, ?, 'save_draft', ?, ?, ?)`,
      [
        options.reportId,
        Number(report.versionNo) + 1,
        options.userId,
        `保存草稿（更新 ${options.fields.length} 个小节）`,
        JSON.stringify(snapshot),
      ],
    );
  });

  await writeAudit({
    user: { userId: options.userId },
    module: 'eight_d',
    action: 'update',
    targetType: 'eight_d_report',
    targetId: options.reportId,
    detail: `保存 8D 报告 ${report.code} 草稿`,
    request: options.request,
  });

  return loadReport(options.reportId);
}

async function loadFieldSnapshot(reportId: number) {
  const rows = await query<RowDataPacket>(
    'SELECT field_code AS code, content FROM eight_d_field WHERE report_id = ?',
    [reportId],
  );
  return rows.map((row) => ({ code: String(row.code), content: String(row.content ?? '') }));
}

export interface FinalizeOptions {
  reportId: number;
  reviewerNote?: string | null;
  userId: number;
  request?: Request;
}

/**
 * 定稿。
 *
 * 校验规则（不通过就拒绝，不允许空报告定稿）：
 *   1) D1 / D2 / D3 必须有内容；
 *   2) 必须至少有一条工程师「已确认」的根因结论（D4 的依据）；
 *   3) 报告必须处于 draft 状态。
 *
 * 返回 blocking 列表而不是抛第一个错误，让页面一次把所有问题列清楚。
 */
export async function finalizeReport(options: FinalizeOptions) {
  const report = await queryOne<RowDataPacket>(
    'SELECT id, code, status, event_id AS eventId FROM eight_d_report WHERE id = ?',
    [options.reportId],
  );
  if (!report) throw AppError.notFound('8D 报告不存在。');
  if (report.status !== 'draft') {
    throw AppError.conflict(`报告当前状态为「${report.status}」，只有草稿可以定稿。`);
  }

  const fieldRows = await query<RowDataPacket>(
    'SELECT field_code AS code, content, is_required AS isRequired FROM eight_d_field WHERE report_id = ?',
    [options.reportId],
  );

  const blocking: string[] = [];
  for (const row of fieldRows) {
    const definition = EIGHT_D_FIELDS.find((item) => item.code === String(row.code));
    if (definition?.required && !String(row.content ?? '').trim()) {
      blocking.push(`${definition.code}「${definition.name}」尚未填写。`);
    }
  }

  const confirmed = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS total FROM analysis_conclusion c
       JOIN analysis_run r ON r.id = c.run_id
      WHERE r.event_id = ? AND c.engineer_decision = 'confirmed'`,
    [report.eventId],
  );
  if (Number(confirmed?.total ?? 0) === 0) {
    blocking.push('尚未有工程师确认的根因结论，请先在「异常诊断」中确认至少一条结论，再填写 D4 后定稿。');
  }

  if (blocking.length) {
    throw AppError.validation('报告尚不满足定稿条件。', { _: blocking.join('\n') });
  }

  await withTransaction(async (connection) => {
    await connection.execute(
      `UPDATE eight_d_report
          SET status = 'finalized', finalized_at = NOW(), reviewer_note = ?, version_no = version_no + 1
        WHERE id = ?`,
      [options.reviewerNote ?? null, options.reportId],
    );

    const snapshot = await loadFieldSnapshot(options.reportId);
    await connection.execute(
      `INSERT INTO eight_d_revision (report_id, version_no, action, operator_user_id, summary, content_snapshot)
       SELECT id, version_no, 'finalize', ?, ?, ? FROM eight_d_report WHERE id = ?`,
      [
        options.userId,
        '报告定稿',
        JSON.stringify(snapshot),
        options.reportId,
      ],
    );
  });

  await writeAudit({
    user: { userId: options.userId },
    module: 'eight_d',
    action: 'update',
    targetType: 'eight_d_report',
    targetId: options.reportId,
    detail: `8D 报告 ${report.code} 定稿`,
    request: options.request,
  });

  return { finalized: true };
}

/** 重新打开已定稿报告（保留全部版本记录） */
export async function reopenReport(options: {
  reportId: number;
  reason: string;
  userId: number;
  request?: Request;
}) {
  const report = await queryOne<RowDataPacket>(
    'SELECT id, code, status FROM eight_d_report WHERE id = ?',
    [options.reportId],
  );
  if (!report) throw AppError.notFound('8D 报告不存在。');
  if (report.status !== 'finalized') {
    throw AppError.badRequest('只有已定稿的报告需要重新打开。');
  }
  if (!options.reason.trim()) {
    throw AppError.validation('重新打开必须填写原因。', { reason: '请填写重新打开的原因' });
  }

  await withTransaction(async (connection) => {
    await connection.execute(
      `UPDATE eight_d_report
          SET status = 'draft', finalized_at = NULL, version_no = version_no + 1
        WHERE id = ?`,
      [options.reportId],
    );
    const snapshot = await loadFieldSnapshot(options.reportId);
    await connection.execute(
      `INSERT INTO eight_d_revision (report_id, version_no, action, operator_user_id, summary, content_snapshot)
       SELECT id, version_no, 'reopen', ?, ?, ? FROM eight_d_report WHERE id = ?`,
      [options.userId, `重新打开：${options.reason}`, JSON.stringify(snapshot), options.reportId],
    );
  });

  await writeAudit({
    user: { userId: options.userId },
    module: 'eight_d',
    action: 'update',
    targetType: 'eight_d_report',
    targetId: options.reportId,
    detail: `重新打开 8D 报告 ${report.code}：${options.reason}`,
    request: options.request,
  });

  return { reopened: true };
}

/** 报告明细（供归档使用） */
export async function reportFieldValues(reportId: number): Promise<Record<string, string>> {
  const rows = await query<RowDataPacket>(
    'SELECT field_code AS code, content FROM eight_d_field WHERE report_id = ?',
    [reportId],
  );
  const result: Record<string, string> = {};
  for (const row of rows) result[String(row.code)] = String(row.content ?? '');
  return result;
}

/** 记录导出动作（8D 报告导出/打印留痕） */
export async function recordReportExport(reportId: number, userId: number) {
  const report = await queryOne<RowDataPacket>(
    'SELECT id, status, version_no AS versionNo FROM eight_d_report WHERE id = ?',
    [reportId],
  );
  if (!report) throw AppError.notFound('8D 报告不存在。');
  await execute(
    `INSERT INTO eight_d_revision (report_id, version_no, action, operator_user_id, summary)
     VALUES (?, ?, 'export', ?, '导出/打印报告')`,
    [reportId, Number(report.versionNo), userId],
  );
  return { recorded: true };
}
