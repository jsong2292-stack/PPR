'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
 * 只渲染当前账号有权限的入口；折叠状态由 WorkspaceShell 统一持有并通过 props 下发。
 * 收起/展开只保留顶栏右上角那一个图标入口，侧边栏不再重复放一个按钮。
 * `collapsed` 仅用于在收窄成图标条时给导航项补 title 提示。
 */
export function Sidebar({ user, collapsed }: { user: SidebarUser; collapsed: boolean }) {
  const pathname = usePathname();

  const roleText = user.roles.map((role) => roleLabel(role)).join(' / ');
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => user.permissions.includes(item.permission)),
  })).filter((group) => group.items.length > 0);

  // 默认管理员的名字与角色名同为「系统管理员」，直接平铺会打成两遍一样的字，
  // 因此在两者相同时改显账号名，保证第二行总有新信息。
  const secondary = roleText && roleText !== user.displayName ? roleText : `@${user.username}`;
  const initial = (user.displayName.trim() || user.username).slice(0, 1).toUpperCase();

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
        <div className="p-userbar">
          <span className="p-userbar__avatar" aria-hidden="true">
            {initial}
          </span>
          <span className="p-userbar__meta">
            <span className="p-userbar__name">{user.displayName}</span>
            <span className="p-userbar__role">{secondary}</span>
          </span>
        </div>
      </div>
    </aside>
  );
}
