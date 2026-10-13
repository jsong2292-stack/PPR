/**
 * 统一 API 响应与错误处理
 *
 * 约定：
 *   成功 → { success: true, ...payload }
 *   失败 → { error: '中文提示', detail?: string }
 */
import { NextResponse } from 'next/server';
import { HttpError } from '@/lib/auth';

export function ok<T extends Record<string, unknown>>(payload: T = {} as T, status = 200) {
  return NextResponse.json({ success: true, ...payload }, { status });
}

export function fail(error: string, status = 400, detail?: string) {
  return NextResponse.json(detail ? { error, detail } : { error }, { status });
}

/** 在 catch 中统一转换为响应，HttpError 会保留其状态码 */
export function failFrom(error: unknown, fallback = '服务器错误') {
  if (error instanceof HttpError) {
    return fail(error.message, error.status);
  }
  console.error('[API]', error);
  return fail(fallback, 500, error instanceof Error ? error.message : String(error));
}

/** 解析分页参数 */
export function parsePagination(
  searchParams: URLSearchParams,
  defaultPageSize = 20
): { page: number; pageSize: number; offset: number } {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const rawSize = parseInt(searchParams.get('pageSize') || String(defaultPageSize), 10);
  const pageSize = Math.min(100, Math.max(1, rawSize || defaultPageSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** 组装分页响应体 */
export function paginated<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number
) {
  return {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 0,
      hasMore: page * pageSize < total,
    },
  };
}
