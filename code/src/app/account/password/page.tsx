import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getSessionUser } from '@/lib/auth/session';
import { ToastProvider } from '@/components/feedback/Toast';
import { ChangePasswordForm } from './ChangePasswordForm';

export const metadata: Metadata = { title: '修改密码' };

/**
 * 修改密码页。
 *
 * 刻意放在工作台布局之外：首登强制改密时，该账号不应该看到任何业务导航，
 * 也就不会出现「能读到数据但没改密」的空档。
 */
export default async function ChangePasswordPage() {
  const user = await getSessionUser({ allowPasswordResetPending: true });
  if (!user) redirect('/login');

  return (
    <ToastProvider>
      <div className="p-login">
        <div className="p-login__card">
          <h1 className="p-login__title">
            {user.passwordChanged ? '修改登录密码' : '请设置新的登录密码'}
          </h1>
          <p className="p-login__sub">
            {user.passwordChanged
              ? '修改成功后，该账号在其他设备上的登录会话会立即失效。'
              : '当前使用的是管理员分配的初始密码，必须先修改后才能进入工作台。'}
          </p>
          <ChangePasswordForm requireCurrent={user.passwordChanged} />
        </div>
      </div>
    </ToastProvider>
  );
}
