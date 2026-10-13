/**
 * 归档与通知服务。
 *
 * 归档（archive）：把一次完整分析冻结成不可变的历史记录。
 *   为什么需要「冻结」而不是每次重新查询：现场复查时问的是
 *   「当时依据什么数据、得出了什么结论」，如果重新查询，数据可能已经被修正，
 *   就无法回答这个问题。归档时把结论快照连同当时的判定一起写入
 *   analysis_archive_conclusion，之后不再随源数据变化。
 *
 * 通知（notification）：规则命中后要通知到人。
 *   发送策略分两步：
 *     1) 先落库（notification + notification_recipient），保证「发出过什么」有记录；
 *     2) 若配置了 SMTP，再尝试外发；外发失败只更新投递状态与错误信息，不回滚落库。
 *   这样做的好处：邮件网关故障不会让预警丢失，界面里始终能看到待通知记录。
 */
import { execute, query, queryOne, withTransaction, type RowDataPacket } from '../db';
import { AppError } from '../errors';
import { writeAudit } from '../audit';
import { config } from '../config';
import { logger } from '../logger';
import { findAlertEventByCode } from '../repositories/alertEventRepository';
import { reportFieldValues } from './reportService';

// ── 归档 ────────────────────────────────────────────────────────────

export interface ArchiveConclusionInput {
  sourceConclusionId: number | null;
  hypothesis: string;
  rootCauseCategory: string | null;
  observation: string | null;
  mechanism: string | null;
  missingEvidence: string | null;
  validationActions: string | null;
  validationMethod: string | null;
  validationResult: string | null;
  engineerComment: string | null;
  actualFinding: string | null;
  finalAction: string | null;
  engineerDecision: string;
  decidedAt: string | null;
  analysisGeneratedAt: string | null;
  basisJson: string | null;
}

export interface CreateArchiveOptions {
  eventCode: string;
  reportId?: number | null;
  remark?: string | null;
  userId: number;
  request?: Request;
}

/**
 * 由事件（可选关联一份 8D 报告）生成归档。
 * 同一个事件只保留一份有效归档：重复归档会被拒绝，避免出现两份「冻结版本」。
 */
