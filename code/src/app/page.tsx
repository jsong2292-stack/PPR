import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';

/** 入口页：已登录进工作台，未登录进登录页 */
export default async function HomePage() {
  const user = await getSessionUser({ allowPasswordResetPending: true });
  if (!user) redirect('/login');
  if (user.permissions.length === 0) redirect('/no-permission');
  redirect('/monitor');
}
