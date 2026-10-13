import { z } from 'zod';
import { withApi, ok } from '@/lib/api';
import { AppError } from '@/lib/errors';
import { paginationSchema, parseQuery } from '@/lib/validation';
import { dispatchNotification, listNotifications } from '@/lib/services/archiveService';
import { flattenZod, safeJson } from '@/lib/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = paginationSchema.extend({
  status: z.enum(['pending', 'sent', 'failed', 'simulated', 'cancelled']).optional(),
  keyword: z.string().trim().max(64).optional(),
});

/** GET /api/notifications —— 通知记录 */
export const GET = withApi(
  { name: 'GET /api/notifications', permission: 'notification:read' },
  async ({ request }) => {
    // 用 parseQuery 而不是 schema.parse：查询串由使用者手工拼写，
    // 非法值属于「请求不合法」（422），不应该冒泡成 500。
    const query = parseQuery(request, querySchema);
    return ok(
      await listNotifications({
        page: query.page,
        pageSize: query.pageSize,
        status: query.status,
        keyword: query.keyword,
      }),
    );
  },
);

const sendSchema = z.object({
  eventCode: z.string().trim().min(3).max(64),
  recipientUserIds: z.array(z.coerce.number().int().positive()).max(50).optional(),
});

/** POST /api/notifications —— 生成并投递一次预警通知 */
export const POST = withApi(
  { name: 'POST /api/notifications', permission: 'notification:send' },
  async ({ request, user }) => {
    const body = await safeJson(request);
    const parsed = sendSchema.safeParse(body);
    if (!parsed.success) {
      throw AppError.validation('请求参数校验未通过。', flattenZod(parsed.error));
    }
    const result = await dispatchNotification({
      eventCode: parsed.data.eventCode,
      recipientUserIds: parsed.data.recipientUserIds,
      triggerMode: 'manual',
      userId: user!.userId,
      request,
    });
    return ok(result, undefined, { status: 201 });
  },
);
