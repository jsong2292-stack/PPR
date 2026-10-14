'use client';

import { useEffect, useRef } from 'react';
import {
  AlertTriangle, Bot, CheckCircle2, ChevronDown, ChevronUp,
  CircleDot, Database, Loader2, Save, Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

export type AnalysisProcessEvent = {
  stage: 'preparing' | 'model' | 'tool' | 'validation' | 'rule' | 'fallback' | 'persistence' | 'complete';
  status: 'running' | 'success' | 'warning' | 'error';
  message: string;
  detail?: string;
  tool?: string;
  timestamp: string;
};

const stageIcons = {
  preparing: CircleDot,
  model: Bot,
  tool: Wrench,
  validation: CheckCircle2,
  rule: Database,
  fallback: AlertTriangle,
  persistence: Save,
  complete: CheckCircle2,
};

const statusStyles = {
  running: {
    icon: 'bg-indigo-50 text-indigo-600',
    text: 'text-indigo-700',
    badge: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  },
  success: {
    icon: 'bg-emerald-50 text-emerald-600',
    text: 'text-emerald-700',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  warning: {
    icon: 'bg-amber-50 text-amber-600',
    text: 'text-amber-700',
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  error: {
    icon: 'bg-red-50 text-red-600',
    text: 'text-red-700',
    badge: 'border-red-200 bg-red-50 text-red-700',
  },
};

export function AnalysisProcessPanel({
  events,
  expanded,
  generating,
  finished,
  onToggle,
  title = '分析过程 · 工具与证据轨迹',
  runningLabel = '生成中',
}: {
  events: AnalysisProcessEvent[];
  expanded: boolean;
  generating: boolean;
  finished: boolean;
  onToggle: () => void;
  /** 面板标题：诊断分析与 8D 生成共用本组件，用标题区分两次运行。 */
  title?: string;
  runningLabel?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (expanded) listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [events, expanded]);

  if (!events.length && !generating) return null;
  const hasError = events.some((event) => event.status === 'error');
  const hasWarning = events.some((event) => event.status === 'warning');
  const summaryStatus = generating ? 'running' : hasError ? 'error' : hasWarning ? 'warning' : 'success';
  const summaryStyle = statusStyles[summaryStatus];
  const summaryLabel = generating ? runningLabel : hasError ? '执行失败' : hasWarning ? '已完成（含降级）' : finished ? '已完成' : '等待中';

  return <Card className="mb-5 overflow-hidden border-slate-200 bg-white shadow-sm">
    <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-slate-50">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${summaryStyle.icon}`}>
          {generating ? <Loader2 size={18} className="animate-spin" /> : hasError ? <AlertTriangle size={18} /> : <Bot size={18} />}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-sm text-slate-900">{title}</b>
            <Badge variant="outline" className={summaryStyle.badge}>{summaryLabel}</Badge>
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {expanded ? '展示可审计步骤，不展示模型内部隐式思维链' : `${events.length} 个步骤 · 点击展开查看`}
          </p>
        </div>
      </div>
      {expanded ? <ChevronUp size={17} className="shrink-0 text-slate-400" /> : <ChevronDown size={17} className="shrink-0 text-slate-400" />}
    </button>

    <div className={`transition-[max-height,opacity] duration-500 ease-in-out ${expanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
      <CardContent className="border-t border-slate-200 bg-slate-50/70 p-0">
        <div ref={listRef} className="max-h-80 space-y-0 overflow-y-auto px-4 py-3 text-xs">
          {events.map((event, index) => {
            const Icon = stageIcons[event.stage] || CircleDot;
            const style = statusStyles[event.status];
            return <div key={`${event.timestamp}-${index}`} className="grid grid-cols-[64px_24px_minmax(0,1fr)] gap-2 border-l border-slate-200 py-2.5 pl-3">
              <time className="font-mono text-slate-400">{new Date(event.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}</time>
              <span className={`grid h-5 w-5 place-items-center rounded-md ${style.icon}`}><Icon size={12} /></span>
              <div className="min-w-0">
                <p className={`font-medium ${style.text}`}>{event.message}</p>
                {event.detail && <p className="mt-1 break-words font-mono leading-5 text-slate-500">{event.detail}</p>}
              </div>
            </div>;
          })}
          {generating && <div className="flex items-center gap-2 py-2.5 pl-[94px] text-indigo-600"><span className="h-3 w-1.5 animate-pulse rounded-sm bg-indigo-500" /><span>等待下一步输出</span></div>}
        </div>
      </CardContent>
    </div>
  </Card>;
}
