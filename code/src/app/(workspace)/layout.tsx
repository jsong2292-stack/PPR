import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getSessionUser } from '@/lib/auth/session';
import { WorkspaceShell } from '@/components/layout/WorkspaceShell';

/**
 * 工作台布局（服务端）。
 *
 * 在这里统一做登录校验：所有子页面都受保护，页面内部只需关注业务。
 * 首登未改密的账号会被强制带到修改密码页 —— 这比在每个页面里判断要可靠。
 */
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser({ allowPasswordResetPending: true });

  if (!user) redirect('/login');
  if (!user.passwordChanged && user.permissions.length === 0) {
    // 没有任何权限的账号（角色被清空）没有可用页面，给出明确提示页
    redirect('/no-permission');
  }

  return (
    <WorkspaceShell
      user={{
        displayName: user.displayName,
        username: user.username,
        roles: user.roles,
        permissions: user.permissions,
      }}
    >
      {children}
    </WorkspaceShell>
  );
}