export async function createArchive(options: CreateArchiveOptions) {
  const event = await findAlertEventByCode(options.eventCode);
  if (!event) throw AppError.notFound('预警事件不存在。');

  const existing = await queryOne<RowDataPacket>(
    'SELECT id, code FROM analysis_archive WHERE event_id = ?',
    [event.id],
  );
  if (existing) {
    throw AppError.conflict(
      `该事件已归档（归档编号 ${existing.code}）。如需重新归档，请先在归档列表中作废原归档。`,
    );
  }

  const run = await queryOne<RowDataPacket>(
    `SELECT id FROM analysis_run WHERE event_id = ? ORDER BY run_no DESC LIMIT 1`,
    [event.id],
  );
  if (!run) {
    throw AppError.badRequest('该事件还没有诊断记录，请先在异常诊断中执行一次分析再归档。');
  }

  const conclusions = await query<RowDataPacket>(
    `SELECT c.*, u.display_name AS decidedByName
       FROM analysis_conclusion c
       LEFT JOIN sys_user u ON u.id = c.decided_by
      WHERE c.run_id = ? ORDER BY c.seq`,
    [Number(run.id)],
  );

  const confirmed = conclusions.filter((row) => row.engineer_decision === 'confirmed').length;
  const rejected = conclusions.filter((row) => row.engineer_decision === 'rejected').length;
  const pending = conclusions.filter((row) => row.engineer_decision === 'pending').length;

  if (pending > 0) {
    throw AppError.badRequest(
      `还有 ${pending} 条结论处于「待工程师确认」状态。归档会把结论冻结为历史记录，` +
        '请先逐条确认或否决，再执行归档。',
    );
  }

  const reportFields = options.reportId ? await reportFieldValues(options.reportId) : null;

  const totalRow = await queryOne<RowDataPacket>('SELECT COUNT(*) AS total FROM analysis_archive');
  const code = `AR-${event.code}-${String(Number(totalRow?.total ?? 0) + 1).padStart(3, '0')}`;

  const archiveId = await withTransaction(async (connection) => {
    const [archiveResult] = await connection.execute(
      `INSERT INTO analysis_archive
         (code, event_id, run_id, batch_id, spec_id, metric_id, reference_batch_id,
          factor_parameter_id, risk_type, rule_code, event_time, total_conclusions,
          confirmed_count, rejected_count, pending_count, archived_by, archived_at, remark)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, NOW(), ?)`,
      [
        code,
        event.id,
        Number(run.id),
        event.batchId,
        event.specId,
        event.metricId,
        null,
        null,
        event.riskType,
        event.ruleCode,
        event.windowEndTime,
        conclusions.length,
        confirmed,
        rejected,
        pending,
        options.userId,
        options.remark ?? null,
      ],
    );
    const newArchiveId = Number((archiveResult as { insertId: number }).insertId);

    let seq = 0;
    for (const row of conclusions) {
      const evidence = await connection.execute(
        `SELECT evidence_type, layer, content, fact_time, is_locateable, related_record_id
           FROM conclusion_evidence WHERE conclusion_id = ? ORDER BY sort_no, id`,
        [Number(row.id)],
      );
      const [evidenceRows] = evidence as unknown as [RowDataPacket[]];

      await connection.execute(
        `INSERT INTO analysis_archive_conclusion
           (archive_id, seq, source_conclusion_id, hypothesis, root_cause_category, observation,
            mechanism, missing_evidence, validation_actions, validation_method, validation_result,
            engineer_comment, actual_finding, final_action, engineer_decision, decided_at,
            analysis_generated_at, basis_json)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          newArchiveId,
          seq++,
          Number(row.id),
          String(row.hypothesis),
          row.root_cause_category,
          row.observation,
          row.mechanism,
          row.missing_evidence,
          row.validation_actions,
          row.validation_method,
          row.validation_result,
          row.engineer_comment,
          row.actual_finding,
          row.final_action,
          String(row.engineer_decision),
          row.decided_at,
          row.created_at,
          JSON.stringify({
            evidence: evidenceRows,
            reportFields: reportFields ?? null,
            dataVersion: '归档时点冻结',
          }),
        ],
      );
    }

    return newArchiveId;
  });

  await writeAudit({
    user: { userId: options.userId },
    module: 'archive',
    action: 'create',
    targetType: 'analysis_archive',
    targetId: archiveId,
    detail:
      `归档事件 ${event.code}（${event.ruleCode}），冻结 ${conclusions.length} 条结论` +
      `（确认 ${confirmed} / 否决 ${rejected}）` +
      (options.reportId ? `，关联 8D 报告 #${options.reportId}` : ''),
    request: options.request,
  });

  return { archiveId, code, conclusions: conclusions.length, confirmed, rejected };
}

export async function listArchives(options: {
  page: number;
  pageSize: number;
  riskType?: string;
  keyword?: string;
}) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (options.riskType) {
    where.push('a.risk_type = ?');
    params.push(options.riskType);
  }
  if (options.keyword) {
    where.push('(a.code LIKE ? OR b.batch_no LIKE ? OR e.code LIKE ?)');
    const like = `%${options.keyword}%`;
    params.push(like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS total FROM analysis_archive a
       JOIN production_batch b ON b.id = a.batch_id
       JOIN alert_event e ON e.id = a.event_id ${whereSql}`,
    params,
  );

  const rows = await query<RowDataPacket>(
    `SELECT a.id, a.code, a.risk_type AS riskType, a.rule_code AS ruleCode,
            b.batch_no AS batchNo, e.code AS eventCode, m.name AS metricName,
            a.event_time AS eventTime, a.total_conclusions AS totalConclusions,
            a.confirmed_count AS confirmedCount, a.rejected_count AS rejectedCount,
            a.pending_count AS pendingCount, a.archived_at AS archivedAt,
            u.display_name AS archivedByName, a.remark
       FROM analysis_archive a
       JOIN production_batch b ON b.id = a.batch_id
       JOIN alert_event e ON e.id = a.event_id
       LEFT JOIN quality_metric m ON m.id = a.metric_id
       LEFT JOIN sys_user u ON u.id = a.archived_by
       ${whereSql}
      ORDER BY a.archived_at DESC, a.id DESC
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
      riskType: String(row.riskType),
      ruleCode: String(row.ruleCode ?? ''),
      batchNo: String(row.batchNo),
      eventCode: String(row.eventCode),
      metricName: row.metricName === null ? null : String(row.metricName),
      eventTime: String(row.eventTime),
      totalConclusions: Number(row.totalConclusions),
      confirmedCount: Number(row.confirmedCount),
      rejectedCount: Number(row.rejectedCount),
      pendingCount: Number(row.pendingCount),
      archivedAt: String(row.archivedAt),
      archivedByName: row.archivedByName === null ? null : String(row.archivedByName),
      remark: row.remark === null ? null : String(row.remark),
    })),
  };
}

