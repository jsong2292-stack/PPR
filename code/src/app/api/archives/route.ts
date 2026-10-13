import { z } from 'zod';
import { withApi, ok } from '@/lib/api';
import { AppError } from '@/lib/errors';
import { paginationSchema, parseQuery } from '@/lib/validation';
import { createArchive, listArchives } from '@/lib/services/archiveService';
import { flattenZod, safeJson } from '@/lib/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = paginationSchema.extend({
  riskType: z.enum(['medium', 'high', 'error']).optional(),
  keyword: z.string().trim().max(64).optional(),
});

/** GET /api/archives —— 归档列表 */
export const GET = withApi(
  { name: 'GET /api/archives', permission: 'analysis:read' },
  async ({ request }) => {
    // 用 parseQuery 而不是 schema.parse：查询串由使用者手工拼写，
    // 非法值属于「请求不合法」（422），不应该冒泡成 500。
    const query = parseQuery(request, querySchema);
    return ok(
      await listArchives({
        page: query.page,
        pageSize: query.pageSize,
        riskType: query.riskType,
        keyword: query.keyword,
      }),
    );
  },
);

const createSchema = z.object({
  eventCode: z.string().trim().min(3).max(64),
  reportId: z.coerce.number().int().positive().nullish(),
  remark: z.string().trim().max(500).nullish(),
});

/**
 * POST /api/archives —— 归档一个事件。
 *
 * 归档会把当前结论冻结为历史记录：所有结论必须先被逐条确认或否决，
 * 存在「待确认」结论时拒绝归档（否则会把未定论的假设写进历史档案）。
 */
export const POST = withApi(
  { name: 'POST /api/archives', permission: 'analysis:archive' },
  async ({ request, user }) => {
    const body = await safeJson(request);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw AppError.validation('请求参数校验未通过。', flattenZod(parsed.error));
    }
    const result = await createArchive({
      eventCode: parsed.data.eventCode,
      reportId: parsed.data.reportId ?? null,
      remark: parsed.data.remark ?? null,
      userId: user!.userId,
      request,
    });
    return ok(result, undefined, { status: 201 });
  },
);
