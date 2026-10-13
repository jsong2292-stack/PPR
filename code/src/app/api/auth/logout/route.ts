import { cookies } from 'next/headers';
import { withApi, ok } from '@/lib/api';
import { getSessionUser, clearCookieOptions } from '@/lib/auth/session';
import { logout } from '@/lib/auth/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 退出登录。
 * 这里不用 withApi 的权限校验：未登录时调用也应该成功（幂等），
 * 否则前端在会话过期后点退出会拿到 401，反而需要特殊处理。
 */
export const POST = withApi(
  { name: 'POST /api/auth/logout', permission: null },
  async ({ request }) => {
    const user = await getSessionUser();
    await logout(user?.userId ?? null, request);

    const store = await cookies();
    const options = clearCookieOptions();
    store.set(options.name, '', options);

    return ok({ loggedOut: true });
  },
);
