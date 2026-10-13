/**
 * 自定义 Server。
 *
 * 为什么需要自定义 Server（而不是直接用 `next start`）：
 *   1) 生产环境要求可配置的优雅退出：收到 SIGTERM 后先停止接收新请求，
 *      等待在途请求与数据库连接池收尾，再由编排系统（K8s / systemd / Docker）确认退出；
 *   2) 需要在不改动 Next 内部行为的前提下记录请求耗时与慢请求；
 *   3) 需要在启动时做前置检查（配置完整性、数据库连通性）并在失败时以非零码退出，
 *      避免「进程活着但连不上库」这种最容易误判的故障。
 *
 * 实现方式：包一层原生 http.Server，把请求交给 Next 的请求处理器。
 * 这意味着 Next 的 App Router、Route Handler、静态资源等全部行为不变，
 * 我们只在最外层增加运维能力。
 */
import http from 'node:http';
import process from 'node:process';
import { config } from '../src/lib/config';
import { logger } from '../src/lib/logger';
import { closePool } from '../src/lib/db';
import { createNextApp } from './next-app';
import { registerShutdownHandlers } from './shutdown';
import { runStartupChecks } from './startup';
import { attachRequestLogging } from './request-logger';
import { startRuleScheduler, stopRuleScheduler } from '../src/lib/services/ruleScheduler';

export interface StartedServer {
  server: http.Server;
  url: string;
  close: (reason?: string) => Promise<void>;
}

export async function startServer(): Promise<StartedServer> {
  await runStartupChecks();

  const app = await createNextApp();
  const handle = app.getRequestHandler();
  const upgradeHandler = app.getUpgradeHandler();

  // Next 的请求处理器要求拿到 Node 原生 req/res；
  // 请求日志挂在内层，保证「Next 处理完但响应还在写」的情况也能记录耗时。
  const requestListener = attachRequestLogging(handle, {
    enabled: config.logging.requestLog,
    slowMs: config.db.slowQueryMs,
  });

  const server = http.createServer((req, res) => {
    // 统一捕获同步抛出的异常，避免单个请求让进程崩溃
    void requestListener(req, res).catch((error: unknown) => {
      logger.error('请求处理未捕获异常', { error, url: req.url });
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ ok: false, code: 'INTERNAL', message: '服务内部错误' }));
      } else {
        res.end();
      }
    });
  });

  server.on('upgrade', (req, socket, head) => {
    void upgradeHandler(req, socket, head).catch(() => socket.destroy());
  });

  const { host, port } = config.server;
  await new Promise<void>((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.off('listening', onListening);
      if (error.code === 'EADDRINUSE') {
        reject(new Error(`端口 ${port} 已被占用。请修改 PORT 环境变量或停止占用进程。`));
        return;
      }
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });

  const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`;
  logger.info('服务已启动', {
    环境: config.nodeEnv,
    Next监听: `${host}:${port}`,
    Node: process.version,
  });
  // 同时打印「实际监听地址」与「对外地址」：反向代理后面两者不同，
  // 只打印 APP_URL 会让本机验证时误以为是配置没生效。
  logger.info(
    config.server.appUrl && config.server.appUrl !== url
      ? `实际监听：${url}（对外地址按 APP_URL 视为 ${config.server.appUrl}）`
      : `访问入口：${url}`,
  );

  const close = async (reason = ''): Promise<void> => {
    logger.info(`开始关闭服务${reason ? `（${reason}）` : ''}`);
    // 先停掉后台任务，避免关闭过程中还在扫描数据库
    stopRuleScheduler();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      // 兜底：超时后强制结束，避免挂起的 keep-alive 连接阻塞退出
      const timer = setTimeout(resolve, config.server.shutdownTimeoutMs);
      timer.unref?.();
    });
    await app.close();
    await closePool();
    logger.info('服务已关闭');
  };

  // 规则引擎定时扫描：应用启动后按配置的间隔扫描新抽检记录
  startRuleScheduler();

  registerShutdownHandlers(close);

  return { server, url, close };
}
