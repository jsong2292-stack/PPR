'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  AlertTriangle, Archive, ChevronDown, ChevronLeft, ChevronRight, ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-client';
import { ADMIN_MENU_GROUPS } from '@/lib/admin-menu';

const flows = [
  { label: '质量监控与预警', href: '/quality/monitor', icon: AlertTriangle },
  // 「异常诊断与验证」不再单独挂在导航上：诊断页由预警队列的「进入诊断」按钮进入，并自动定位该事件的异常指标。
  // 「8D 报告工作台」同样不再单独挂导航：入口收敛到诊断页的「生成 8D 报告 / 进入 8D 工作台」，
  // 以及历史分析列表（点一条记录进入同一页面继续编辑）。
  { label: '历史分析', href: '/quality/history', icon: Archive },
];

export function QualityShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [backendOpen, setBackendOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const isAdmin = user?.role === 'admin';

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-slate-50">
      {/* 通栏布局：侧边栏贴靠视口最左侧，与顶部栏共用同一左侧留白（p-3 / px-3） */}
      <div className="flex w-full items-stretch">
        <aside className={cn('sticky top-14 flex h-[calc(100vh-3.5rem)] shrink-0 flex-col border-r border-slate-200 bg-white transition-all', collapsed ? 'w-[72px]' : 'w-64')}>
          {/* 侧边栏头部：只放业务导航标签与收起按钮。
              品牌 Logo / 站名已由顶部导航承担，这里不再重复品牌色块与英文名，避免上下撞版。 */}
          <div className={cn('flex h-14 shrink-0 items-center', collapsed ? 'justify-center px-2' : 'gap-2 px-3')}>
            {collapsed ? (
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                aria-label="展开业务导航"
                title="展开业务导航"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700"
              >
                <ChevronRight size={17} />
              </button>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate text-[11px] font-semibold tracking-wide text-slate-500">业务导航</span>
                <button
                  type="button"
                  onClick={() => setCollapsed(true)}
                  aria-label="收起业务导航"
                  title="收起业务导航"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                >
                  <ChevronLeft size={16} />
                </button>
              </>
            )}
          </div>

          {/* 业务导航：内容超出高度时独立滚动，不挤压底部说明 */}
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <nav className="space-y-2">
              {isAdmin && <>
                <div>
                  <button onClick={() => !collapsed && setBackendOpen((value) => !value)} title={collapsed ? '后台管理' : undefined} aria-label="后台管理" className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-50', collapsed && 'justify-center px-0')}>
                    <ShieldCheck size={18} className="shrink-0" />
                    {!collapsed && <><span className="flex-1">后台管理</span><ChevronDown size={15} className={cn('transition-transform', backendOpen ? '' : '-rotate-90')} /></>}
                  </button>
                  {!collapsed && backendOpen && <div className="ml-5 mt-1 space-y-1 border-l border-slate-200 pl-3">
                    {ADMIN_MENU_GROUPS.map((group) => {
                      const GroupIcon = group.icon;
                      const opened = Boolean(openGroups[group.key]);
                      return <div key={group.key}>
                        <button onClick={() => setOpenGroups((state) => ({ ...state, [group.key]: !state[group.key] }))} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50">
                          <GroupIcon size={15} className="shrink-0" />
                          <span className="flex-1">{group.label}</span>
                          <ChevronDown size={14} className={cn('transition-transform', opened ? '' : '-rotate-90')} />
                        </button>
                        {opened && <div className="ml-4 mt-1 space-y-1 border-l border-slate-200 pl-3">
                          {group.items.map((item) => {
                            const Icon = item.icon; const active = pathname === item.href;
                            return <Link key={item.href} href={item.href} className={cn('flex items-center gap-2 rounded-lg px-3 py-2 text-sm', active ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-600 hover:bg-slate-50')}><Icon size={15} />{item.label}</Link>;
                          })}
                        </div>}
                      </div>;
                    })}
                  </div>}
                </div>
                <div className="my-3 border-t border-slate-200" />
              </>}
              {!collapsed && <p className="px-3 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wider text-slate-400">质量闭环</p>}
              {flows.map((item) => {
                const Icon = item.icon; const active = pathname.startsWith(item.href);
                return <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined} className={cn('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm', collapsed && 'justify-center px-0', active ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-600 hover:bg-slate-50')}><Icon size={18} className="shrink-0" />{!collapsed && item.label}</Link>;
              })}
            </nav>
          </div>

          {!collapsed && <div className="shrink-0 p-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-500">
              <b className="text-slate-700">数据边界</b><br />当前规则和阈值为演示策略，不能替代正式产品标准与企业审批。
            </div>
          </div>}
        </aside>
        <section className="min-w-0 flex-1 p-5 lg:p-7">{children}</section>
      </div>
    </div>
  );
}
