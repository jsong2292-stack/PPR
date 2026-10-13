import { withApi, ok } from '@/lib/api';
import { AppError } from '@/lib/errors';
import { parseId } from '@/lib/validation';
import { loadNotification } from '@/lib/services/archiveService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/notifications/:id —— 通知详情（含各收件人投递状态） */
export const GET = withApi<{ id: string }>(
  { name: 'GET /api/notifications/:id', permission: 'notification:read' },
  async ({ params }) => {
    const id = parseId(params.id, '通知 ID');
    const notification = await loadNotification(id);
    if (!notification) throw AppError.notFound('通知记录不存在。');
    return ok(notification);
  },
);