export async function loadArchive(archiveId: number) {
  const archive = await queryOne<RowDataPacket>(
    `SELECT a.id, a.code, a.risk_type AS riskType, a.rule_code AS ruleCode,
            b.batch_no AS batchNo, e.code AS eventCode, m.name AS metricName,
            a.event_time AS eventTime, a.archived_at AS archivedAt, a.remark,
            u.display_name AS archivedByName, a.total_conclusions AS totalConclusions,
            a.confirmed_count AS confirmedCount, a.rejected_count AS rejectedCount,
            a.pending_count AS pendingCount
       FROM analysis_archive a
       JOIN production_batch b ON b.id = a.batch_id
       JOIN alert_event e ON e.id = a.event_id
       LEFT JOIN quality_metric m ON m.id = a.metric_id
       LEFT JOIN sys_user u ON u.id = a.archived_by
      WHERE a.id = ?`,
    [archiveId],
  );
  if (!archive) return null;

  const conclusions = await query<RowDataPacket>(
    `SELECT seq, hypothesis, root_cause_category AS rootCauseCategory, observation, mechanism,
            missing_evidence AS missingEvidence, validation_actions AS validationActions,
            validation_method AS validationMethod, validation_result AS validationResult,
            engineer_comment AS engineerComment, actual_finding AS actualFinding,
            final_action AS finalAction, engineer_decision AS engineerDecision,
            decided_at AS decidedAt, analysis_generated_at AS analysisGeneratedAt
       FROM analysis_archive_conclusion WHERE archive_id = ? ORDER BY seq`,
    [archiveId],
  );

  return {
    archive: {
      id: Number(archive.id),
      code: String(archive.code),
      riskType: String(archive.riskType),
      ruleCode: String(archive.ruleCode ?? ''),
      batchNo: String(archive.batchNo),
      eventCode: String(archive.eventCode),
      metricName: archive.metricName === null ? null : String(archive.metricName),
      eventTime: String(archive.eventTime),
      archivedAt: String(archive.archivedAt),
      archivedByName: archive.archivedByName === null ? null : String(archive.archivedByName),
      remark: archive.remark === null ? null : String(archive.remark),
      totalConclusions: Number(archive.totalConclusions),
      confirmedCount: Number(archive.confirmedCount),
      rejectedCount: Number(archive.rejectedCount),
      pendingCount: Number(archive.pendingCount),
      frozen: true,
    },
    conclusions: conclusions.map((row) => ({
      seq: Number(row.seq),
      hypothesis: String(row.hypothesis),
      rootCauseCategory: row.rootCauseCategory === null ? null : String(row.rootCauseCategory),
      observation: row.observation === null ? null : String(row.observation),
      mechanism: row.mechanism === null ? null : String(row.mechanism),
      missingEvidence: row.missingEvidence === null ? [] : String(row.missingEvidence).split('\n'),
      validationActions: row.validationActions === null ? null : String(row.validationActions),
      validationMethod: row.validationMethod === null ? null : String(row.validationMethod),
      validationResult: row.validationResult === null ? null : String(row.validationResult),
      engineerComment: row.engineerComment === null ? null : String(row.engineerComment),
      actualFinding: row.actualFinding === null ? null : String(row.actualFinding),
      finalAction: row.finalAction === null ? null : String(row.finalAction),
      engineerDecision: String(row.engineerDecision),
      decidedAt: row.decidedAt === null ? null : String(row.decidedAt),
      analysisGeneratedAt:
        row.analysisGeneratedAt === null ? null : String(row.analysisGeneratedAt),
    })),
  };
}

