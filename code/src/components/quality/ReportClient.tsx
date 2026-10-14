'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Download, FileText, Loader2, Printer, Save, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { streamQualityRequest } from '@/lib/quality-analysis/stream-client';
import type { AnalysisProgressEvent, EightDDraftEvent } from '@/lib/quality-analysis/types';
import { EightDGeneratePanel, eightDSections } from './EightDGeneratePanel';
import { PageHeader } from './PageHeader';

type Row = Record<string, unknown>;
type GenerationMeta = { engineType?: string; modelName?: string | null; fallbackReason?: string | null; latencyMs?: number };

/**
 * 8D 报告工作台：生成与编辑都在本页完成。
 * 从诊断页点「生成 8D 报告」会带 ?generate=1 跳进来，本页自动发起生成并实时展示过程；
 * 生成期间 D1–D8 会按模型真实产出逐字段流式写入输入框，不需要等整份报告生成完。
 */
export function ReportClient() {
  const search = useSearchParams();
  const router = useRouter();
  const analysisId = Number(search.get('analysisId'));
  /** generate=1 只在进入时读一次：避免 router.replace 清理参数后重复触发。 */
  const autoGenerate = useRef(search.get('generate') === '1');
  const autoStarted = useRef(false);

  const [report, setReport] = useState<Row | null>(null);
  const [loading, setLoading] = useState(Boolean(analysisId));
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [events, setEvents] = useState<AnalysisProgressEvent[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [finished, setFinished] = useState(false);

  /** 流式生成中的字段文本：只在生成期间生效，生成结束后一律以落库的权威结果为准。 */
  const [liveFields, setLiveFields] = useState<Record<string, string>>({});
  const [liveActive, setLiveActive] = useState<string | null>(null);
  const pendingLive = useRef<Record<string, string>>({});
  const liveFrame = useRef<number | null>(null);
  /** 供 start 读取当前草稿而不把它放进依赖（否则会反复触发自动生成的 effect）。 */
  const reportRef = useRef<Row | null>(null);

  const setReportRow = useCallback((row: Row | null) => {
    reportRef.current = row;
    setReport(row);
  }, []);

  const applyLiveField = useCallback((event: EightDDraftEvent) => {
    pendingLive.current[event.field] = event.text;
    // 字段切换要立刻反映成「正在写这个字段」，文本本身按动画帧合并，避免高频增量导致的重渲染。
    setLiveActive((current) => (event.open ? event.field : current === event.field ? null : current));
    if (liveFrame.current !== null) return;
    liveFrame.current = window.requestAnimationFrame(() => {
      liveFrame.current = null;
      const merged = pendingLive.current;
      pendingLive.current = {};
      setLiveFields((current) => ({ ...current, ...merged }));
    });
  }, []);

  /** 只读取已有草稿：D1–D8 必须来自 8D 生成 Agent 或工程师填写，接口不再自动写入固定模板文字。 */
  const load = useCallback(async () => {
    if (!analysisId) { setLoading(false); return null; }
    setLoading(true);
    try {
      const res = await fetch(`/api/quality/reports?analysisId=${analysisId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setReportRow((json.data || null) as Row | null);
      return (json.data || null) as Row | null;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加载失败');
      return null;
    } finally {
      setLoading(false);
    }
  }, [analysisId, setReportRow]);

  const start = useCallback(async (regenerate: boolean) => {
    const existing = reportRef.current;
    setGenerating(true);
    setEvents([]);
    setFinished(false);
    setExpanded(true);
    // 重新生成时先铺上现有内容，新文本到达后逐字段覆盖，避免输入框先被清空。
    setLiveFields(existing
      ? Object.fromEntries(Object.keys(eightDSections).map((key) => [key, String(existing[key] ?? '')]))
      : {});
    setLiveActive(null);
    try {
      const result = await streamQualityRequest<{ data: Row; reused: boolean; generation?: GenerationMeta }>(
        '/api/quality/reports/generate',
        { analysisId, regenerate },
        (event) => setEvents((current) => [...current, event]),
        applyLiveField,
      );
      setReportRow(result.data);
      if (result.reused) toast.success('已复用现有 8D 报告草稿');
      else if (result.generation?.engineType === 'agent') toast.success(`Agent 已生成 8D 报告草稿${result.generation.modelName ? `（${result.generation.modelName}）` : ''}`);
      else toast.success('规则模板已生成 8D 报告草稿');
      if (result.generation?.fallbackReason) toast.warning(`已降级：${result.generation.fallbackReason}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '生成 8D 报告失败');
    } finally {
      if (liveFrame.current !== null) { window.cancelAnimationFrame(liveFrame.current); liveFrame.current = null; }
      pendingLive.current = {};
      setLiveFields({});
      setLiveActive(null);
      setGenerating(false);
      setFinished(true);
      window.setTimeout(() => setExpanded(false), 1600);
    }
  }, [analysisId, applyLiveField, setReportRow]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = await load();
      if (cancelled || !autoGenerate.current || autoStarted.current) return;
      autoStarted.current = true;
      // 清掉 URL 上的 generate=1：刷新或前进后退不应该再次触发一次真实的模型调用。
      router.replace(`/quality/report?analysisId=${analysisId}`);
      await start(Boolean(existing));
    })();
    return () => { cancelled = true; };
  }, [load, start, router, analysisId]);

  const update = (key: string, value: string) => setReportRow(report ? { ...report, [key]: value } : report);
  const save = async (finalize = false) => {
    if (!report) return;
    setSaving(true);
    try {
      const res = await fetch('/api/quality/reports', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...report, finalize }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setReportRow(json.data);
      toast.success(finalize ? '报告已定稿并归档' : '草稿已保存');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };
  const exportHtml = () => {
    if (!report) return;
    const sections = Object.entries(eightDSections).map(([key, name]) => `<section><h2>${key.toUpperCase()} · ${name}</h2><p>${String(report[key] || '').replace(/\n/g, '<br>')}</p></section>`).join('');
    const html = `<!doctype html><meta charset="utf-8"><title>${report.title}</title><style>body{font-family:Arial,'Microsoft YaHei';max-width:900px;margin:40px auto;color:#172033}h1{border-bottom:2px solid #1d4ed8;padding-bottom:16px}section{border:1px solid #ddd;margin:16px 0;padding:18px}h2{font-size:17px;color:#1d4ed8}p{line-height:1.8}</style><h1>${report.title}</h1><p>报告编号：${report.report_no}　批次：${report.batch_no}　状态：${report.status}</p>${sections}`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${report.report_no}.html`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  /** 生成期间输入框显示「已落库内容 + 流式增量」；生成结束后只显示落库内容。 */
  const liveDraft = useMemo(() => {
    if (!generating) return (report ?? {}) as Row;
    return { ...((report ?? {}) as Row), ...liveFields } as Row;
  }, [generating, report, liveFields]);
  const streamingStarted = Object.keys(liveFields).length > 0;

  if (!analysisId) return <>
    <PageHeader title="8D 报告工作台" description="从异常诊断页进入后，系统会继承已确认结论并生成报告草稿。" />
    <Card className="border-dashed"><CardContent className="grid h-72 place-items-center text-center"><div><FileText className="mx-auto mb-3 text-slate-400" /><b>请先完成异常诊断</b><p className="mt-1 text-sm text-slate-500">在诊断页面选择事件、生成分析并进入8D工作台。</p><Button asChild className="mt-4 bg-blue-700"><Link href="/quality/diagnosis">前往异常诊断</Link></Button></div></CardContent></Card>
  </>;

  if (loading) return <div className="grid h-96 place-items-center"><Loader2 className="animate-spin text-blue-700" /></div>;

  const finalized = report?.status === 'finalized';
  const missing = Object.keys(eightDSections).filter((key) => !String(report?.[key] || '').trim());
  const confirmedCount = Number(report?.confirmed_conclusion_count || 0);
  const pendingCount = Number(report?.pending_conclusion_count || 0);
  const blockers = [...missing.map((key) => `${key.toUpperCase()} 待补充`), ...(confirmedCount === 0 ? ['尚无工程师已确认结论，未经确认的假设不能作为根因结案'] : [])];
  const generatePanel = <EightDGeneratePanel
    report={report}
    generating={generating}
    events={events}
    expanded={expanded}
    finished={finished}
    onGenerate={() => start(Boolean(report))}
    onToggle={() => setExpanded((value) => !value)}
  />;

  const statusBadge = finalized
    ? <Badge className="bg-emerald-100 text-emerald-700">已定稿</Badge>
    : generating
      ? <Badge className="bg-indigo-100 text-indigo-700">生成中</Badge>
      : report ? <Badge className="bg-amber-100 text-amber-700">草稿</Badge> : <Badge className="bg-amber-100 text-amber-700">尚无草稿</Badge>;

  // 首次生成且模型还在取证阶段：还没有任何字段内容，先展示占位骨架。
  if (!report && generating && !streamingStarted) return <>
    <PageHeader title="8D 报告工作台" description="先生成 8D 草稿，再由工程师编辑、校验、定稿与归档。" actions={statusBadge} />
    {generatePanel}
    <DraftSkeleton />
  </>;

  if (!report && !generating) return <>
    <PageHeader title="8D 报告工作台" description="先生成 8D 草稿，再由工程师编辑、校验、定稿与归档。" actions={statusBadge} />
    {generatePanel}
    <Card className="border-dashed border-slate-300"><CardContent className="grid h-56 place-items-center text-center"><div><FileText className="mx-auto mb-3 text-slate-400" /><b>尚无 8D 报告草稿</b><p className="mt-1 text-sm text-slate-500">点击上方「生成 8D 报告」，或在诊断页填写实际发现与工程师意见后点「生成 8D 报告」直接跳到这里生成。</p><Button asChild variant="outline" className="mt-4"><Link href="/quality/monitor">返回质量监控选择事件</Link></Button></div></CardContent></Card>
  </>;

  // 首次生成的流式阶段：报告行还没落库，只展示标题与正在逐字写入的 D1–D8。
  if (!report) return <>
    <PageHeader title="8D 报告工作台" description="D1–D8 正在按模型产出实时写入，生成结束后本页直接切换为可编辑状态。" actions={statusBadge} />
    {generatePanel}
    <Card className="border-indigo-200 shadow-sm">
      <CardHeader className="border-b border-indigo-100 pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Sparkles size={17} className="text-indigo-600" />{String(liveDraft.title || '正在生成 8D 报告…')}</CardTitle>
        <p className="mt-1 text-xs text-slate-500">以下内容来自模型输出的实时增量，落库前还会做一次结构化校验；生成结束后以校验结果为准。</p>
      </CardHeader>
      <DraftSections values={liveDraft} disabled activeField={liveActive} />
    </Card>
  </>;

  return <>
    <PageHeader title="8D 报告工作台" description="继承诊断结论，完成工程师编辑、校验、定稿与历史归档。" actions={statusBadge} />
    {generatePanel}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="border-slate-200 shadow-sm"><CardHeader className="border-b border-slate-200"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-xl">{String(liveDraft.title || report.title)}</CardTitle><p className="mt-2 font-mono text-xs text-slate-500">{String(report.report_no)} · {String(report.event_no)}</p></div><Badge className="bg-indigo-50 text-indigo-700">{report.generation_engine === 'agent' ? 'Agent 生成草稿' : report.generation_engine === 'rule' ? '规则模板草稿' : '人工填写草稿'}</Badge></div><div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><span className="text-xs text-slate-500">产品规格</span><b className="block">{String(report.spec_name)}</b></div><div><span className="text-xs text-slate-500">生产批次</span><b className="block">{String(report.batch_no)}</b></div><div><span className="text-xs text-slate-500">异常指标</span><b className="block">{String(report.metric_code)}</b></div><div><span className="text-xs text-slate-500">风险级别</span><b className="block">{String(report.risk_level)}</b></div></div></CardHeader><DraftSections values={liveDraft} disabled={Boolean(finalized) || generating} activeField={generating ? liveActive : null} onChange={update} /></Card>
      <aside className="space-y-4"><Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-base">定稿检查</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex items-center gap-2 text-emerald-700"><CheckCircle2 size={16} />基本信息已继承</div><div className={`flex items-center gap-2 ${confirmedCount ? 'text-emerald-700' : 'text-amber-700'}`}><CheckCircle2 size={16} />{confirmedCount ? `已确认结论 ${confirmedCount} 条` : '尚无已确认结论'}{pendingCount ? ` · 待验证 ${pendingCount} 条` : ''}</div><div className={`flex items-start gap-2 ${missing.length ? 'text-amber-700' : 'text-emerald-700'}`}><ShieldCheck size={16} className="mt-0.5" />{missing.length ? `${missing.length} 项内容待补充：${missing.map((key) => key.toUpperCase()).join('、')}` : 'D1–D8 已完整'}</div><div className={`flex items-center gap-2 text-xs ${report.generation_engine === 'agent' ? 'text-slate-600' : 'text-amber-700'}`}>{report.generation_engine === 'agent' ? `生成模型：${String(report.model_name || '—')}` : report.generation_engine === 'rule' ? '规则模板生成，D5–D8 需工程师补写' : '人工填写，无生成记录'}</div>{Boolean(report.fallback_reason) && <div className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">降级说明：{String(report.fallback_reason)}</div>}<div className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">定稿会关闭预警、完成分析任务并写入历史归档。定稿前必须有至少一条已确认结论，且 D1–D8 完整。正式系统可在此接入审批流。</div></CardContent></Card>
        <Button className="w-full bg-blue-700 hover:bg-blue-800" disabled={saving || finalized || generating} onClick={() => save(false)}>{saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}保存草稿</Button>
        <Button className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={saving || finalized || generating || Boolean(blockers.length)} onClick={() => save(true)} title={blockers.join('；')}><ShieldCheck size={16} />确认定稿并归档</Button>
        {Boolean(blockers.length) && !finalized && <p className="text-xs leading-5 text-amber-700">定稿前需先完成：{blockers.join('；')}。草稿可以随时保存。</p>}
        <Button className="w-full" variant="outline" onClick={exportHtml}><Download size={16} />导出 HTML</Button>
        <Button className="w-full" variant="outline" onClick={() => window.print()}><Printer size={16} />打印 / PDF</Button>
        <Button className="w-full" variant="ghost" asChild><Link href={`/quality/diagnosis?alertId=${report.alert_id}`}>返回诊断</Link></Button>
      </aside>
    </div>
  </>;
}

/**
 * D1–D8 正文区。生成期间 `activeField` 指向模型正在写的字段，
 * 该输入框会高亮并显示「生成中」，让工程师看得出内容是逐字段实时产出的。
 */
function DraftSections({ values, disabled, activeField, onChange }: {
  values: Row;
  disabled: boolean;
  activeField: string | null;
  onChange?: (key: string, value: string) => void;
}) {
  return <CardContent className="divide-y divide-slate-200 p-0">{Object.entries(eightDSections).map(([key, name]) => {
    const writing = activeField === key;
    const filled = Boolean(String(values[key] || '').trim());
    return <section key={key} className="grid gap-4 p-5 lg:grid-cols-[180px_minmax(0,1fr)]">
      <div>
        <div className="flex items-center gap-2">
          <b className="text-lg text-blue-700">{key.toUpperCase()}</b>
          {writing && <span className="flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700"><Loader2 size={11} className="animate-spin" />生成中</span>}
        </div>
        <p className="text-sm font-medium text-slate-700">{name}</p>
        <span className="mt-2 block text-xs text-slate-400">{['d1', 'd2', 'd3', 'd4'].includes(key) ? '生成草稿，需工程师确认' : '待工程师确认后填写'}</span>
      </div>
      <div>
        <Label className="sr-only">{name}</Label>
        <Textarea
          disabled={disabled}
          value={String(values[key] || '')}
          onChange={(event) => onChange?.(key, event.target.value)}
          className={cn('min-h-32 leading-6', writing && 'border-indigo-300 ring-1 ring-indigo-200')}
          placeholder={writing ? '模型正在写入本字段…' : filled ? '' : `填写${name}`}
        />
      </div>
    </section>;
  })}</CardContent>;
}

/** 模型还在取证（尚未开始写 D1–D8）时的占位骨架。 */
function DraftSkeleton() {
  return <Card className="border-slate-200 shadow-sm">
    <CardHeader className="border-b border-slate-100 pb-3"><CardTitle className="flex items-center gap-2 text-base"><Sparkles size={17} className="text-indigo-600" />正在生成 D1–D8</CardTitle><p className="mt-1 text-xs text-slate-500">Agent 正在核对事件事实、结论卡片与工程师验证记录。取证阶段结束后，D1–D8 会逐个字段实时写入下方输入框。</p></CardHeader>
    <CardContent className="space-y-3 p-5">
      {Object.entries(eightDSections).map(([key, name]) => <div key={key} className="rounded-lg border border-slate-200 p-4">
        <div className="flex items-center gap-2"><b className="text-sm text-blue-700">{key.toUpperCase()}</b><span className="text-xs font-medium text-slate-600">{name}</span></div>
        <div className="mt-3 space-y-2"><div className="h-3 w-3/4 animate-pulse rounded bg-slate-100" /><div className="h-3 w-5/6 animate-pulse rounded bg-slate-100" /><div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" /></div>
      </div>)}
    </CardContent>
  </Card>;
}
