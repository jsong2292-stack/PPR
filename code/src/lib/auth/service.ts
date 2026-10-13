/**
 * 认证业务逻辑。
 *
 * 与 session.ts 的分工：
 *   - session.ts 负责「令牌怎么签发与校验」
 *   - 本文件负责「登录、改密、登出」这些业务流程，包括口令校验与审计
 */
import bcrypt from 'bcryptjs';
import { config } from '../config';
import { AppError } from '../errors';
import { execute, queryOne, type RowDataPacket } from '../db';
import { writeAudit } from '../audit';
import { logger } from '../logger';
import { formatLocal } from '../format';
import {
  findUserByUsername,
  issueSessionToken,
  sessionCookieOptions,
  splitRoles,
  toSessionUser,
  type SessionUser,
} from './session';
import { permissionsOf } from './permissions';

export interface LoginResult {
  user: SessionUser;
  token: string;
  cookie: ReturnType<typeof sessionCookieOptions>;
  /** 是否需要先修改初始密码 */
  mustResetPassword: boolean;
}

/**
 * 账号锁定策略：同一账号连续失败达到阈值后锁定一段时间。
 * 用内存计数实现 —— 单实例够用；多实例部署时应换成 Redis 或数据库计数。
 */
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 10;

interface AttemptRecord {
  count: number;
  lockedUntil: number;
}

const attempts = new Map<string, AttemptRecord>();

function checkLock(username: string): void {
  const record = attempts.get(username);
  if (!record) return;
  if (record.lockedUntil > Date.now()) {
    const seconds = Math.ceil((record.lockedUntil - Date.now()) / 1000);
    throw AppError.forbidden(
      `该账号因连续登录失败已被临时锁定，请在 ${seconds} 秒后重试。`,
    );
  }
  if (record.lockedUntil > 0) attempts.delete(username);
}

function recordFailure(username: string): void {
  const record = attempts.get(username) ?? { count: 0, lockedUntil: 0 };
  record.count += 1;
  if (record.count >= MAX_FAILED_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCK_MINUTES * 60_000;
    record.count = 0;
    logger.warn(`账号 ${username} 登录失败次数过多，已锁定 ${LOCK_MINUTES} 分钟`);
  }
  attempts.set(username, record);
}

export async function login(
  username: string,
  password: string,
  request?: Request,
): Promise<LoginResult> {
  checkLock(username);

  const row = await findUserByUsername(username);

  // 统一错误文案：不区分「账号不存在」与「口令错误」，避免账号枚举
  const invalid = AppError.unauthorized('账号或密码不正确。');

  if (!row || row.status !== 'active') {
    recordFailure(username);
    await writeAudit({
      module: 'auth',
      action: 'login_failed',
      targetType: 'sys_user',
      targetId: username,
      detail: row ? '账号已停用' : '账号不存在',
      request,
    });
    throw invalid;
  }

  if (!row.password_hash) {
    recordFailure(username);
    await writeAudit({
      user: { userId: row.id },
      module: 'auth',
      action: 'login_failed',
      targetType: 'sys_user',
      targetId: username,
      detail: '账号尚未设置密码',
      request,
    });
    throw AppError.forbidden('该账号尚未设置登录密码，请联系系统管理员初始化。');
  }

  const matched = await bcrypt.compare(password, row.password_hash);
  if (!matched) {
    recordFailure(username);
    await writeAudit({
      user: { userId: row.id },
      module: 'auth',
      action: 'login_failed',
      targetType: 'sys_user',
      targetId: username,
      detail: '密码不正确',
      request,
    });
    throw invalid;
  }

  attempts.delete(username);

  const roles = splitRoles(row.roles);
  const version = Number(row.session_version);
  const { token, expiresAt } = await issueSessionToken({
    userId: row.id,
    username: row.username,
    displayName: row.display_name,
    roles,
    version,
  });

  await execute('UPDATE sys_user SET last_login_at = ? WHERE id = ?', [
    formatLocal(new Date()),
    row.id,
  ]);

  await writeAudit({
    user: { userId: row.id },
    module: 'auth',
    action: 'login',
    targetType: 'sys_user',
    targetId: row.username,
    detail: `${row.display_name} 登录成功`,
    request,
  });

  const user: SessionUser = {
    userId: row.id,
    username: row.username,
    displayName: row.display_name,
    roles,
    version,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(expiresAt.getTime() / 1000),
    permissions: permissionsOf(roles),
    passwordChanged: row.must_reset_password !== 1,
  };

  return {
    user,
    token,
    cookie: sessionCookieOptions(expiresAt),
    mustResetPassword: row.must_reset_password === 1,
  };
}

