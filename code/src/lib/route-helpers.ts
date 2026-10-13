/**
 * Route Handler 共用的辅助函数。
 *
 * Next.js 会校验 route.ts 的导出集合（只允许 HTTP 方法名与少数配置项），
 * 因此解析请求体、整理 zod 错误这类工具放在这里共享，而不是从 route.ts 导出。
 */
import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { findMasterResource } from '@/lib/masterdata/resources';

/** 读取 JSON 请求体；解析失败时给出明确提示而不是 500 */
export async function safeJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw AppError.badRequest('请求体不是合法的 JSON 对象。');
  }
}

/** 把 zod 错误压平成「字段 → 提示」，前端可直接标红对应输入框 */
export function flattenZod(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

/** 主数据资源元数据：字段、列、权限，供前端表单渲染 */
export function describeResource(key: string) {
  const resource = findMasterResource(key);
  if (!resource) return null;
  return {
    key: resource.key,
    singular: resource.singular,
    plural: resource.plural,
    columns: resource.columns,
    fields: resource.fields,
    permissions: resource.permissions,
  };
}
