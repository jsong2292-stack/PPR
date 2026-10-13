/**
 * 请求参数校验。
 *
 * 统一用 zod 定义入参结构，校验失败时抛 `AppError.validation`，
 * 由 withApi() 转成带字段级错误的 422 响应 —— 前端可以直接把 fields 标到表单上。
 *
 * 这样做的好处：路由处理器里不再出现「if (!body.xxx) return ...」的重复代码，
 * 参数约束集中在 schema 里，读接口定义即可知道接口契约。
 */
import { z } from 'zod';
import { AppError } from './errors';

/** 把 zod 的 issue 列表压成 { 字段: 错误信息 } */
function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

/** 解析 JSON 请求体并校验 */
export async function parseBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw AppError.badRequest('请求体不是合法的 JSON。');
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw AppError.validation('请求参数校验未通过。', toFieldErrors(result.error));
  }
  return result.data;
}

/** 解析查询参数（GET） */
export function parseQuery<T extends z.ZodTypeAny>(request: Request, schema: T): z.infer<T> {
  const url = new URL(request.url);
  const raw: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    // 空值等价于「没有传这个过滤条件」：前端清空筛选框后拼出的
    // `?status=&keyword=` 不应该被当成非法枚举值砸回 422。
    if (value === '') continue;
    raw[key] = value;
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw AppError.validation('查询参数校验未通过。', toFieldErrors(result.error));
  }
  return result.data;
}

/** 解析路径参数（数字 ID） */
export function parseId(value: string | undefined, label = 'ID'): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw AppError.badRequest(`${label} 必须是正整数。`);
  }
  return id;
}

// ── 通用 schema 片段 ────────────────────────────────────────────────

/** 允许为空的文本：'' 与 undefined 都归一成 null */
export const optionalText = (max = 255) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
      if (value === null || value === undefined) return null;
      const text = value.trim();
      return text === '' ? null : text;
    })
    .refine((value) => value === null || value.length <= max, {
      message: `长度不能超过 ${max} 个字符`,
    });

/** 必填文本 */
export const requiredText = (label: string, max = 255) =>
  z
    .string({ error: `${label}不能为空` })
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, { message: `${label}不能为空` })
    .refine((value) => value.length <= max, { message: `${label}长度不能超过 ${max} 个字符` });

/** 可空数值：'' / null / undefined → null；同时接受数字字符串（数据库 DECIMAL 返回字符串） */
export const optionalNumber = (label: string) =>
  z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((value) => {
      if (value === null || value === undefined || value === '') return null;
      const num = Number(value);
      return Number.isFinite(num) ? num : Number.NaN;
    })
    .refine((value) => value === null || !Number.isNaN(value), { message: `${label}必须是有效数字` });

/** 必填数值 */
export const requiredNumber = (label: string) =>
  z
    .union([z.number(), z.string()])
    .transform((value, ctx) => {
      if (value === '' || value === null || value === undefined) {
        ctx.addIssue({ code: 'custom', message: `${label}不能为空` });
        return z.NEVER;
      }
      const num = Number(value);
      if (!Number.isFinite(num)) {
        ctx.addIssue({ code: 'custom', message: `${label}必须是有效数字` });
        return z.NEVER;
      }
      return num;
    });

/** 正整数，用于 ID 数组 */
export const idArray = z.array(z.number().int().positive()).default([]);

/** 布尔值：接受 '1' / 'true' / 1 */
export const booleanish = z
  .union([z.boolean(), z.string(), z.number()])
  .transform((value) => ['1', 'true', 'yes', 'on', true, 1].includes(value as never));

/** 分页（作为可扩展的 schema 基座，用 .extend() 追加过滤条件） */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

export type Pagination = { page: number; pageSize: number };