// ── 通知 ────────────────────────────────────────────────────────────

export interface DispatchNotificationOptions {
  eventCode: string;
  userId: number;
  request?: Request;
  /** 指定收件人（用户 ID）。省略时按事件风险等级选角色 */
  recipientUserIds?: number[];
  triggerMode?: 'auto' | 'manual';
}

/**
 * 生成并投递一条预警通知。
 *
 * 投递顺序：落库 → 尝试外发 → 更新投递状态。
 * 外发失败不会抛错，只把失败原因记在 error_message，界面里可人工重发。
 */
export async function dispatchNotification(options: DispatchNotificationOptions) {
  const event = await findAlertEventByCode(options.eventCode);
  if (!event) throw AppError.notFound('预警事件不存在。');

  const existing = await queryOne<RowDataPacket>(
    'SELECT id, code FROM notification WHERE event_id = ? ORDER BY id DESC LIMIT 1',
    [event.id],
  );

  const totalRow = await queryOne<RowDataPacket>('SELECT COUNT(*) AS total FROM notification');
  const code = existing?.code ?? `NT-${event.code}-${String(Number(totalRow?.total ?? 0) + 1).padStart(3, '0')}`;

  const subject = `【质量预警】${event.batchNo} · ${event.ruleCode} · ${event.metricName}`;
  const body = [
    `批次：${event.batchNo}${event.productionGroup ? `（${event.productionGroup}）` : ''}`,
    `规则：${event.ruleCode} ${event.ruleName}（阈值状态：${event.ruleCalibrationStatus}）`,
    `风险等级：${event.riskType}`,
    `异常指标：${event.metricName}`,
    `窗口：${event.windowStartTime ?? '—'} ~ ${event.windowEndTime}`,
    `判定依据：${event.reason}`,
    event.affectedLengthM !== null
      ? `影响长度估算：${event.affectedLengthM} m`
      : '影响长度：缺少线速度记录，无法估算',
  ].join('\n');

  const recipients = options.recipientUserIds?.length
    ? await loadUsersByIds(options.recipientUserIds)
    : await loadDefaultRecipients(event.riskType);

  if (!recipients.length) {
    throw AppError.badRequest(
      '没有可用的收件人。请指定收件人，或确认系统内存在对应角色的启用账号。',
    );
  }

  const notificationId = await withTransaction(async (connection) => {
    const [result] = await connection.execute(
      `INSERT INTO notification
         (code, event_id, channel, subject, body, status, is_simulated, trigger_mode, attempt_count, created_by)
       VALUES (?,?, 'email', ?, ?, 'pending', 0, ?, 0, ?)
       ON DUPLICATE KEY UPDATE subject = VALUES(subject), body = VALUES(body), updated_at = NOW()`,
      [code, event.id, subject, body, options.triggerMode ?? 'manual', options.userId],
    );
    const id = Number((result as { insertId: number }).insertId) || Number(existing?.id ?? 0);

    for (const recipient of recipients) {
      await connection.execute(
        `INSERT INTO notification_recipient
           (notification_id, role_id, user_id, recipient_name, recipient_address, delivery_status)
         VALUES (?,?,?,?,?, 'pending')`,
        [
          id,
          recipient.roleId,
          recipient.userId,
          recipient.displayName,
          recipient.email,
        ],
      );
    }
    return id;
  });

  const delivery = await deliver(notificationId, subject, body);

  await writeAudit({
    user: { userId: options.userId },
    module: 'notification',
    action: 'notify',
    targetType: 'notification',
    targetId: notificationId,
    detail:
      `生成预警通知 ${code}，收件人 ${recipients.length} 人；投递结果：${delivery.status}` +
      (delivery.error ? `（${delivery.error}）` : ''),
    request: options.request,
  });

  return { notificationId, code, recipients: recipients.length, delivery };
}

async function loadUsersByIds(userIds: number[]) {
  const placeholders = userIds.map(() => '?').join(',');
  const rows = await query<RowDataPacket>(
    `SELECT u.id AS userId, u.display_name AS displayName, u.email, NULL AS roleId
       FROM sys_user u WHERE u.id IN (${placeholders}) AND u.status = 'active'`,
    userIds,
  );
  return rows.map((row) => ({
    userId: Number(row.userId),
    displayName: String(row.displayName),
    email: row.email === null ? null : String(row.email),
    roleId: row.roleId === null ? null : Number(row.roleId),
  }));
}

