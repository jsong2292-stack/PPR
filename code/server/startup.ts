/**
 * 启动前置检查。
 *
 * 目标：让「配置错误」「数据库不可用」在进程启动阶段就暴露，
 * 而不是等第一个用户点开页面时报 500。容器编排依赖退出码判断实例健康，
 * 因此检查失败必须抛出异常（由 server/index.ts 之外的最外层决定退出码）。
 */
import { config, assertAuthConfig, assertDatabaseConfig } from '../src/lib/config';
import { logger } from '../src/lib/logger';
import { pingDatabase } from '../src/lib/db';
import { ensureBootstrapAdmin } from './bootstrap/admin';

export async function runStartupChecks(): Promise<void> {
  assertAuthConfig();
  assertDatabaseConfig();

  if (config.isProduction && config.auth.bootstrapAdminPassword) {
    logger.warn(
      '检测到 BOOTSTRAP_ADMIN_PASSWORD 仍配置在生产环境中。管理员账号创建成功后请立即移除该变量。',
    );
  }

  // 允许在无数据库环境（例如只做构建产物静态校验）跳过连通性检查
  if (process.env.SKIP_DB_STARTUP_CHECK === '1') {
    logger.warn('已按 SKIP_DB_STARTUP_CHECK=1 跳过数据库连通性检查');
    return;
  }

  const startedAt = Date.now();
  try {
    const info = await pingDatabase();
    logger.info(
      `数据库连接正常：${config.db.user}@${config.db.host}:${config.db.port}/${config.db.database}` +
        ` · MySQL ${info.version} · ${Date.now() - startedAt} ms`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `数据库连接失败：${message}\n` +
        `请检查：1) MySQL 是否运行；2) .env.local 中 DB_* 是否正确；3) 是否已执行 pnpm db:migrate。`,
    );
  }

  await ensureBootstrapAdmin();
}
