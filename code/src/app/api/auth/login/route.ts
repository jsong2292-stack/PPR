import { z } from 'zod';
import { withApi, ok } from '@/lib/api';
import { parseBody } from '@/lib/validation';
import { login } from '@/lib/auth/service';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  username: z.string().trim().min(1, '请输入账号').max(64),
  password: z.string().min(1, '请输入密码').max(128),
});

export const POST = withApi(
  { name: 'POST /api/auth/login', permission: null },
  async ({ request }) => {
    const body = await parseBody(request, schema);
    const result = await login(body.username, body.password, request);

    const store = await cookies();
    store.set(result.cookie.name, result.token, result.cookie);

    return ok({
      user: {
        userId: result.user.userId,
        username: result.user.username,
        displayName: result.user.displayName,
        roles: result.user.roles,
        permissions: result.user.permissions,
      },
      mustResetPassword: result.mustResetPassword,
    });
  },
);
