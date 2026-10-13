'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { Sidebar, type SidebarUser } from './Sidebar';
import { UserMenu } from './UserMenu';
import { ToastProvider } from '@/components/feedback/Toast';
import { roleLabel } from '@/lib/auth/permissions';

/**
 * 工作台外框。
 *
 * 需要是客户端组件：导航折叠状态与提示消息都依赖交互。
 * 用户信息由服务端布局传入，避免前端再发一次会话请求。
 */
export function WorkspaceShell({
  user,
  children,
}: {
  user: SidebarUser & { department?: string | null };
  children: ReactNode;
}) {
  // 折叠状态唯一来源：外框持有，侧边栏只消费。收起/展开只有顶栏右上角这一个入口。
  const [collapsed, setCollapsed] = useState(false);
  const toggleCollapsed = () => setCollapsed((value) => !value);

  return (
    <ToastProvider>
      <div className="p-app" data-collapsed={collapsed ? 'true' : 'false'}>
        <Sidebar user={user} collapsed={collapsed} />
        <header className="p-header">
          <button
            type="button"
            className="u-btn u-btn--ghost u-btn--small"
            onClick={toggleCollapsed}
            title={collapsed ? '展开导航' : '收起导航'}
            aria-label={collapsed ? '展开导航' : '收起导航'}
            aria-pressed={collapsed}
          >
            ☰
          </button>
          <div className="u-small u-muted">
            内部质量管理系统 · 数据来源于 MES / QMS / 设备数采台账
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <UserMenu
              displayName={user.displayName}
              username={user.username}
              roles={user.roles.map((role) => roleLabel(role))}
            />
          </div>
        </header>
        <main className="p-main">{children}</main>
      </div>
    </ToastProvider>
  );
}
