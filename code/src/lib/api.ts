import { NextResponse } from 'next/server';
import process from 'node:process';
import { AppError, fail, ok } from './errors';
import { logger } from './logger';
import { getSessionUser, type SessionUser } from './auth/session';
import type { Permission } from './auth/permissions';

/** 路由处理器上下文：已解析的路径参数 */
export interface RouteContext<P = Record<string, string>> {
  params: Promise<P>;
}

export interface ApiHandlerOptions {
  /** 操作名，用于日志与错误上下文 */
  name: string;
  /**
   * 需要的权限。省略表示「必须登录但不需要额外权限」；
   * 传 `null` 表示公开接口（登录、健康检查）。
   */
  permission?: Permission | null;
  /** 是否要求已修改初始密码（默认要求，登录/改密接口传 false） */
  allowPasswordResetPending?: boolean;
}

/**
 * API 路由统一包装器。
 *
 * 它把每个路由都必须重复的四件事收敛到一处：
 *   1) 登录与权限校验（未登录 401、无权限 403）
 *   2) 业务异常 → 结构化错误响应
 *   3) 未预期异常 → 记录堆栈 + 500（不泄露内部细节）
 *   4) 统一成功响应结构 { ok: true, data }
 *
 * 路由里只写业务逻辑，鉴权通过 options.permission 声明式表达。
 */
export function withApi<P = Record<string, string>, T = unknown>(
  options: ApiHandlerOptions,
  handler: (ctx: {
    request: Request;
    user: SessionUser | null;
    params: P;
  }) => Promise<NextResponse<T> | NextResponse>,
) {
  return async (request: Request, routeContext?: RouteContext<P>): Promise<NextResponse> => {
    const startedAt = Date.now();
    try {
      let user: SessionUser | null = null;
      if (options.permission !== null) {
        user = await getSessionUser({
          allowPasswordResetPending: options.allowPasswordResetPending,
        });
        if (!user) throw AppError.unauthorized();
        if (options.permission && !user.permissions.includes(options.permission)) {
          throw AppError.forbidden(`当前角色无权执行该操作（缺少权限：${options.permission}）。`);
        }
      }

      const params = routeContext?.params ? await routeContext.params : ({} as P);
      const response = await handler({ request, user, params });

      if (config_debug_enabled()) {
        logger.debug(`${options.name} 完成`, {
          ms: Date.now() - startedAt,
          status: response.status,
        });
      }
      return response;
    } catch (error) {
      return fail(error, options.name) as NextResponse;
    }
  };
}

function config_debug_enabled(): boolean {
  return process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV !== 'production';
}

export { ok };
