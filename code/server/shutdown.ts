/**
 * 信号处理与优雅退出。
 *
 * 容器编排（Docker / K8s）在停止实例时会发送 SIGTERM，随后等待宽限期。
 * 正确处理信号可以避免：请求被硬中断、数据库连接泄漏、迁移脚本半途而废。
 *
 * 同时兜住 `unhandledRejection` / `uncaughtException`：
 * 记录完整信息后以非零码退出，交给编排系统重启，而不是让进程带病运行。
 */
import process from 'node:process';
import { logger } from '../src/lib/logger';

let shuttingDown = false;

export function registerShutdownHandlers(
  close: (reason?: string) => Promise<void>,
): void {
  const shutdown = async (signal: string, exitCode = 0): Promise<void> => {
    if (shuttingDown) {
      logger.warn(`已在关闭流程中，忽略重复信号 ${signal}`);
      return;
    }
    shuttingDown = true;
    try {
      await close(signal);
    } catch (error) {
      logger.error('关闭过程出错', { error });
      exitCode = 1;
    } finally {
      process.exit(exitCode);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('未处理的 Promise 拒绝', { error: reason });
  });

  process.on('uncaughtException', (error) => {
    logger.error('未捕获异常，进程即将退出', { error });
    void shutdown('uncaughtException', 1);
  });
}
