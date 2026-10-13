/**
 * 创建 Next.js 应用实例。
 *
 * 开发环境走 `next dev`，生产环境走已构建的 `.next` 产物。
 * `dev` 与 `production` 的分支必须显式传入，否则可能出现
 * 「生产模式跑开发产物」这类难以排查的问题。
 *
 * 关于 dev 下的 `--turbopack`：Next 16 的 Turbopack 是默认打包器，
 * 自定义 Server 无需额外传 bundler 选项，这里保持默认，避免与 CLI 行为不一致。
 */
import next from 'next';
import { config } from '../src/lib/config';
import { logger } from '../src/lib/logger';

export async function createNextApp() {
  const app = next({
    dev: config.isDevelopment,
    hostname: config.server.host,
    port: config.server.port,
    // 生产模式下显式指向项目根目录下的 .next
    dir: process.cwd(),
    quiet: config.isProduction,
  });

  const startedAt = Date.now();
  await app.prepare();
  logger.debug(`Next 应用就绪（${Date.now() - startedAt} ms）`);
  return app;
}
