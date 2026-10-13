/**
 * 首次部署引导：创建管理员账号。
 *
 * 为什么需要这一步：迁移脚本不会写入任何密码（数据库里不允许出现明文或默认口令），
 * 但系统必须有一个可登录的管理员才能继续配置账号。因此由环境变量驱动：
 *
 *   BOOTSTRAP_ADMIN_PASSWORD 已设置 → 启动时把该口令写入管理员账号（bcrypt 哈希）
 *   BOOTSTRAP_ADMIN_PASSWORD 未设置 → 保留库中的口令；
 *       若管理员从未设置过口令（password_hash 为空），则生成一次性随机口令，
 *       打印到启动日志，并置 must_reset_password=1 强制下次登录修改。
 *
 * 这样既不需要默认口令，也不会因为忘记配置而完全无法登录。
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from '../../src/lib/config';
import { logger } from '../../src/lib/logger';
import { execute, queryOne, type RowDataPacket } from '../../src/lib/db';

interface AdminRow extends RowDataPacket {
  id: number;
  username: string;
  password_hash: string | null;
  must_reset_password: number;
}

/** 生成一次性随机口令：避免 l/1/O/0 等易混字符 */
function generatePassword(length = 16): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%^&*';
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

export async function ensureBootstrapAdmin(): Promise<void> {
  const username = config.auth.bootstrapAdminUsername;
  if (!username) return;

  const admin = await queryOne<AdminRow>(
    'SELECT id, username, password_hash, must_reset_password FROM sys_user WHERE username = ? LIMIT 1',
    [username],
  );

  if (!admin) {
    logger.warn(
      `未找到管理员账号 ${username}。请确认已执行 pnpm db:migrate，或先在该库创建账号后再启动。`,
    );
    return;
  }

  const configuredPassword = config.auth.bootstrapAdminPassword;

  // 场景一：已配置引导口令 —— 写入哈希并允许直接登录
  if (configuredPassword) {
    const hash = await bcrypt.hash(configuredPassword, config.auth.bcryptRounds);
    await execute(
      'UPDATE sys_user SET password_hash = ?, must_reset_password = 0, status = ? WHERE id = ?',
      [hash, 'active', admin.id],
    );
    logger.info(`管理员账号 ${username} 的口令已按 BOOTSTRAP_ADMIN_PASSWORD 更新`);
    return;
  }

  // 场景二：已经有口令，不做任何改动
  if (admin.password_hash) return;

  // 场景三：从未设置口令 —— 生成一次性口令
  const temporary = generatePassword();
  const hash = await bcrypt.hash(temporary, config.auth.bcryptRounds);
  await execute(
    'UPDATE sys_user SET password_hash = ?, must_reset_password = 1, status = ? WHERE id = ?',
    [hash, 'active', admin.id],
  );

  logger.warn('已为管理员账号生成一次性口令，请立即登录并修改密码');
  logger.warn(`  账号：${username}`);
  logger.warn(`  口令：${temporary}`);
  logger.warn('  该口令只在本次启动日志中出现一次；修改密码后自动失效。');
}
