/**
 * 业务错误与 API 错误响应。
 *
 * 约定：可预期的失败（参数错误、未登录、无权限、资源不存在、状态冲突）
 * 一律抛 `AppError`，由 `withApi()` 统一转成 JSON 响应；
 * 未预期的异常按 500 返回并记录完整堆栈，不把内部细节泄露给前端。
 */
import { NextResponse } from 'next/server';
import { logger } from './logger';

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_FAILED'
  | 'UNPROCESSABLE'
  | 'INTERNAL';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_FAILED: 422,
  UNPROCESSABLE: 422,
  INTERNAL: 500,
};

export interface AppErrorDetails {
  /** 字段级错误，前端可直接标红 */
  fields?: Record<string, string>;
  /** 附加信息（例如冲突时的引用清单） */
  extra?: Record<string, unknown>;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: AppErrorDetails;

  constructor(code: ErrorCode, message: string, details?: AppErrorDetails) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }

  static badRequest(message: string, details?: AppErrorDetails) {
    return new AppError('BAD_REQUEST', message, details);
  }

  static unauthorized(message = '请先登录') {
    return new AppError('UNAUTHORIZED', message);
  }

  static forbidden(message = '当前账号无权执行该操作') {
    return new AppError('FORBIDDEN', message);
  }

  static notFound(message = '资源不存在') {
    return new AppError('NOT_FOUND', message);
  }

  static conflict(message: string, details?: AppErrorDetails) {
    return new AppError('CONFLICT', message, details);
  }

  static validation(message: string, fields?: Record<string, string>) {
    return new AppError('VALIDATION_FAILED', message, { fields });
  }

  static unprocessable(message: string, details?: AppErrorDetails) {
    return new AppError('UNPROCESSABLE', message, details);
  }
}

/** 统一响应体结构：前端只需判断 ok 字段 */
export interface ApiSuccessBody<T> {
  ok: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorBody {
  ok: false;
  code: ErrorCode;
  message: string;
  fields?: Record<string, string>;
  extra?: Record<string, unknown>;
}

export function ok<T>(data: T, meta?: Record<string, unknown>, init?: ResponseInit): NextResponse {
  const body: ApiSuccessBody<T> = meta ? { ok: true, data, meta } : { ok: true, data };
  return NextResponse.json(body, init);
}

export function fail(error: unknown, context?: string): NextResponse {
  if (error instanceof AppError) {
    const body: ApiErrorBody = {
      ok: false,
      code: error.code,
      message: error.message,
      ...(error.details?.fields ? { fields: error.details.fields } : {}),
      ...(error.details?.extra ? { extra: error.details.extra } : {}),
    };
    if (error.status >= 500) {
      logger.error(`${context ?? 'API'} 业务异常：${error.message}`, { error });
    } else {
      logger.debug(`${context ?? 'API'} 请求被拒绝：${error.message}`, { code: error.code });
    }
    return NextResponse.json(body, { status: error.status });
  }

  // MySQL 唯一键冲突 → 409，比 500 更贴近事实
  const mysqlCode = (error as { code?: string } | null)?.code;
  if (mysqlCode === 'ER_DUP_ENTRY') {
    const body: ApiErrorBody = {
      ok: false,
      code: 'CONFLICT',
      message: '数据已存在，违反唯一性约束。请检查编码 / 编号是否重复。',
    };
    return NextResponse.json(body, { status: 409 });
  }
  if (mysqlCode === 'ER_ROW_IS_REFERENCED_2' || mysqlCode === 'ER_NO_REFERENCED_ROW_2') {
    const body: ApiErrorBody = {
      ok: false,
      code: 'CONFLICT',
      message: '该记录仍被其他数据引用，或引用了不存在的记录。请先解除关联。',
    };
    return NextResponse.json(body, { status: 409 });
  }

  logger.error(`${context ?? 'API'} 未处理异常`, { error });
  const body: ApiErrorBody = {
    ok: false,
    code: 'INTERNAL',
    message: '服务内部错误，请稍后重试或联系管理员。',
  };
  return NextResponse.json(body, { status: 500 });
}
