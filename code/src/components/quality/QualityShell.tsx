'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  Activity, AlertTriangle, Archive, Boxes, ChevronDown, ChevronLeft, ChevronRight,
  ClipboardCheck, Database, Factory, Gauge, ListChecks, PackageSearch, Settings2, Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const groups = [
  {
    label: '系统管理', icon: Settings2,
    items: [
      { label: '产品类别', href: '/quality/data/categories', icon: Boxes },
      { label: '产品规格', href: '/quality/data/specs', icon: PackageSearch },
      { label: '设备类型', href: '/quality/data/equipment-types', icon: Wrench },
      { label: '设备台账', href: '/quality/data/equipment', icon: Factory },
    ],
  },
  {
    label: '数据源管理', icon: Database,
    items: [
      { label: '批次基础信息', href: '/quality/data/batches', icon: ListChecks },
      { label: '质量指标与影响因素', href: '/quality/data/metrics', icon: Gauge },
      { label: '产品数据', href: '/quality/data/measurements', icon: ClipboardCheck },
      { label: '设备采集数据', href: '/quality/data/readings', icon: Activity },
    ],
  },
];

const flows = [
  { label: '质量监控与预警', href: '/quality/monitor', icon: AlertTriangle },
  { label: '异常诊断与验证', href: '/quality/diagnosis', icon: Gauge },
  { label: '8D 报告工作台', href: '/quality/report', icon: ClipboardCheck },
  { label: '历史分析', href: '/quality/history', icon: Archive },
];

export function QualityShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ 系统管理: true, 数据源管理: true });

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-5 py-3">
        <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-700 text-xs text-white">PPR</span>
              过程质量异常智能分析助手
            </div>
            <p className="mt-0.5 text-xs text-slate-500">平台数据为本地演示数据；分析结论需由工程师验证确认</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
            数据全流程：主数据 → 监控预警 → 诊断验证 → 8D → 归档
          </div>
        </div>
      </div>
      <div className="mx-auto flex max-w-[1680px] items-stretch">
        <aside className={cn('sticky top-16 h-[calc(100vh-4rem)] shrink-0 border-r border-slate-200 bg-white transition-all', collapsed ? 'w-[72px]' : 'w-64')}>
          <div className="flex h-full flex-col p-3">
            <button className="mb-3 ml-auto grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" onClick={() => setCollapsed((value) => !value)} aria-label="收起或展开业务导航">
              {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
            </button>
            <nav className="space-y-2">
              {groups.map((group) => {
                const GroupIcon = group.icon;
                const opened = openGroups[group.label];
                return <div key={group.label}>
                  <button onClick={() => !collapsed && setOpenGroups((state) => ({ ...state, [group.label]: !state[group.label] }))} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-50">
                    <GroupIcon size={18} className="shrink-0" />
                    {!collapsed && <><span className="flex-1">{group.label}</span><ChevronDown size={15} className={cn('transition-transform', opened ? '' : '-rotate-90')} /></>}
                  </button>
                  {!collapsed && opened && <div className="ml-5 mt-1 space-y-1 border-l border-slate-200 pl-3">
                    {group.items.map((item) => {
                      const Icon = item.icon; const active = pathname === item.href;
                      return <Link key={item.href} href={item.href} className={cn('flex items-center gap-2 rounded-lg px-3 py-2 text-sm', active ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-600 hover:bg-slate-50')}><Icon size={15} />{item.label}</Link>;
                    })}
                  </div>}
                </div>;
              })}
              <div className="my-3 border-t border-slate-200" />
              {flows.map((item) => {
                const Icon = item.icon; const active = pathname.startsWith(item.href);
                return <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined} className={cn('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm', active ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-600 hover:bg-slate-50')}><Icon size={18} className="shrink-0" />{!collapsed && item.label}</Link>;
              })}
            </nav>
            {!collapsed && <div className="mt-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-500">
              <b className="text-slate-700">数据边界</b><br />当前规则和阈值为演示策略，不能替代正式产品标准与企业审批。
            </div>}
          </div>
        </aside>
        <section className="min-w-0 flex-1 p-5 lg:p-7">{children}</section>
      </div>
    </div>
  );
}
