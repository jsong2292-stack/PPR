import { withApi, ok } from '@/lib/api';
import { pingDatabase } from '@/lib/db';
import { config } from '@/lib/config';
import process from 'node:process';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 健康检查。
 *
 * 公开接口（不需要登录）：编排系统的探针不应依赖业务账号。
 * 只暴露连通性与版本，不返回任何业务数据或配置细节。
 */
export const GET = withApi({ name: 'GET /api/health', permission: null }, async () => {
  const startedAt = Date.now();
  try {
    const info = await pingDatabase();
    return ok({
      status: 'ok',
      database: {
        connected: true,
        version: info.version,
        database: config.db.database,
        latencyMs: Date.now() - startedAt,
      },
      runtime: {
        node: process.version,
        env: config.nodeEnv,
        uptimeSeconds: Math.round(process.uptime()),
      },
      time: info.now,
    });
  } catch (error) {
    // 探针需要明确的失败信号：这里返回 503 而不是 200
    const message = error instanceof Error ? error.message : String(error);
    return ok(
      {
        status: 'degraded',
        database: { connected: false, message },
        runtime: { node: process.version, env: config.nodeEnv },
      },
      undefined,
      { status: 503 },
    );
  }
});
