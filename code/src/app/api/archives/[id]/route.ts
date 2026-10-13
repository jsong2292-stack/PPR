import { withApi, ok } from '@/lib/api';
import { AppError } from '@/lib/errors';
import { parseId } from '@/lib/validation';
import { loadArchive } from '@/lib/services/archiveService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/archives/:id —— 归档详情（冻结结论快照） */
export const GET = withApi<{ id: string }>(
  { name: 'GET /api/archives/:id', permission: 'analysis:read' },
  async ({ params }) => {
    const id = parseId(params.id, '归档 ID');
    const archive = await loadArchive(id);
    if (!archive) throw AppError.notFound('归档记录不存在。');
    return ok(archive);
  },
);
