import { z } from 'zod';
import { withApi, ok } from '@/lib/api';
import { AppError } from '@/lib/errors';
import { paginationSchema } from '@/lib/validation';
import {
  createReportFromEvent,
  listReports,
  saveReportDraft,
  finalizeReport,
  reopenReport,
} from '@/lib/services/reportService';
import { flattenZod, safeJson } from '@/lib/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = paginationSchema.extend({
  status: z.enum(['draft', 'finalized']).optional(),
  keyword: z.string().trim().max(64).optional(),
});

/** GET /api/reports —— 8D 报告列表 */
export const GET = withApi(
  { name: 'GET /api/reports', permission: 'report:read' },
  async ({ request }) => {
    const url = new URL(request.url);
    const query = querySchema.parse(Object.fromEntries(url.searchParams));
    const result = await listReports({
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      keyword: query.keyword,
    });
    return ok(result);
  },
);

const createSchema = z.object({ eventCode: z.string().trim().min(3).max(64) });
const saveSchema = z.object({
  reportId: z.coerce.number().int().positive(),
  fields: z
    .array(z.object({ code: z.string().trim().min(2).max(2), content: z.string().max(20000) }))
    .max(8),
  reviewerNote: z.string().trim().max(500).nullish(),
});
const actionSchema = z.object({
  reportId: z.coerce.number().int().positive(),
  action: z.enum(['finalize', 'reopen']),
  reviewerNote: z.string().trim().max(500).nullish(),
  reason: z.string().trim().max(500).optional(),
});

/**
 * POST /api/reports —— 8D 报告写操作。
 *
 * 用 action 字段区分三种动作（生成 / 保存草稿 / 定稿或重新打开），
 * 比把三种语义塞进 REST 动名词路径更好读，也便于统一鉴权与留痕。
 */
export const POST = withApi(
  { name: 'POST /api/reports', permission: 'report:write' },
  async ({ request, user }) => {
    const body = await safeJson(request);

    // 生成报告
    if (typeof body.eventCode === 'string' && body.action === undefined && body.reportId === undefined) {
      const parsed = createSchema.safeParse(body);
      if (!parsed.success) {
        throw AppError.validation('请求参数校验未通过。', flattenZod(parsed.error));
      }
      const result = await createReportFromEvent({
        eventCode: parsed.data.eventCode,
        userId: user!.userId,
        request,
      });
      return ok(result, undefined, { status: result.created ? 201 : 200 });
    }

    // 定稿 / 重新打开
    if (body.action !== undefined) {
      const parsed = actionSchema.safeParse(body);
      if (!parsed.success) {
        throw AppError.validation('请求参数校验未通过。', flattenZod(parsed.error));
      }
      if (parsed.data.action === 'finalize') {
        if (!user!.permissions.includes('report:finalize')) {
          throw AppError.forbidden('当前角色没有 8D 报告定稿权限（report:finalize）。');
        }
        const result = await finalizeReport({
          reportId: parsed.data.reportId,
          reviewerNote: parsed.data.reviewerNote ?? null,
          userId: user!.userId,
          request,
        });
        return ok(result);
      }
      const result = await reopenReport({
        reportId: parsed.data.reportId,
        reason: parsed.data.reason ?? '',
        userId: user!.userId,
        request,
      });
      return ok(result);
    }

    // 保存草稿
    const parsed = saveSchema.safeParse(body);
    if (!parsed.success) {
      throw AppError.validation('请求参数校验未通过。', flattenZod(parsed.error));
    }
    const report = await saveReportDraft({
      reportId: parsed.data.reportId,
      fields: parsed.data.fields,
      reviewerNote: parsed.data.reviewerNote ?? null,
      userId: user!.userId,
      request,
    });
    return ok({ report });
  },
);