/**
 * 默认收件人规则：
 *   error / high —— 质量工程师 + 质量主管 + 工艺工程师
 *   其余        —— 质量工程师
 * 未配置邮箱的账号会被跳过（否则外发必然失败，只会产生噪声）。
 */
async function loadDefaultRecipients(riskType: string) {
  const roleCodes =
    riskType === 'error' || riskType === 'high'
      ? ['quality_engineer', 'quality_manager', 'process_engineer']
      : ['quality_engineer'];
  const placeholders = roleCodes.map(() => '?').join(',');
  const rows = await query<RowDataPacket>(
    `SELECT DISTINCT u.id AS userId, u.display_name AS displayName, u.email,
            r.id AS roleId
       FROM sys_user u
       JOIN sys_user_role ur ON ur.user_id = u.id
       JOIN sys_role r ON r.id = ur.role_id
      WHERE r.code IN (${placeholders}) AND u.status = 'active'
      ORDER BY u.id`,
    roleCodes,
  );
  return rows
    .map((row) => ({
      userId: Number(row.userId),
      displayName: String(row.displayName),
      email: row.email === null ? null : String(row.email),
      roleId: row.roleId === null ? null : Number(row.roleId),
    }))
    .filter((recipient) => recipient.email);
}

/**
 * 实际投递。
 *
 * SMTP 未配置时状态记为 skipped_no_smtp —— 明确区分「没配通道」与「发送失败」，
 * 便于现场判断该去配通道还是查网关。
 */