interface PasswordRow extends RowDataPacket {
  id: number;
  password_hash: string | null;
  session_version: number;
  must_reset_password: number;
}

/**
 * 修改自己的密码。
 *
 * 改密成功后 `session_version + 1`：所有旧会话（包括其它浏览器）立即失效。
 * 返回新的会话令牌，让当前浏览器无缝继续使用。
 */
export async function changeOwnPassword(options: {
  userId: number;
  currentPassword: string;
  newPassword: string;
  request?: Request;
}): Promise<{ token: string; cookie: ReturnType<typeof sessionCookieOptions>; expiresAt: Date }> {
  const row = await queryOne<PasswordRow>(
    'SELECT id, password_hash, session_version, must_reset_password FROM sys_user WHERE id = ?',
    [options.userId],
  );
  if (!row) throw AppError.notFound('账号不存在。');

  if (row.password_hash) {
    const matched = await bcrypt.compare(options.currentPassword, row.password_hash);
    if (!matched) throw AppError.badRequest('当前密码不正确。');
  }

  if (options.currentPassword && options.currentPassword === options.newPassword) {
    throw AppError.badRequest('新密码不能与当前密码相同。');
  }

  const hash = await bcrypt.hash(options.newPassword, config.auth.bcryptRounds);
  const nextVersion = Number(row.session_version) + 1;

  await execute(
    `UPDATE sys_user
        SET password_hash = ?, must_reset_password = 0, session_version = ?
      WHERE id = ?`,
    [hash, nextVersion, options.userId],
  );

  await writeAudit({
    user: { userId: options.userId },
    module: 'auth',
    action: 'password_change',
    targetType: 'sys_user',
    targetId: options.userId,
    detail: '修改登录密码，已注销该账号的其他会话',
    request: options.request,
  });

  // 用新版本重新签发当前浏览器的会话
  const user = await queryOne<RowDataPacket & { username: string; display_name: string; roles: string | null }>(
    `SELECT u.username, u.display_name, GROUP_CONCAT(r.code ORDER BY r.id) AS roles
       FROM sys_user u
       LEFT JOIN sys_user_role ur ON ur.user_id = u.id
       LEFT JOIN sys_role r ON r.id = ur.role_id
      WHERE u.id = ?
      GROUP BY u.id`,
    [options.userId],
  );
  if (!user) throw AppError.notFound('账号不存在。');

  const { token, expiresAt } = await issueSessionToken({
    userId: options.userId,
    username: String(user.username),
    displayName: String(user.display_name),
    roles: splitRoles(user.roles),
    version: nextVersion,
  });

  return { token, cookie: sessionCookieOptions(expiresAt), expiresAt };
}

/** 管理员重置他人密码：无需原密码，但会强制对方下次登录修改 */
export async function resetUserPassword(options: {
  operatorId: number;
  targetUserId: number;
  newPassword: string;
  request?: Request;
}): Promise<void> {
  const hash = await bcrypt.hash(options.newPassword, config.auth.bcryptRounds);
  const result = await execute(
    `UPDATE sys_user
        SET password_hash = ?, must_reset_password = 1, session_version = session_version + 1
      WHERE id = ?`,
    [hash, options.targetUserId],
  );
  if (result.affectedRows === 0) throw AppError.notFound('目标账号不存在。');

  await writeAudit({
    user: { userId: options.operatorId },
    module: 'auth',
    action: 'password_change',
    targetType: 'sys_user',
    targetId: options.targetUserId,
    detail: '管理员重置账号密码，该账号下次登录须修改密码',
    request: options.request,
  });
}

export async function logout(userId: number | null, request?: Request): Promise<void> {
  if (userId) {
    await writeAudit({
      user: { userId },
      module: 'auth',
      action: 'logout',
      targetType: 'sys_user',
      targetId: userId,
      detail: '退出登录',
      request,
    });
  }
}

/** 密码强度校验，供前后端共用 */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return '密码长度至少 8 位。';
  if (password.length > 72) return '密码长度不能超过 72 位。';
  const categories = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(password));
  if (categories.length < 2) return '密码需至少包含小写字母、大写字母、数字、符号中的两类。';
  return null;
}

// 供测试与「当前登录信息」接口复用的工具
export { toSessionUser };
