import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getSessionUser } from '@/lib/auth/session';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: '登录' };

/**
 * 登录页（服务端壳）。
 *
 * 已登录用户直接跳转到默认工作台，避免重复登录。
 * 首登未改密的账号会被带到改密页。
 */
export default async function LoginPage() {
  const user = await getSessionUser({ allowPasswordResetPending: true });
  if (user) {
    redirect(user.passwordChanged ? '/monitor' : '/account/password');
  }

  return (
    <div className="p-login">
      <div className="p-login__card">
        <div className="u-row u-mb">
          <span className="p-brand__mark" aria-hidden="true" />
          <div>
            <h1 className="p-login__title">PPR 质量智能分析助手</h1>
            <p className="p-login__sub">过程质量异常预警 · 结构化诊断 · 8D 闭环</p>
          </div>
        </div>

        <LoginForm />

        <p className="u-xs u-faint u-mt">
          账号由系统管理员创建；首次登录后必须修改初始密码。
          如忘记密码，请联系管理员重置。
        </p>
      </div>
    </div>
  );
}
