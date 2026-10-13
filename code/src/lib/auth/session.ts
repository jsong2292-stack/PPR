/**
 * 会话与登录态。
 *
 * 方案：无状态 JWT（HS256，`jose`）+ httpOnly Cookie。
 *   - 不需要 Redis 等外部会话存储，适合单机/多实例横向扩展
 *   - `session_version` 参与签名：管理员重置密码或停用账号时递增该字段，
 *     旧令牌立即失效（等价于「强制下线」），无需维护黑名单
 *   - 生产环境要求 AUTH_SECRET ≥ 32 字符，见 assertAuthConfig()
 *
 * 本文件同时被 Route Handler 与 Server Component 使用，因此保持纯函数、
 * 不引入 Next 的 request/response 之外的依赖。
 */
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { config, assertAuthConfig } from '../config';
import { queryOne, type RowDataPacket } from '../db';
import { AppError } from '../errors';
import { type RoleCode, permissionsOf, type Permission } from './permissions';

/** 会话载荷：只放身份与授权必需字段，不放姓名/邮箱等可随时查库的信息 */
export interface SessionPayload {
  /** sys_user.id */
  userId: number;
  username: string;
  displayName: string;
  roles: RoleCode[];
  /** sys_user.session_version 快照，用于强制下线 */
  version: number;
  /** 签发时间 / 过期时间（秒） */
  iat: number;
  exp: number;
}

/** 会话用户：会话载荷 + 权限集合，业务层直接用这个对象做鉴权 */
export interface SessionUser extends SessionPayload {
  permissions: Permission[];
  /** 是否已完成初始密码修改（false 时只允许访问改密页） */
  passwordChanged: boolean;
}

function secretKey(): Uint8Array {
  assertAuthConfig();
  return new TextEncoder().encode(config.auth.secret);
}

/** 签发会话令牌 */
export async function issueSessionToken(
  payload: Omit<SessionPayload, 'iat' | 'exp'>,
): Promise<{ token: string; expiresAt: Date }> {
  const ttlSeconds = Math.max(1, config.auth.sessionTtlHours) * 3600;
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = new Date((now + ttlSeconds) * 1000);

  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setIssuer('ppr-quality-analysis')
    .setAudience('ppr-web')
    .setExpirationTime(now + ttlSeconds)
    .sign(secretKey());

  return { token, expiresAt };
}

/** 校验令牌；失败返回 null（调用方决定是 401 还是跳登录页） */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: 'ppr-quality-analysis',
      audience: 'ppr-web',
    });
    if (!payload.sub && typeof payload.userId !== 'number') return null;
    return {
      userId: Number(payload.userId),
      username: String(payload.username ?? ''),
      displayName: String(payload.displayName ?? ''),
      roles: Array.isArray(payload.roles) ? (payload.roles as RoleCode[]) : [],
      version: Number(payload.version ?? 0),
      iat: Number(payload.iat ?? 0),
      exp: Number(payload.exp ?? 0),
    };
  } catch {
    return null;
  }
}

/** Cookie 写入参数：默认随会话过期，生产环境要求 HTTPS */
export function sessionCookieOptions(expiresAt: Date) {
  return {
    name: config.auth.cookieName,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.isProduction,
    path: '/',
    expires: expiresAt,
  };
}

export function clearCookieOptions() {
  return {
    name: config.auth.cookieName,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.isProduction,
    path: '/',
    maxAge: 0,
  };
}

interface UserRow extends RowDataPacket {
  id: number;
  username: string;
  display_name: string;
  status: 'active' | 'disabled';
  must_reset_password: number;
  session_version: number;
  password_hash: string | null;
  roles: string | null;
  email: string | null;
  employee_no: string | null;
  department: string | null;
  last_login_at: string | null;
}

/** 读取用户及其角色（登录与刷新会话共用） */
export async function findUserByUsername(username: string): Promise<UserRow | null> {
  return queryOne<UserRow>(
    `SELECT u.id, u.username, u.display_name, u.status, u.must_reset_password,
            u.session_version, u.password_hash, u.email, u.employee_no, u.department,
            u.last_login_at,
            GROUP_CONCAT(r.code ORDER BY r.id) AS roles
       FROM sys_user u
       LEFT JOIN sys_user_role ur ON ur.user_id = u.id
       LEFT JOIN sys_role r ON r.id = ur.role_id
      WHERE u.username = ?
      GROUP BY u.id`,
    [username],
  );
}

/** 按 id 读取用户（每次请求校验会话时刷新，保证权限变更即时生效） */
export async function findUserById(userId: number): Promise<UserRow | null> {
  // 刻意不查 password_hash：会话校验不需要它，而本函数的返回值会在服务端渲染时
  // 被序列化进页面（RSC payload）。带上哈希等于把口令材料写进每一个受保护页面的 HTML。
  // 登录口令校验走 findUserByUsername（只在登录接口里使用）。
  return queryOne<UserRow>(
    `SELECT u.id, u.username, u.display_name, u.status, u.must_reset_password,
            u.session_version, u.email, u.employee_no, u.department,
            u.last_login_at,
            GROUP_CONCAT(r.code ORDER BY r.id) AS roles
       FROM sys_user u
       LEFT JOIN sys_user_role ur ON ur.user_id = u.id
       LEFT JOIN sys_role r ON r.id = ur.role_id
      WHERE u.id = ?
      GROUP BY u.id`,
    [userId],
  );
}

export function splitRoles(value: string | null): RoleCode[] {
  if (!value) return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean) as RoleCode[];
}

export function toSessionUser(
  row: UserRow,
  version: number,
  iat = 0,
  exp = 0,
  passwordChanged = true,
): SessionUser {
  const roles = splitRoles(row.roles);
  return {
    userId: row.id,
    username: row.username,
    displayName: row.display_name,
    roles,
    version,
    iat,
    exp,
    permissions: permissionsOf(roles),
    passwordChanged,
  };
}

/**
 * 读取当前请求的会话用户。
 *
 * 除了校验签名与过期时间，还会回查数据库确认：
 *   - 账号未被停用
 *   - session_version 未变化（密码重置 / 强制下线）
 * 这样停用账号后无需等待令牌过期即可生效。
 *
 * @param options.allowPasswordResetPending 首登未改密时是否放行（仅用于改密接口与页面）
 */
export async function getSessionUser(options?: {
  allowPasswordResetPending?: boolean;
}): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(config.auth.cookieName)?.value;
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const row = await findUserById(payload.userId);
  if (!row || row.status !== 'active') return null;
  if (Number(row.session_version) !== payload.version) return null;
  if (row.must_reset_password === 1 && !options?.allowPasswordResetPending) return null;

  return toSessionUser(
    row,
    payload.version,
    payload.iat,
    payload.exp,
    row.must_reset_password !== 1,
  );
}

/** 必须登录，否则抛 401 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw AppError.unauthorized();
  return user;
}

/** 必须登录且具备权限，否则抛 401/403 */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.permissions.includes(permission)) {
    throw AppError.forbidden(`当前角色无权执行该操作（缺少权限：${permission}）。`);
  }
  return user;
}

/** 会话用户是否具备某权限（用于界面按需渲染） */
export function can(user: SessionUser | null, permission: Permission): boolean {
  return !!user && user.permissions.includes(permission);
}
