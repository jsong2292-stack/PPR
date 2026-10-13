'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  AlertTriangle, Archive, ChevronLeft, ChevronRight, ClipboardCheck, Gauge,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const flows = [
  { label: '质量监控与预警', href: '/quality/monitor', icon: AlertTriangle },
  { label: '异常诊断与验证', href: '/quality/diagnosis', icon: Gauge },
  { label: '8D 报告工作台', href: '/quality/report', icon: ClipboardCheck },
  { label: '历史分析', href: '/quality/history', icon: Archive },
];

export function QualityShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="mx-auto flex max-w-[1680px] items-stretch">
        <aside className={cn('sticky top-16 h-[calc(100vh-4rem)] shrink-0 border-r border-slate-200 bg-white transition-all', collapsed ? 'w-[72px]' : 'w-64')}>
          <div className="flex h-full flex-col p-3">
            <button className="mb-3 ml-auto grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" onClick={() => setCollapsed((value) => !value)} aria-label="收起或展开业务导航">
              {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
            </button>
            <nav className="space-y-2">
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
