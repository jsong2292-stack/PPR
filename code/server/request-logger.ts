/**
 * HTTP 请求日志。
 *
 * 只做一件事：记录方法、路径、状态码、耗时，并对慢请求告警。
 * 不做请求体记录 —— 体里可能包含密码与业务数据，落日志有合规风险。
 *
 * 静态资源请求（/_next/static）默认跳过，避免把日志刷满。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { logger } from '../src/lib/logger';

export type NextRequestHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<void>;

const IGNORED_PREFIXES = ['/_next/static', '/_next/image', '/favicon.ico'];

function isStaticAsset(url: string | undefined): boolean {
  if (!url) return false;
  return IGNORED_PREFIXES.some((prefix) => url.startsWith(prefix));
}

export function attachRequestLogging(
  handler: NextRequestHandler,
  options: { enabled: boolean; slowMs: number },
): NextRequestHandler {
  return async (req, res) => {
    if (!options.enabled || isStaticAsset(req.url)) {
      await handler(req, res);
      return;
    }

    const startedAt = process.hrtime.bigint();
    let aborted = false;
    res.on('close', () => {
      if (!res.writableEnded) aborted = true;
    });

    res.once('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const meta = {
        method: req.method,
        path: (req.url ?? '').split('?')[0],
        status: res.statusCode,
        ms: Math.round(durationMs),
      };
      if (aborted) {
        logger.warn('请求被中断', meta);
      } else if (durationMs >= options.slowMs) {
        logger.warn('慢请求', meta);
      } else {
        logger.debug('请求完成', meta);
      }
    });

    await handler(req, res);
  };
}
