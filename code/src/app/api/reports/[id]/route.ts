import { withApi, ok } from '@/lib/api';
import { AppError } from '@/lib/errors';
import { parseId } from '@/lib/validation';
import { loadReport, recordReportExport } from '@/lib/services/reportService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/reports/:id —— 报告详情（含 D1–D8、已确认结论、版本记录） */
export const GET = withApi<{ id: string }>(
  { name: 'GET /api/reports/:id', permission: 'report:read' },
  async ({ params }) => {
    const id = parseId(params.id, '报告 ID');
    const detail = await loadReport(id);
    if (!detail) throw AppError.notFound('8D 报告不存在。');
    return ok(detail);
  },
);

/**
 * POST /api/reports/:id —— 记录一次导出/打印动作。
 *
 * 导出不复用 POST /api/reports 的 action 语义：它是「读取 + 留痕」，
 * 不修改报告内容，因此单独一个端点更清晰。
 */
export const POST = withApi<{ id: string }>(
  { name: 'POST /api/reports/:id', permission: 'report:read' },
  async ({ params, user }) => {
    const id = parseId(params.id, '报告 ID');
    return ok(await recordReportExport(id, user!.userId));
  },
);
