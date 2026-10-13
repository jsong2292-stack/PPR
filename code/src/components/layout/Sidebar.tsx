'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { NAV_GROUPS, isNavActive } from '@/config/navigation';
import type { Permission, RoleCode } from '@/lib/auth/permissions';
import { roleLabel } from '@/lib/auth/permissions';

export interface SidebarUser {
  displayName: string;
  username: string;
  roles: RoleCode[];
  permissions: Permission[];
}

/**
 * 侧边栏导航。
 *
 * 只渲染当前账号有权限的入口；折叠状态存在组件内（刷新后恢复展开），
 * 避免为一个纯展示偏好引入持久化存储。
 */
export function Sidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => user.permissions.includes(item.permission)),
  })).filter((group) => group.items.length > 0);

  return (
    <aside className="p-sidebar" aria-label="业务导航">
      <div className="p-brand">
        <span className="p-brand__mark" aria-hidden="true" />
        <span className="p-brand__text">
          <strong>PPR Quality Copilot</strong>
          <small>过程质量智能分析</small>
        </span>
      </div>

      <nav className="p-nav">
        {groups.map((group) => (
          <div key={group.id}>
            <div className="p-nav__group-title">{group.title}</div>
            {group.items.map((item) => {
              const active = isNavActive(item.href, pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="p-nav__item"
                  aria-current={active ? 'page' : undefined}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="p-nav__icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="p-nav__text">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="p-sidebar__foot">
        <div className="u-strong">{user.displayName}</div>
        <div>{user.roles.map((role) => roleLabel(role)).join(' / ') || '未分配角色'}</div>
        <button
          type="button"
          className="u-btn u-btn--ghost u-btn--small u-mt"
          onClick={() => setCollapsed((value) => !value)}
          aria-pressed={collapsed}
        >
          {collapsed ? '展开导航' : '收起导航'}
        </button>
      </div>
    </aside>
  );
}
