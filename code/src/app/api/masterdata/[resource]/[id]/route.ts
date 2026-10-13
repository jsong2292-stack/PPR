import { withApi, ok } from '@/lib/api';
import { AppError } from '@/lib/errors';
import { parseId } from '@/lib/validation';
import { findMasterResource } from '@/lib/masterdata/resources';
import {
  deleteMasterRow,
  findMasterRow,
  updateMasterRow,
} from '@/lib/masterdata/service';
import { safeJson, flattenZod, describeResource } from '@/lib/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 主数据详情 / 修改 / 删除。
 *
 * 路径：/api/masterdata/:resource/:id
 * 删除语义：带 is_deleted 的表为软删除；存在引用时返回 409 并说明引用来源。
 */
export const GET = withApi<{ resource: string; id: string }>(
  { name: 'GET /api/masterdata/:resource/:id', permission: 'masterdata:read' },
  async ({ params }) => {
    const resource = findMasterResource(params.resource);
    if (!resource) throw AppError.notFound(`未知的主数据资源：${params.resource}`);
    const id = parseId(params.id);
    const row = await findMasterRow(params.resource, id);
    if (!row) throw AppError.notFound(`${resource.singular}不存在或已删除。`);
    return ok({ row, resource: describeResource(params.resource) });
  },
);

export const PUT = withApi<{ resource: string; id: string }>(
  { name: 'PUT /api/masterdata/:resource/:id', permission: 'masterdata:write' },
  async ({ request, params, user }) => {
    const resource = findMasterResource(params.resource);
    if (!resource) throw AppError.notFound(`未知的主数据资源：${params.resource}`);
    const id = parseId(params.id);

    const body = await safeJson(request);
    const parsed = resource.schema.partial().safeParse(body);
    if (!parsed.success) {
      throw AppError.validation('数据校验未通过。', flattenZod(parsed.error));
    }

    const row = await updateMasterRow(params.resource, id, parsed.data as Record<string, unknown>, {
      userId: user!.userId,
      request,
    });
    return ok({ row });
  },
);

export const DELETE = withApi<{ resource: string; id: string }>(
  { name: 'DELETE /api/masterdata/:resource/:id', permission: 'masterdata:delete' },
  async ({ request, params, user }) => {
    const resource = findMasterResource(params.resource);
    if (!resource) throw AppError.notFound(`未知的主数据资源：${params.resource}`);
    const id = parseId(params.id);

    const result = await deleteMasterRow(params.resource, id, {
      userId: user!.userId,
      request,
    });
    return ok(result);
  },
);
