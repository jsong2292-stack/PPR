/**
 * 认证核心逻辑
 *
 * - 密码哈希 / 校验（bcrypt，自带随机盐）
 * - JWT Session 签发与校验（HttpOnly Cookie，默认 7 天）
 * - 登录失败计数与账号冻结
 * - 密码 / 用户名 / 手机号格式校验
 *
 * 所有业务接口统一通过 getCurrentUser() 获取当前登录用户。
 */
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '@/storage/database/shared/schema';
import { queryOne, query } from '@/storage/database/mysql-client';

const JWT_SECRET = process.env.JWT_SECRET || 'rifeng-platform-demo-jwt-secret';
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'session';
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 7);

/** 连续登录失败多少次后冻结账号 */
const MAX_LOGIN_ATTEMPTS = 5;
/** 冻结时长（毫秒），默认 1 小时 */
const FREEZE_DURATION = 60 * 60 * 1000;

// ============================================================
// 密码
// ============================================================

/** 密码加密（bcrypt，自带随机盐） */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/** 校验密码是否匹配 */
export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

// ============================================================
// Session / JWT
// ============================================================

export interface SessionClaims {
  userId: string;
  /** 认证来源：local（本地账号）或 sso（单点登录） */
  authProvider?: 'local' | 'sso';
  /** 单点登录返回的外部用户标识，便于对接第三方系统 */
  externalUserId?: string;
}

export type SessionIdentity = Omit<SessionClaims, 'userId'>;

/** 生成 JWT Token（签名防篡改，exp 自动校验过期） */
export function generateToken(userId: string, identity: SessionIdentity = {}): string {
  return jwt.sign({ userId, ...identity }, JWT_SECRET, {
    expiresIn: `${SESSION_TTL_DAYS}d`,
  });
}

/** 校验 JWT Token，失败返回 null */
export function verifyToken(token: string): SessionClaims | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionClaims;
  } catch {
    return null;
  }
}

/**
 * 是否给 Session Cookie 追加 Secure 标记。
 *
 * 默认生产环境开启；本地以生产模式跑 HTTP 调试时，
 * 可用 SESSION_COOKIE_SECURE=false 关闭，否则浏览器不会保存 Cookie。
 */
function shouldUseSecure(): boolean {
  const explicit = process.env.SESSION_COOKIE_SECURE;
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  return process.env.NODE_ENV === 'production' || process.env.COZE_PROJECT_ENV === 'PROD';
}

/**
 * 在 NextResponse 上写入 session cookie。
 * 必须通过 response.cookies 写入，才能与 clearSessionCookie 等操作保持一致的响应头。
 */
export function setSessionCookie(
  response: NextResponse,
  userId: string,
  remember = false,
  identity: SessionIdentity = {}
): void {
  const token = generateToken(userId, identity);
  // 勾选「记住我」使用完整有效期，否则仅保持 1 天
  const maxAge = remember ? SESSION_TTL_DAYS * 24 * 60 * 60 : 24 * 60 * 60;

  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: shouldUseSecure(),
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}

/** 在 NextResponse 上清除 session cookie */
export function clearSessionCookie(response: NextResponse): void {
  response.cookies.delete(SESSION_COOKIE_NAME);
}

/** 获取当前签名 Session（仅解 JWT，不查库） */
export async function getCurrentSession(): Promise<SessionClaims | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

/** 获取当前登录用户的完整信息 */
export async function getCurrentUser(): Promise<User | null> {
  const decoded = await getCurrentSession();
  if (!decoded) return null;

  try {
    return await queryOne<User>('SELECT * FROM users WHERE id = $1', [decoded.userId]);
  } catch (error) {
    console.error('[Auth] getCurrentUser error:', error);
    return null;
  }
}

/** 判断当前登录用户是否为管理员 */
export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.role === 'admin';
}

/**
 * 鉴权辅助：返回当前用户，未登录时抛出带状态码的错误。
 * 用法：const user = await requireUser();
 */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, '请先登录');
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== 'admin') throw new HttpError(403, '无权限操作');
  return user;
}

// ============================================================
// 登录失败与冻结
// ============================================================

/** 检查账号是否处于冻结期 */
export async function isAccountFrozen(userId: string): Promise<boolean> {
  try {
    const row = await queryOne<{ frozen: number }>(
      'SELECT (frozen_until IS NOT NULL AND frozen_until > NOW()) AS frozen FROM users WHERE id = $1',
      [userId]
    );
    return Boolean(row?.frozen);
  } catch {
    return false;
  }
}

/** 记录一次登录失败，达到阈值则冻结账号 */
export async function handleLoginFail(userId: string): Promise<void> {
  try {
    const user = await queryOne<{ login_fail_count: number }>(
      'SELECT login_fail_count FROM users WHERE id = $1',
      [userId]
    );

    const failCount = (user?.login_fail_count || 0) + 1;

    if (failCount >= MAX_LOGIN_ATTEMPTS) {
      // 冻结时间在数据库端计算，避免应用与数据库时钟 / 时区不一致导致的偏差
      const freezeMinutes = Math.round(FREEZE_DURATION / 60000);
      await query(
        `UPDATE users
            SET login_fail_count = $1,
                frozen_until = DATE_ADD(NOW(), INTERVAL ${freezeMinutes} MINUTE)
          WHERE id = $2`,
        [failCount, userId]
      );
    } else {
      await query('UPDATE users SET login_fail_count = $1 WHERE id = $2', [
        failCount,
        userId,
      ]);
    }
  } catch (error) {
    console.error('[Auth] handleLoginFail error:', error);
  }
}

/** 登录成功后重置失败计数与冻结状态 */
export async function resetLoginFailCount(userId: string): Promise<void> {
  try {
    await query(
      'UPDATE users SET login_fail_count = 0, frozen_until = NULL WHERE id = $1',
      [userId]
    );
  } catch (error) {
    console.error('[Auth] resetLoginFailCount error:', error);
  }
}

// ============================================================
// 格式校验
// ============================================================

/** 用户名：3-20 位字母 / 数字 / 下划线 */
export function validateUsername(username: string): boolean {
  return /^[a-zA-Z0-9_]{3,20}$/.test(username);
}

export function validatePhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone);
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** 密码强度：至少 8 位且同时包含字母与数字 */
export function validatePassword(password: string): boolean {
  return password.length >= 8 && /[a-zA-Z]/.test(password) && /\d/.test(password);
}

/** 生成 6 位数字验证码（示例实现） */
export function generateVerificationCode(): string {
  return Math.random().toString().slice(2, 8);
}

/** 发送短信验证码（示例实现，接入真实短信服务时替换此处） */
export async function sendSMS(phone: string, code: string): Promise<void> {
  console.log(`[SMS] 向 ${phone} 发送验证码: ${code}`);
  await new Promise((resolve) => setTimeout(resolve, 500));
}

/** 导出当前 session cookie 名，供自定义 Server 复用 */
export const sessionCookieName = SESSION_COOKIE_NAME;
