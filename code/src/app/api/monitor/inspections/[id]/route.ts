import { z } from 'zod';
import { withApi, ok } from '@/lib/api';
import { parseId } from '@/lib/validation';
import { loadInspectionDetail } from '@/lib/services/monitorService';
import { AppError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ id: z.string() });

/**
 * 抽检记录详情（监控页右侧面板）。
 *
 * 返回：记录本身（含各指标值，缺失指标为 null）、该规格的限值、由该记录触发的事件。
 */
export const GET = withApi<{ id: string }>(
  { name: 'GET /api/monitor/inspections/:id', permission: 'monitor:read' },
  async ({ params }) => {
    const id = parseId(params.id, '抽检记录 ID');
    const detail = await loadInspectionDetail(id);
    if (!detail) throw AppError.notFound('抽检记录不存在。');
    return ok(detail);
  },
);
