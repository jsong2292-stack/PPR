import { z } from 'zod';
import { withApi, ok } from '@/lib/api';
import { AppError } from '@/lib/errors';
import { paginationSchema, parseQuery } from '@/lib/validation';
import { listAlertEvents } from '@/lib/repositories/alertEventRepository';
import { flattenZod, safeJson } from '@/lib/route-helpers';
import { updateHandlingStatus } from '@/lib/repositories/alertEventRepository';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = paginationSchema.extend({
  batchNo: z.string().trim().max(64).optional(),
  riskType: z.enum(['medium', 'high', 'error']).optional(),
  handlingStatus: z
    .enum(['pending', 'processing', 'verified', 'closed', 'ignored'])
    .optional(),
  keyword: z.string().trim().max(64).optional(),
  openOnly: z.coerce.boolean().optional(),
});

/** GET /api/events —— 预警事件列表（监控与诊断入口共用） */
export const GET = withApi(
  { name: 'GET /api/events', permission: 'monitor:read' },
  async ({ request }) => {
    // 用 parseQuery 而不是 schema.parse：查询串由使用者手工拼写，
    // 非法值属于「请求不合法」（422），不应该冒泡成 500。
    const query = parseQuery(request, querySchema);
    const result = await listAlertEvents({
      page: query.page,
      pageSize: query.pageSize,
      batchNo: query.batchNo,
      riskType: query.riskType,
      handlingStatus: query.handlingStatus,
      keyword: query.keyword,
      openOnly: query.openOnly,
    });
    return ok(result);
  },
);

const handleSchema = z.object({
  eventCode: z.string().trim().min(3).max(64),
  status: z.enum(['pending', 'processing', 'verified', 'closed', 'ignored']),
  note: z.string().trim().max(500).nullish(),
});

/**
 * PATCH /api/events —— 更新事件的处置状态。
 *
 * 处置状态是事件生命周期的唯一入口（待处理 → 处理中 → 已验证 → 已闭环 / 已忽略），
 * 因此每次变更都必须留痕：谁、什么时候、因为什么改了状态。
 */
export const PATCH = withApi(
  { name: 'PATCH /api/events', permission: 'monitor:read' },
  async ({ request, user }) => {
    const body = await safeJson(request);
    const parsed = handleSchema.safeParse(body);
    if (!parsed.success) {
      throw AppError.validation('请求参数校验未通过。', flattenZod(parsed.error));
    }

    const { findAlertEventByCode } = await import('@/lib/repositories/alertEventRepository');
    const event = await findAlertEventByCode(parsed.data.eventCode);
    if (!event) throw AppError.notFound('预警事件不存在。');

    if (parsed.data.status === 'closed' && !String(parsed.data.note ?? '').trim()) {
      throw AppError.validation('关闭事件必须填写处置说明。', {
        note: '请填写处置说明后再闭环',
      });
    }

    await updateHandlingStatus({
      eventId: event.id,
      status: parsed.data.status,
      note: parsed.data.note ?? null,
      handlerUserId: user!.userId,
    });

    await writeAudit({
      user: { userId: user!.userId },
      module: 'quality_monitor',
      action: 'handle_event',
      targetType: 'alert_event',
      targetId: event.id,
      detail: `事件 ${event.code} 处置状态变更为「${parsed.data.status}」${
        parsed.data.note ? `：${parsed.data.note}` : ''
      }`,
      request,
    });

    return ok({ updated: true });
  },
);
