import { withApi, ok } from '@/lib/api';
import { getSessionUser } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 当前登录会话。
 *
 * 返回 null 而不是 401：前端用它决定「显示登录页」还是「显示工作台」，
 * 未登录是正常状态，不应记为错误。
 */
export const GET = withApi(
  { name: 'GET /api/auth/session', permission: null },
  async () => {
    const user = await getSessionUser({ allowPasswordResetPending: true });
    if (!user) return ok({ user: null });

    return ok({
      user: {
        userId: user.userId,
        username: user.username,
        displayName: user.displayName,
        roles: user.roles,
        permissions: user.permissions,
      },
    });
  },
);