async function deliver(
  notificationId: number,
  subject: string,
  body: string,
): Promise<{ status: string; error: string | null }> {
  const smtpConfigured =
    config.notify.transport === 'smtp' && Boolean(config.notify.smtp.host && config.notify.smtp.from);

  if (!smtpConfigured) {
    // 数据库 notification.status 只有 pending/sent/failed/simulated/cancelled。
    // 未配置 SMTP 时记为 cancelled（未投递），并在 error_message 中写明原因，
    // 与「投递失败」区分开：前者是没配通道，后者是通道故障。
    await execute(
      `UPDATE notification SET status = 'cancelled', attempt_count = attempt_count + 1,
              error_message = ?, updated_at = NOW()
        WHERE id = ?`,
      ['未配置 SMTP（NOTIFY_TRANSPORT / SMTP_HOST / SMTP_FROM），通知已落库，可人工外发', notificationId],
    );
    return { status: 'cancelled', error: null };
  }

  const recipients = await query<RowDataPacket>(
    'SELECT id, recipient_address AS address FROM notification_recipient WHERE notification_id = ?',
    [notificationId],
  );

  try {
    // 动态加载 nodemailer：未安装时不影响服务启动，只在真正发送时报错
    // 用变量绕过打包器的静态解析：未安装 nodemailer 时不应导致构建失败
    const moduleName = 'nodemailer';
    const nodemailer = await import(/* webpackIgnore: true */ moduleName).catch(() => null);
    if (!nodemailer) {
      throw new Error('未安装 nodemailer，无法外发邮件（pnpm add nodemailer）');
    }
    const transport = (nodemailer as unknown as { createTransport: (options: unknown) => { sendMail: (mail: unknown) => Promise<unknown> } }).createTransport({
      host: config.notify.smtp.host,
      port: config.notify.smtp.port,
      secure: config.notify.smtp.secure,
      auth: config.notify.smtp.user
        ? { user: config.notify.smtp.user, pass: config.notify.smtp.password }
        : undefined,
    });

    for (const recipient of recipients) {
      if (!recipient.address) continue;
      await transport.sendMail({
        from: config.notify.smtp.from,
        to: String(recipient.address),
        subject,
        text: body,
      });
      await execute(
        `UPDATE notification_recipient SET delivery_status = 'sent' WHERE id = ?`,
        [Number(recipient.id)],
      );
    }

    await execute(
      `UPDATE notification SET status = 'sent', sent_at = NOW(), attempt_count = attempt_count + 1,
              error_message = NULL, updated_at = NOW()
        WHERE id = ?`,
      [notificationId],
    );
    return { status: 'sent', error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('预警通知外发失败，已保留落库记录', { notificationId, error: message });
    await execute(
      `UPDATE notification SET status = 'failed', attempt_count = attempt_count + 1,
              error_message = ?, updated_at = NOW()
        WHERE id = ?`,
      [message.slice(0, 500), notificationId],
    );
    await execute(
      `UPDATE notification_recipient SET delivery_status = 'failed' WHERE notification_id = ?`,
      [notificationId],
    );
    return { status: 'failed', error: message };
  }
}

export async function listNotifications(options: {
  page: number;
  pageSize: number;
  status?: string;
  keyword?: string;
}) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (options.status) {
    where.push('n.status = ?');
    params.push(options.status);
  }
  if (options.keyword) {
    where.push('(n.code LIKE ? OR n.subject LIKE ? OR b.batch_no LIKE ?)');
    const like = `%${options.keyword}%`;
    params.push(like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS total FROM notification n
       LEFT JOIN alert_event e ON e.id = n.event_id
       LEFT JOIN production_batch b ON b.id = e.batch_id ${whereSql}`,
    params,
  );

  const rows = await query<RowDataPacket>(
    `SELECT n.id, n.code, n.subject, n.status, n.channel, n.trigger_mode AS triggerMode,
            n.attempt_count AS attemptCount, n.error_message AS errorMessage,
            n.sent_at AS sentAt, n.created_at AS createdAt,
            e.code AS eventCode, e.risk_type AS riskType, b.batch_no AS batchNo,
            (SELECT COUNT(*) FROM notification_recipient r WHERE r.notification_id = n.id) AS recipientCount
       FROM notification n
       LEFT JOIN alert_event e ON e.id = n.event_id
       LEFT JOIN production_batch b ON b.id = e.batch_id
       ${whereSql}
      ORDER BY n.created_at DESC, n.id DESC
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
      subject: String(row.subject),
      status: String(row.status),
      channel: String(row.channel),
      triggerMode: String(row.triggerMode),
      attemptCount: Number(row.attemptCount),
      errorMessage: row.errorMessage === null ? null : String(row.errorMessage),
      sentAt: row.sentAt === null ? null : String(row.sentAt),
      createdAt: String(row.createdAt),
      eventCode: row.eventCode === null ? null : String(row.eventCode),
      riskType: row.riskType === null ? null : String(row.riskType),
      batchNo: row.batchNo === null ? null : String(row.batchNo),
      recipientCount: Number(row.recipientCount),
    })),
  };
}

export async function loadNotification(id: number) {
  const notification = await queryOne<RowDataPacket>(
    'SELECT * FROM notification WHERE id = ?',
    [id],
  );
  if (!notification) return null;

  const recipients = await query<RowDataPacket>(
    `SELECT id, recipient_name AS recipientName, recipient_address AS recipientAddress,
            delivery_status AS deliveryStatus, read_at AS readAt, ack_status AS ackStatus,
            ack_at AS ackAt, ack_comment AS ackComment
       FROM notification_recipient WHERE notification_id = ? ORDER BY id`,
    [id],
  );

  return {
    notification: {
      id: Number(notification.id),
      code: String(notification.code),
      subject: String(notification.subject),
      body: String(notification.body ?? ''),
      status: String(notification.status),
      channel: String(notification.channel),
      triggerMode: String(notification.trigger_mode),
      attemptCount: Number(notification.attempt_count),
      errorMessage:
        notification.error_message === null ? null : String(notification.error_message),
      sentAt: notification.sent_at === null ? null : String(notification.sent_at),
      createdAt: String(notification.created_at),
    },
    recipients: recipients.map((row) => ({
      id: Number(row.id),
      recipientName: String(row.recipientName ?? ''),
      recipientAddress: row.recipientAddress === null ? null : String(row.recipientAddress),
      deliveryStatus: String(row.deliveryStatus),
      readAt: row.readAt === null ? null : String(row.readAt),
      ackStatus: String(row.ackStatus),
      ackAt: row.ackAt === null ? null : String(row.ackAt),
      ackComment: row.ackComment === null ? null : String(row.ackComment),
    })),
  };
}
