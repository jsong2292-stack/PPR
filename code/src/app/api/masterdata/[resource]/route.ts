import { z } from 'zod';
import { withApi, ok } from '@/lib/api';
import { AppError } from '@/lib/errors';
import { paginationSchema } from '@/lib/validation';
import { findMasterResource } from '@/lib/masterdata/resources';
import { createMasterRow, listMasterRows, listMasterOptions } from '@/lib/masterdata/service';
import { describeResource, flattenZod, safeJson } from '@/lib/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const listQuerySchema = paginationSchema.extend({
  keyword: z.string().trim().max(64).optional(),
  status: z.string().trim().max(32).optional(),
  options: z.coerce.boolean().optional(),
});

/**
 * 主数据列表 / 新增。
 *
 * 路径：/api/masterdata/:resource
 *   GET  ?keyword=&status=&page=&pageSize=&options=1
 *   POST 请求体为资源配置中的字段
 *
 * `options=1` 返回精简下拉选项（供引用型字段使用），避免前端再写一套接口。
 */
export const GET = withApi<{ resource: string }>(
  { name: 'GET /api/masterdata/:resource', permission: 'masterdata:read' },
  async ({ request, params }) => {
    const resource = findMasterResource(params.resource);
    if (!resource) throw AppError.notFound(`未知的主数据资源：${params.resource}`);

    const url = new URL(request.url);
    const query = listQuerySchema.parse(Object.fromEntries(url.searchParams));

    if (query.options) {
      return ok({ options: await listMasterOptions(params.resource) });
    }

    const result = await listMasterRows(params.resource, {
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword,
      status: query.status,
    });
    return ok({ ...result, resource: describeResource(params.resource) });
  },
);

export const POST = withApi<{ resource: string }>(
  { name: 'POST /api/masterdata/:resource', permission: 'masterdata:write' },
  async ({ request, params, user }) => {
    const resource = findMasterResource(params.resource);
    if (!resource) throw AppError.notFound(`未知的主数据资源：${params.resource}`);

    const body = await safeJson(request);
    const parsed = resource.schema.safeParse(body);
    if (!parsed.success) {
      throw AppError.validation('数据校验未通过。', flattenZod(parsed.error));
    }

    const created = await createMasterRow(params.resource, parsed.data as Record<string, unknown>, {
      userId: user!.userId,
      request,
    });
    return ok({ row: created }, undefined, { status: 201 });
  },
);
