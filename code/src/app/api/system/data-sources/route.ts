import { z } from 'zod';
import { withApi, ok } from '@/lib/api';
import { AppError } from '@/lib/errors';
import { paginationSchema, parseQuery } from '@/lib/validation';
import { flattenZod, safeJson } from '@/lib/route-helpers';
import {
  createDataSource,
  deleteDataSource,
  listDataSources,
  updateDataSource,
} from '@/lib/services/systemService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 数据来源字典接口（系统管理 → 数据来源字典）。
 *
 * 只管理**真实**数据源（data_source.is_simulated = 0）。
 * 联调期写入的模拟来源（is_simulated = 1）不会出现在列表里，也不能通过本接口
 * 修改或删除（按不存在处理）；新建的来源一律写 is_simulated = 0。
 *
 * GET    /api/system/data-sources?page&pageSize&keyword&status&systemType
 * POST   /api/system/data-sources      { code, name, systemType?, description?, status?, sortNo? }
 * PUT    /api/system/data-sources      { id, ...同上可选字段 }
 * DELETE /api/system/data-sources?id=N （或在请求体中传 { id }）
 *
 * 删除前会检查引用（批次 / 产品数据 / 设备采集 / 工艺记录 / 抽检记录 /
 * 数据一致性核对）；仍有引用返回 409 与引用条数。
 */
const listQuerySchema = paginationSchema.extend({
  keyword: z.string().trim().max(64).optional(),
  status: z.enum(['enabled', 'disabled']).optional(),
  systemType: z.enum(['manual', 'mes', 'qms', 'device', 'other']).optional(),
});

export const GET = withApi(
  { name: 'GET /api/system/data-sources', permission: 'system:read' },
  async ({ request }) => {
    const query = parseQuery(request, listQuerySchema);
    return ok(
      await listDataSources({
        page: query.page,
        pageSize: query.pageSize,
        keyword: query.keyword,
        status: query.status,
        systemType: query.systemType,
      }),
    );
  },
);

const mutationFields = {
  code: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1).max(64).optional(),
  systemType: z.enum(['manual', 'mes', 'qms', 'device', 'other']).optional(),
  description: z.union([z.string().max(255), z.null()]).optional(),
  status: z.enum(['enabled', 'disabled']).optional(),
  sortNo: z.coerce.number().int().min(0).max(9999).optional(),
};

const createSchema = z.object({
  ...mutationFields,
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(64),
});

export const POST = withApi(
  { name: 'POST /api/system/data-sources', permission: 'system:write' },
  async ({ request, user }) => {
    const body = await safeJson(request);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw AppError.validation('请求参数校验未通过。', flattenZod(parsed.error));
    }
    const row = await createDataSource(parsed.data, { userId: user!.userId, request });
    return ok({ row }, undefined, { status: 201 });
  },
);

const updateSchema = z.object({
  ...mutationFields,
  id: z.coerce.number().int().positive(),
});

export const PUT = withApi(
  { name: 'PUT /api/system/data-sources', permission: 'system:write' },
  async ({ request, user }) => {
    const body = await safeJson(request);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      throw AppError.validation('请求参数校验未通过。', flattenZod(parsed.error));
    }
    const { id, ...fields } = parsed.data;
    const row = await updateDataSource(id, fields, { userId: user!.userId, request });
    return ok({ row });
  },
);

export const DELETE = withApi(
  { name: 'DELETE /api/system/data-sources', permission: 'system:write' },
  async ({ request, user }) => {
    const url = new URL(request.url);
    let rawId = url.searchParams.get('id');

    // 兼容「id 放在请求体」的调用方式（DELETE 带 body 在部分代理上会被丢弃，
    // 因此查询参数优先，body 仅作为兜底）
    if (!rawId) {
      const body = await safeJson(request);
      if (body.id !== undefined && body.id !== null) rawId = String(body.id);
    }

    const id = z.coerce.number().int().positive().safeParse(rawId);
    if (!id.success) {
      throw AppError.badRequest('缺少要删除的数据来源 ID（请使用 ?id= 或在请求体中传 id）。');
    }

    const result = await deleteDataSource(id.data, { userId: user!.userId, request });
    return ok(result);
  },
);
