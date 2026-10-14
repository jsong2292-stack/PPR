'use client';

import { Bot, Loader2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AnalysisProcessPanel, type AnalysisProcessEvent } from './AnalysisProcessPanel';

type Row = Record<string, unknown>;

export const eightDSections: Record<string, string> = {
  d1: '组建团队', d2: '问题描述', d3: '临时围堵措施', d4: '根因分析与验证',
  d5: '永久纠正措施选择', d6: '永久纠正措施实施与验证', d7: '预防再发生', d8: '团队表彰与结案',
};

function asArray(value: unknown) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  return [];
}

/**
 * 8D 生成区的展示组件：状态、生成按钮与实时过程轨迹。
 * 生成逻辑（含 SSE 消费、自动开始、结果写回）由报告页持有，
 * 这样报告页能在生成过程中展示 D1–D8 骨架、生成结束后直接切到可编辑的正文。
 */
export function EightDGeneratePanel({
  report,
  generating,
  events,
  expanded,
  finished,
  onGenerate,
  onToggle,
}: {
  report: Row | null;
  generating: boolean;
  events: AnalysisProcessEvent[];
  expanded: boolean;
  finished: boolean;
  onGenerate: () => void;
  onToggle: () => void;
}) {
  const finalized = String(report?.status || '') === 'finalized';
  const engine = String(report?.generation_engine || '');
  const toolRuns = asArray(report?.tool_trace_json).length;

  return <>
    <Card className="mb-5 border-indigo-200 bg-indigo-50/50 shadow-sm">
      <CardHeader className="border-b border-indigo-100 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Bot size={17} />生成 8D 报告</CardTitle>
            <p className="mt-1 text-xs text-slate-600">8D Agent 的输入为：诊断分析摘要、诊断页引用的限值对照与批次/设备趋势数据、结论卡片，以及工程师填写的实际发现与工程师意见。生成过程实时打印，产出 D1–D8 结构化草稿。</p>
          </div>
          {report ? <Badge className={engine === 'agent' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}>
            {engine === 'agent' ? 'LangChain Agent 生成' : engine === 'rule' ? '规则模板生成' : '已有草稿'}
          </Badge> : <Badge variant="outline">尚无草稿</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {report ? <div className="grid gap-3 rounded-xl border border-indigo-100 bg-white p-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div><span className="text-slate-500">报告编号</span><b className="mt-0.5 block font-mono text-slate-900">{String(report.report_no || '—')}</b></div>
          <div><span className="text-slate-500">生成模型</span><b className="mt-0.5 block text-slate-900">{String(report.model_name || '规则模板（不调用模型）')}</b></div>
          <div><span className="text-slate-500">生成时间 / 耗时</span><b className="mt-0.5 block text-slate-900">{report.generated_at ? String(report.generated_at) : '—'}{report.latency_ms ? ` · ${String(report.latency_ms)} ms` : ''}</b></div>
          <div><span className="text-slate-500">证据轨迹</span><b className="mt-0.5 block text-slate-900">{toolRuns ? `${toolRuns} 次工具调用` : '规则模板无工具轨迹'}</b></div>
        </div> : <p className="text-xs text-slate-600">尚无 8D 报告草稿。生成前请先回到诊断页填写实际发现与工程师意见并完成确认或否决，Agent 会据此区分「已确认根因 / 已排除项 / 仍待验证假设」。</p>}

        {report?.fallback_reason ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><b>降级说明：</b>{String(report.fallback_reason)}</div> : null}
        {finalized ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">报告已归档，为保证归档留痕不提供重新生成；仍可直接编辑下方 D1–D8 并点「保存修改」同步到历史分析。</div> : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={onGenerate} disabled={generating || finalized} className="bg-indigo-600 hover:bg-indigo-700">
            {generating ? <Loader2 className="animate-spin" size={16} /> : report ? <RefreshCw size={16} /> : <Bot size={16} />}
            {report ? '重新生成 8D 报告' : '生成 8D 报告'}
          </Button>
          <span className="text-xs text-slate-500">{report ? '重新生成会覆盖 D1–D8 草稿内容；已归档报告改为手工编辑后保存修改。' : '生成后会写入报告草稿，并保留模型、提示词版本与工具证据轨迹。'}</span>
        </div>
      </CardContent>
    </Card>

    <AnalysisProcessPanel
      title="8D 生成过程 · 工具与证据轨迹"
      runningLabel="生成中"
      events={events}
      expanded={expanded}
      generating={generating}
      finished={finished}
      onToggle={onToggle}
    />
  </>;
}
