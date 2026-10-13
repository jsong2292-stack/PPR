/**
 * 审计日志。
 *
 * 写入 `operation_log`，承担的是追溯责任：谁在什么时候对哪条数据做了什么，
 * 结论与报告变更必须可回溯。
 *
 * 设计要点：
 *   - 审计失败**不能**影响主流程，因此内部吞掉异常并降级为应用日志（warn）。
 *     如果审计写入失败就让业务报错，反而会制造更大的可用性问题。
 *   - 只记录标识与摘要，不记录敏感内容（口令、完整请求体）。
 */
import { execute } from './db';
import { logger } from './logger';
import type { SessionUser } from './auth/session';

export type AuditModule =
  | 'auth'
  | 'masterdata'
  | 'datasource'
  | 'quality_monitor'
  | 'diagnosis'
  | 'eight_d'
  | 'archive'
  | 'notification'
  | 'system';

export type AuditAction =
  | 'login'
  | 'login_failed'
  | 'logout'
  | 'password_change'
  | 'create'
  | 'update'
  | 'delete'
  | 'import'
  | 'export'
  | 'rule_scan'
  | 'ai_generate'
  | 'engineer_decision'
  | 'archive'
  | 'notify'
  | 'report_save'
  | 'report_finalize'
  | 'handle_event';

export interface AuditInput {
  user?: Pick<SessionUser, 'userId'> | null;
  module: AuditModule;
  action: AuditAction;
  targetType?: string;
  targetId?: string | number | null;
  detail?: string;
  detailJson?: unknown;
  request?: Request;
}

/** 从请求中提取来源信息（用于安全审计，不记录正文） */
function requestMeta(request?: Request): { ip: string | null; userAgent: string | null } {
  if (!request) return { ip: null, userAgent: null };
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : request.headers.get('x-real-ip');
  const userAgent = request.headers.get('user-agent');
  return {
    ip: ip ? ip.slice(0, 64) : null,
    userAgent: userAgent ? userAgent.slice(0, 255) : null,
  };
}

export async function writeAudit(input: AuditInput): Promise<void> {
  const { ip, userAgent } = requestMeta(input.request);
  try {
    await execute(
      `INSERT INTO operation_log
         (user_id, module, action_type, target_type, target_id, detail, detail_json, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.user?.userId ?? null,
        input.module,
        input.action,
        input.targetType ?? null,
        input.targetId === null || input.targetId === undefined ? null : String(input.targetId),
        input.detail ? input.detail.slice(0, 1000) : null,
        input.detailJson === undefined ? null : JSON.stringify(input.detailJson),
        ip,
        userAgent,
      ],
    );
  } catch (error) {
    logger.warn('审计日志写入失败（不影响业务）', {
      error,
      module: input.module,
      action: input.action,
    });
  }
}

/** 查询审计日志（用于详情页的「操作历史」区块） */
export interface AuditEntry {
  id: number;
  createdAt: string;
  module: string;
  actionType: string;
  targetType: string | null;
  targetId: string | null;
  detail: string | null;
  userName: string | null;
}

export async function listAuditFor(
  targetType: string,
  targetId: string | number,
  limit = 20,
): Promise<AuditEntry[]> {
  const { query } = await import('./db');
  const rows = await query<import('./db').RowDataPacket & Record<string, unknown>>(
    `SELECT l.id, l.created_at AS createdAt, l.module, l.action_type AS actionType,
            l.target_type AS targetType, l.target_id AS targetId, l.detail,
            u.display_name AS userName
       FROM operation_log l
       LEFT JOIN sys_user u ON u.id = l.user_id
      WHERE l.target_type = ? AND l.target_id = ?
      ORDER BY l.id DESC
      LIMIT ?`,
    [targetType, String(targetId), limit],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    createdAt: String(row.createdAt ?? ''),
    module: String(row.module ?? ''),
    actionType: String(row.actionType ?? ''),
    targetType: (row.targetType as string) ?? null,
    targetId: (row.targetId as string) ?? null,
    detail: (row.detail as string) ?? null,
    userName: (row.userName as string) ?? null,
  }));
}
