import { z } from 'zod';
import { cookies } from 'next/headers';
import { withApi, ok } from '@/lib/api';
import { parseBody } from '@/lib/validation';
import { getSessionUser } from '@/lib/auth/session';
import { changeOwnPassword, validatePasswordStrength } from '@/lib/auth/service';
import { AppError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  currentPassword: z.string().max(128).default(''),
  newPassword: z.string().min(1, '请输入新密码').max(128),
});

/**
 * 修改自己的密码。
 * allowPasswordResetPending：首登强制改密时必须放行，否则用户永远无法改密。
 */
export const POST = withApi(
  { name: 'POST /api/auth/change-password', permission: null, allowPasswordResetPending: true },
  async ({ request }) => {
    const user = await getSessionUser({ allowPasswordResetPending: true });
    if (!user) throw AppError.unauthorized();

    const body = await parseBody(request, schema);

    const strengthError = validatePasswordStrength(body.newPassword);
    if (strengthError) {
      throw AppError.validation('新密码强度不足。', { newPassword: strengthError });
    }

    const result = await changeOwnPassword({
      userId: user.userId,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
      request,
    });

    const store = await cookies();
    store.set(result.cookie.name, result.token, result.cookie);

    return ok({ changed: true });
  },
);
