/**
 * 应用入口。
 *
 * 职责边界：这里只负责「启动 → 记录失败 → 设置退出码」，具体启动逻辑在 server/index.ts。
 * 这样拆分后，测试可以在不断言进程行为的前提下直接调用 startServer()。
 */
import process from 'node:process';
import { logger } from '../src/lib/logger';
import { startServer } from './index';

startServer().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`启动失败：${message}`, { error });
  process.exitCode = 1;
  // 显式退出，避免连接池或句柄让进程悬挂
  setTimeout(() => process.exit(1), 50).unref();
});
