import { z } from 'zod';
import { withApi, ok } from '@/lib/api';
import { paginationSchema, parseQuery } from '@/lib/validation';
import { listAuditFacets, listOperationLogs } from '@/lib/services/systemService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 操作日志（审计）接口 —— 只读。
 *
 * GET /api/system/audit?page&pageSize&module&actionType&keyword&from&to
 *   · module     模块（operation_log.module 的实际取值，如 system / auth / diagnosis）
 *   · actionType 动作（operation_log.action_type，如 create / update / delete / engineer_decision）
 *   · keyword    关键字，匹配 detail / target_type / target_id / 模块 / 动作 / 操作人
 *   · from,to    日期范围（YYYY-MM-DD，含当天首尾时刻）
 *
 * 响应同时返回 facets（实际出现过的模块与动作），供页面渲染过滤下拉，
 * 避免把枚举写死在前端而与库里的取值脱节。
 * 本接口不提供任何写入能力：审计日志只能由业务操作产生，不允许人工修改或删除。
 */
const querySchema = paginationSchema.extend({
  module: z.string().trim().max(64).optional(),
  actionType: z.string().trim().max(32).optional(),
  keyword: z.string().trim().max(64).optional(),
  from: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '开始日期格式应为 YYYY-MM-DD')
    .optional(),
  to: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '结束日期格式应为 YYYY-MM-DD')
    .optional(),
});

export const GET = withApi(
  { name: 'GET /api/system/audit', permission: 'system:read' },
  async ({ request }) => {
    const query = parseQuery(request, querySchema);
    const [result, facets] = await Promise.all([
      listOperationLogs({
        page: query.page,
        pageSize: query.pageSize,
        module: query.module,
        actionType: query.actionType,
        keyword: query.keyword,
        from: query.from,
        to: query.to,
      }),
      listAuditFacets(),
    ]);
    return ok({ ...result, facets });
  },
);
