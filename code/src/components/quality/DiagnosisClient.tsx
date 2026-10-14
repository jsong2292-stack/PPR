'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bot, Check, CheckCircle2, ChevronRight, Database, FileSearch, Loader2, RefreshCw, Save, Settings2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AnalysisProcessPanel, type AnalysisProcessEvent } from './AnalysisProcessPanel';
import { EquipmentProcessTrendCard } from './EquipmentProcessTrendCard';
import { MetricTrendCard, metricLabels } from './MetricTrendCard';
import { PageHeader } from './PageHeader';
import { streamQualityRequest } from '@/lib/quality-analysis/stream-client';
import type { ConclusionDraftEvent, QualityAnalysisConclusion } from '@/lib/quality-analysis/types';

type Row = Record<string, unknown>;
type AnalysisMode = 'rule' | 'agent';
type AgentStatus = { mode: AnalysisMode; configured: boolean; model: string; fallbackToRule: boolean; framework: string };
/** 生成过程中逐条到达的结论卡片：内容够用即可显示，落库后才带 id。 */
type StreamConclusion = {
  index: number;
  conclusion: Partial<QualityAnalysisConclusion>;
  open: boolean;
  persisted: boolean;
  id?: number;
};

/**
 * 诊断页只处理异常事件：本页由监控页「进入诊断」下钻进入（?alertId=），
 * 页面只呈现该事件的证据与结论，因此不再提供事件切换入口。
 */
const riskLabels: Record<string, string> = { normal: '正常', medium: '中风险', high: '高风险', error: '数据核对' };
const riskStyles: Record<string, string> = {
  normal: 'bg-emerald-50 text-emerald-700',
  medium: 'bg-amber-50 text-amber-700',
  high: 'bg-red-50 text-red-700',
  error: 'bg-violet-50 text-violet-700',
};
/** 事件里的限值字段按指标取值，与判定引擎 resolveRange 的口径一致（不圆度没有下限列，按 0 处理）。 */
const limitColumns: Record<string, { lower?: string; upper: string }> = {
  outer_diameter: { lower: 'outer_lower_mm', upper: 'outer_upper_mm' },
  min_wall_thickness: { lower: 'wall_lower_mm', upper: 'wall_upper_mm' },
  ovality: { upper: 'ovality_upper_mm' },
};

const toNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** 已有报告的 8D 工具调用次数，用于在诊断页展示生成审计摘要。 */
function asTraceCount(value: unknown) {
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.length : 0; } catch { return 0; }
  }
  return 0;
}

/** 把预警事件的限值整理成「标准区间 / 实测值 / 偏差」，供诊断页的判定依据卡片展示。 */
function ruleBreakdown(row: Row) {
  const config = limitColumns[String(row.metric_code ?? '')];
  const upper = config ? toNumber(row[config.upper]) : null;
  const lower = config ? (config.lower ? toNumber(row[config.lower]) ?? 0 : 0) : null;
  const observed = toNumber(row.observed_value);
  const interval = upper === null ? '限值待确认' : lower === null ? `≤ ${upper.toFixed(3)} mm` : `${lower.toFixed(3)} mm–${upper.toFixed(3)} mm`;
  let deviation = '—';
  if (observed !== null && upper !== null && lower !== null) {
    if (observed > upper) deviation = `高于上限 ${(observed - upper).toFixed(3)} mm`;
    else if (observed < lower) deviation = `低于下限 ${(lower - observed).toFixed(3)} mm`;
    else deviation = '落在标准区间内';
  }
  return { interval, observed, deviation };
}

const decisionLabels: Record<string, string> = { pending: '待验证', confirmed: '已确认', rejected: '已驳回' };const decisionStyles: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700',
  confirmed: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-slate-100 text-slate-600',
};

/**
 * 生成中的结论卡片：模型写一条就渲染一张，字段随文本增长补齐。
 * 只读展示，落库后由下方可编辑的正式卡片接管（内容与序号一一对应）。
 */
function StreamingConclusionCard({ item }: { item: StreamConclusion }) {
  const conclusion = item.conclusion;
  return <Card className="border-indigo-100 shadow-sm">
    <CardHeader className="border-b border-slate-100 pb-3">
      <div className="flex items-center justify-between gap-2">
        <CardTitle className="text-base">C{item.index + 1} · {conclusion.category || '正在生成…'}</CardTitle>
        <Badge className={item.open ? 'bg-indigo-50 text-indigo-700' : item.persisted ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}>
          {item.open ? '生成中' : item.persisted ? '已保存' : '待保存'}
        </Badge>
      </div>
      {conclusion.confidence != null && <p className="text-xs text-slate-500">证据完备度：{Math.round(Number(conclusion.confidence) * 100)}%</p>}
    </CardHeader>
    <CardContent className="space-y-4 p-5">
      <section><Label className="text-xs text-slate-500">待验证结论</Label><p className="mt-1 text-sm font-medium leading-6 text-slate-900">{conclusion.hypothesis || '…'}</p></section>
      <section className="rounded-lg bg-slate-50 p-3"><div className="mb-1 flex items-center gap-1 text-xs font-semibold text-slate-600"><Database size={13} />支持证据</div><p className="text-xs leading-5 text-slate-600">{conclusion.evidence || '…'}</p></section>
      {conclusion.validationAction && <section><Label className="text-xs text-slate-500">建议验证动作</Label><p className="mt-1 text-xs leading-5 text-blue-700">{conclusion.validationAction}</p></section>}
    </CardContent>
  </Card>;
}

export function DiagnosisClient() {
  const search = useSearchParams();
  const router = useRouter();
  const [alerts, setAlerts] = useState<Row[]>([]);
  const [measurements, setMeasurements] = useState<Row[]>([]);
  /** alertId 只来自监控页下钻链接，页面内不再改变它。 */
  const alertId = search.get('alertId') || '';
  const [analysis, setAnalysis] = useState<Row | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [mode, setMode] = useState<AnalysisMode>('rule');
  const [loading, setLoading] = useState(true);
  const [alertsReady, setAlertsReady] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [processEvents, setProcessEvents] = useState<AnalysisProcessEvent[]>([]);
  const [processExpanded, setProcessExpanded] = useState(false);
  const [processFinished, setProcessFinished] = useState(false);
  /** 生成过程中逐条到达的结论：写一条渲染一张，全部落库后由 analysis.conclusions 接管。 */
  const [streamConclusions, setStreamConclusions] = useState<StreamConclusion[]>([]);
  /** 全部结论渲染完成后弹出「分析完成」。 */
  const [completed, setCompleted] = useState(false);
  /** 当前分析对应的 8D 报告草稿：由 8D 生成 Agent 写入，用于展示生成状态与草稿预览。 */
  const [report, setReport] = useState<Row | null>(null);
  const [reportReady, setReportReady] = useState(false);
  /** 只在页面上被编辑过、尚未落库的结论 ID：生成 8D 前需要先提交这些改动。 */
  const dirtyConclusions = useRef<Set<number>>(new Set());
  /** 正在保存工程师填写并跳转到报告页。 */
  const [navigating, setNavigating] = useState(false);

  const loadAlerts = useCallback(async () => {
    const response = await fetch('/api/quality/dashboard');
    const json = await response.json();
    if (response.ok) {
      setAlerts(json.alerts || []);
      setMeasurements(json.measurements || []);
    }
    setAlertsReady(true);
  }, []);

  const loadAgentStatus = useCallback(async () => {
    const response = await fetch('/api/quality/agent/status');
    const json = await response.json();
    if (response.ok) {
      setAgentStatus(json);
      setMode(json.mode === 'agent' ? 'agent' : 'rule');
    }
  }, []);

  const loadAnalysis = useCallback(async (id: string) => {
    if (!id) { setAnalysis(null); setLoading(false); return; }
    setLoading(true);
    try {
      const response = await fetch(`/api/quality/analysis?alertId=${id}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      setAnalysis(json.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAlerts(); loadAgentStatus(); }, [loadAlerts, loadAgentStatus]);
  useEffect(() => { loadAnalysis(alertId); }, [alertId, loadAnalysis]);

  const analysisId = analysis ? Number(analysis.id) : 0;

  /** 报告是诊断页的附加信息：读取失败时保持「尚无草稿」，不阻断诊断主流程。 */
  useEffect(() => {
    let cancelled = false;
    if (!analysisId) { setReport(null); setReportReady(true); return; }
    setReportReady(false);
    fetch(`/api/quality/reports?analysisId=${analysisId}`)
      .then(async (response) => { const json = await response.json(); if (response.ok && !cancelled) setReport(json.data || null); })
      .catch(() => { if (!cancelled) setReport(null); })
      .finally(() => { if (!cancelled) setReportReady(true); });
    return () => { cancelled = true; };
  }, [analysisId]);

  /**
   * 结论帧里带的是「该条结论目前为止的完整字段」而不是增量，按序号覆盖即可，
   * 丢帧或乱序都不会把卡片拼错；帧里没出现的字段保持原值，避免被空内容覆盖。
   */
  const applyConclusion = useCallback((event: ConclusionDraftEvent) => {
    setStreamConclusions((current) => {
      const next = [...current];
      const at = next.findIndex((item) => item.index === event.index);
      const previous: StreamConclusion = at >= 0 ? next[at] : { index: event.index, conclusion: {}, open: false, persisted: false };
      const conclusion = { ...previous.conclusion };
      for (const [key, value] of Object.entries(event.conclusion || {})) {
        if (value === undefined || value === null) continue;
        (conclusion as Record<string, unknown>)[key] = value;
      }
      const merged: StreamConclusion = {
        index: event.index,
        conclusion,
        open: Boolean(event.open) && !event.persisted,
        persisted: Boolean(event.persisted) || previous.persisted,
        id: event.id ?? previous.id,
      };
      if (at >= 0) next[at] = merged; else next.push(merged);
      return next.sort((left, right) => left.index - right.index);
    });
  }, []);

  const generate = async () => {
    if (!alertId) return toast.warning('请选择预警事件');
    setGenerating(true);
    setProcessEvents([]);
    setProcessFinished(false);
    setProcessExpanded(true);
    setStreamConclusions([]);
    setCompleted(false);
    try {
      const result = await streamQualityRequest<{
        data: Row;
        reused?: boolean;
        generation?: { engineType?: string; modelName?: string | null; latencyMs?: number };
      }>(
        '/api/quality/analysis',
        { alertId: Number(alertId), mode, regenerate: Boolean(analysis), generatedBy: '质量工程师' },
        (event) => setProcessEvents((current) => [...current, event]),
        undefined,
        applyConclusion,
      );
      // 落库结果与流式卡片序号一一对应，同一批更新里替换，不会出现空白或闪烁。
      setAnalysis(result.data);
      setStreamConclusions([]);
      if (result.data?.fallback_reason) toast.warning(`Agent已降级：${result.data.fallback_reason}`);
      if (result.reused) toast.success('已复用现有分析结果');
      else if (result.data) setCompleted(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '生成失败');
    } finally {
      setGenerating(false);
      setProcessFinished(true);
      window.setTimeout(() => setProcessExpanded(false), 1400);
    }
  };

  /**
   * 生成 8D 前把页面上未保存的工程师填写（实际发现 / 工程师意见）落库，
   * 保证 8D Agent 读到的是工程师当前看到的页面内容，而不是上一次保存的快照。
   * 只提交真正改过的结论：结论卡片上的「确认/驳回/保存」已经即时落库，
   * 全量回写会把未改动的结论也标成 engineer_modified=1。
   */
  const persistConclusions = async () => {
    const dirty = dirtyConclusions.current;
    if (!dirty.size) return;
    for (const item of ((analysis?.conclusions as Row[]) || [])) {
      if (!dirty.has(Number(item.id))) continue;
      const response = await fetch('/api/quality/analysis', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conclusionId: item.id,
          engineerDecision: item.engineer_decision || 'pending',
          engineerComment: item.engineer_comment || '',
          actualFinding: item.actual_finding || '',
          updatedBy: '质量工程师',
        }),
      });
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error || '保存工程师验证记录失败，8D 报告未生成');
      }
    }
    dirty.clear();
  };

  /**
   * 生成 8D 的入口：先把工程师填写落库，再带 generate=1 跳到 8D 报告页，
   * 让生成过程与 D1–D8 草稿都在报告页里展示（而不是在诊断页生成完再跳过去看）。
   */
  const goGenerate = async () => {
    if (!analysisId || navigating) return;
    setNavigating(true);
    try {
      await persistConclusions();
      router.push(`/quality/report?analysisId=${analysisId}&generate=1`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存工程师验证记录失败，8D 报告未生成');
      setNavigating(false);
    }
  };

  const saveConclusion = async (item: Row, decision?: string) => {
    const response = await fetch('/api/quality/analysis', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conclusionId: item.id,
        engineerDecision: decision || item.engineer_decision,
        engineerComment: item.engineer_comment || '',
        actualFinding: item.actual_finding || '',
        updatedBy: '质量工程师',
      }),
    });
    const json = await response.json();
    if (!response.ok) return toast.error(json.error || '保存失败');
    toast.success('验证结果已保存');
    loadAnalysis(alertId);
  };

  const update = (id: unknown, key: string, value: string) => {
    dirtyConclusions.current.add(Number(id));
    setAnalysis((state) => state ? {
      ...state,
      conclusions: (state.conclusions as Row[]).map((item) => item.id === id ? { ...item, [key]: value } : item),
    } : state);
  };

  /** 事件由监控页下钻带入（?alertId=），页面只展示该事件的证据与结论，不再提供切换。 */
  const selected = alerts.find((item) => String(item.id) === alertId);
  const breakdown = selected ? ruleBreakdown(selected) : null;
  const engineType = String(analysis?.engine_type || 'rule');

  return <>
    <PageHeader
      title="异常诊断与验证"
      description="由质量监控的异常事件下钻进入：本页只展示该事件的证据、趋势与待验证结论。"
      actions={<>
        <Button variant="outline" asChild><Link href="/quality/monitor"><ChevronRight className="rotate-180" size={16} />返回监控</Link></Button>
        <Button variant="ghost" onClick={() => loadAnalysis(alertId)} disabled={!alertId}><RefreshCw size={16} />刷新</Button>
      </>}
    />

    {/* 事件切换已移除：alertId 由监控页「进入诊断」下钻带入。直接访问未带参数时给出回跳入口，不再默认选中其他事件。 */}
    {!alertsReady ? <div className="grid h-64 place-items-center"><Loader2 className="animate-spin text-blue-700" /></div> : !selected ?
      <Card className="border-dashed border-slate-300"><CardContent className="grid h-64 place-items-center text-center"><div><FileSearch className="mx-auto mb-3 text-slate-400" /><b>未选择异常事件</b><p className="mt-1 text-sm text-slate-500">请在质量监控的预警事件队列中点击「进入诊断」，下钻查看对应事件。</p><Button asChild className="mt-4 bg-blue-700 hover:bg-blue-800"><Link href="/quality/monitor">前往质量监控</Link></Button></div></CardContent></Card>
      : <>

    {selected && <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[['预警事件', selected.event_no], ['生产批次', selected.batch_no], ['触发规则', `${selected.rule_code} · ${selected.rule_name}`], ['观测值', `${selected.observed_value ?? '—'} mm`]].map(([label, value]) =>
        <Card key={String(label)} className="border-slate-200 shadow-sm"><CardContent className="p-4"><span className="text-xs text-slate-500">{String(label)}</span><b className="mt-1 block text-sm text-slate-900">{String(value)}</b></CardContent></Card>)}
    </div>}

    {/* 判定依据（原监控页「判定规则」列里的限值文字）：标准区间、实测值与偏差在这里展开，不再挤在队列表格里。 */}
    {selected && breakdown && <Card className="mb-5 border-amber-200 bg-amber-50/50 shadow-sm">
      <CardHeader className="border-b border-amber-100 pb-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><CardTitle className="text-base">判定依据 · 限值对照</CardTitle><p className="mt-1 text-xs text-slate-500">{String(selected.event_no)} · {String(selected.batch_no)} · 产品规格 {String(selected.spec_name ?? '—')}；限值取自规格标准区间</p></div><Badge className={riskStyles[String(selected.risk_level)]}>{riskLabels[String(selected.risk_level)] ?? String(selected.risk_level)}</Badge></div></CardHeader>
      <CardContent className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
        {[['标准区间', breakdown.interval], ['实测值', breakdown.observed === null ? '无数据' : `${breakdown.observed.toFixed(3)} mm`], ['偏差', breakdown.deviation], ['判定规则', `${String(selected.rule_code)} · ${String(selected.rule_name)}`]].map(([label, value]) =>
          <div key={label} className="rounded-lg border border-amber-100 bg-white p-3"><span className="text-xs text-slate-500">{label}</span><b className="mt-1 block font-mono text-sm text-slate-900">{value}</b></div>)}
      </CardContent>
      <div className="border-t border-amber-100 px-5 py-3 text-xs text-slate-600">判定说明：{String(selected.threshold_text || '—')}</div>
    </Card>}

    {/* 趋势图跟随所选事件：key 绑定事件 id，切换事件即重置视图并自动定位到该事件的异常指标、规格与批次。 */}
    {selected && <MetricTrendCard key={alertId} measurements={measurements} focus={{ metricCode: String(selected.metric_code ?? ''), specName: String(selected.spec_name ?? ''), batchNo: String(selected.batch_no ?? '') }} />}

    {/* 设备参数图按「批次号」跟随而不是按「事件」：同批次切换事件时不重新取数，只移动异常时刻标线。 */}
    {selected && <EquipmentProcessTrendCard
      key={`equipment-${String(selected.batch_no ?? '')}`}
      batchNo={selected.batch_no ? String(selected.batch_no) : null}
      alertTime={String(selected.inspect_time ?? '')}
      alertMetricLabel={metricLabels[String(selected.metric_code ?? '')]}
    />}

    {/* 生成分析、当前模式与执行过程合并为一个区域：读完限值对照与趋势图后，在这里选模式、生成并查看过程，结论紧随其后。
        Card 自带 py-6 + gap-6，这里用 gap-0 py-0 关掉，改由内部各行自己控制间距，避免折叠后上下留白。 */}
    <Card className="mb-5 gap-0 border-slate-200 py-0 shadow-sm">
      <CardHeader className="border-b border-slate-100 px-4 pt-3 pb-3"><div className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><CardTitle className="text-base">生成诊断分析</CardTitle><p className="text-xs text-slate-500">基于上方限值对照、批次尺寸趋势与设备工艺数据整理结论；生成过程与结论在下方展示。</p></div></CardHeader>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={mode} onValueChange={(value) => setMode(value as AnalysisMode)}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="rule">规则引擎模式</SelectItem>
              <SelectItem value="agent">LangChain Agent</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={generate} disabled={generating} className="bg-indigo-600 hover:bg-indigo-700">
            {generating ? <Loader2 className="animate-spin" size={16} /> : <Bot size={16} />}
            {analysis ? '重新生成分析' : '生成分析'}
          </Button>
          <span className="text-xs text-slate-500">{analysis ? '重新生成会按当前数据重算结论，已确认的结论需重新验证。' : '生成后系统会保存证据、工具轨迹与待验证结论。'}</span>
        </div>
        {/* 原独立的信息条并入本区域：仍是同一张卡的第二行，但不再单独占一张卡和一段外边距。 */}
        {agentStatus && <div className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-xs ${mode === 'agent' && !agentStatus.configured ? 'bg-amber-50 text-amber-800' : 'bg-slate-50 text-slate-600'}`}>
          <span className="flex items-center gap-1.5 font-medium"><Settings2 size={14} />当前选择：{mode === 'agent' ? 'LangChain Agent' : '规则引擎'}</span>
          <span>· 系统默认 {agentStatus.mode === 'agent' ? 'Agent' : '规则'}</span>
          <span>{mode === 'agent' ? (agentStatus.configured ? `模型 ${agentStatus.model} · ${agentStatus.framework}` : `未配置API密钥${agentStatus.fallbackToRule ? '，将自动降级规则模式' : ''}`) : '确定性规则和模板，不调用大模型'}</span>
        </div>}
      </CardContent>
      {/* 分析过程作为本区域的折叠区块：折叠后只剩一行，展开后在本区域内滚动查看步骤。 */}
      <AnalysisProcessPanel
        embedded
        events={processEvents}
        expanded={processExpanded}
        generating={generating}
        finished={processFinished}
        onToggle={() => setProcessExpanded((value) => !value)}
      />
    </Card>

    {/* 生成中：模型写一条结论就渲染一张卡片，不必等整个分析返回；全部落库后由下方正式卡片接管。 */}
    {generating && <div className="mb-5">
      <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
        <Loader2 className="animate-spin text-indigo-600" size={14} />
        {streamConclusions.length
          ? `正在生成结论卡片 · 已输出 ${streamConclusions.length} 条，写好的卡片会立即显示在下方`
          : '正在取证并生成结论卡片，第一条写好后会立即显示在下方'}
      </div>
      {streamConclusions.length > 0 && <div className="grid gap-4 xl:grid-cols-3">
        {streamConclusions.map((item) => <StreamingConclusionCard key={item.index} item={item} />)}
      </div>}
    </div>}

    {/* 空态压成一行提示：原来占 256px 高的占位卡在折叠状态下会留出大片空白。生成中不显示空态，改由上方逐条卡片呈现。 */}
    {loading ? <div className="grid h-32 place-items-center"><Loader2 className="animate-spin text-blue-700" /></div> : generating ? <></> : !analysis ?
      <Card className="gap-0 border-dashed border-slate-300 py-0"><CardContent className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-6 text-center"><Bot className="text-slate-400" size={16} /><b className="text-sm text-slate-700">尚未生成诊断分析</b><span className="text-xs text-slate-500">选择模式后点击「生成分析」，系统会保存证据、工具轨迹和待验证结论。</span></CardContent></Card> : <>
        {Boolean(analysis.fallback_reason) && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><b>Agent降级说明：</b>{String(analysis.fallback_reason)}</div>}
        <Card className="mb-5 border-indigo-200 bg-indigo-50/50 shadow-sm"><CardContent className="flex gap-3 p-5"><Bot className="mt-0.5 shrink-0 text-indigo-600" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><b className="text-indigo-950">分析摘要</b><Badge className={engineType === 'agent' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}>{engineType === 'agent' ? 'LangChain Agent' : '规则引擎'}</Badge>{Boolean(analysis.model_name) && <Badge variant="outline">{String(analysis.model_name)}</Badge>}</div><p className="mt-2 text-sm leading-6 text-indigo-900">{String(analysis.summary)}</p><p className="mt-2 text-xs text-indigo-600">{String(analysis.run_no)} · {String(analysis.prompt_version || '')} · {String(analysis.latency_ms || 0)} ms · 生成于 {String(analysis.generated_at)}</p></div></CardContent></Card>

        <div className="mb-5 grid gap-4 xl:grid-cols-3">{(analysis.conclusions as Row[]).map((item, index) => <Card key={String(item.id)} className="border-slate-200 shadow-sm"><CardHeader className="border-b border-slate-100 pb-3"><div className="flex items-center justify-between gap-2"><CardTitle className="text-base">C{index + 1} · {String(item.category)}</CardTitle><Badge className={decisionStyles[String(item.engineer_decision)]}>{decisionLabels[String(item.engineer_decision)]}</Badge></div>{item.confidence != null && <p className="text-xs text-slate-500">证据完备度：{Math.round(Number(item.confidence) * 100)}%</p>}</CardHeader><CardContent className="space-y-4 p-5">
          <section><Label className="text-xs text-slate-500">待验证结论</Label><p className="mt-1 text-sm font-medium leading-6 text-slate-900">{String(item.hypothesis)}</p></section>
          <section className="rounded-lg bg-slate-50 p-3"><div className="mb-1 flex items-center gap-1 text-xs font-semibold text-slate-600"><Database size={13} />支持证据</div><p className="text-xs leading-5 text-slate-600">{String(item.evidence || '无')}</p>{Array.isArray(item.evidence_source_ids) && <div className="mt-2 flex flex-wrap gap-1">{item.evidence_source_ids.map((source) => <Badge key={String(source)} variant="outline" className="text-[10px]">{String(source)}</Badge>)}</div>}</section>
          <section><Label className="text-xs text-slate-500">缺失证据</Label><p className="mt-1 text-xs leading-5 text-amber-700">{String(item.missing_evidence || '无')}</p></section>
          <section><Label className="text-xs text-slate-500">建议验证动作</Label><p className="mt-1 text-xs leading-5 text-blue-700">{String(item.validation_action || '无')}</p></section>
          <div><Label className="mb-2 block text-xs">实际发现</Label><Textarea value={String(item.actual_finding || '')} onChange={(event) => update(item.id, 'actual_finding', event.target.value)} placeholder="填写现场复核、复测或设备核查结果" /></div>
          <div><Label className="mb-2 block text-xs">工程师意见</Label><Textarea value={String(item.engineer_comment || '')} onChange={(event) => update(item.id, 'engineer_comment', event.target.value)} placeholder="填写判定理由" /></div>
          <div className="grid grid-cols-3 gap-2"><Button size="sm" variant="outline" onClick={() => saveConclusion(item, 'rejected')}><X size={14} />驳回</Button><Button size="sm" variant="outline" onClick={() => saveConclusion(item)}><Save size={14} />保存</Button><Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => saveConclusion(item, 'confirmed')}><Check size={14} />确认</Button></div>
        </CardContent></Card>)}</div>

        {reportReady && <Card className="border-blue-200 bg-blue-50/60 shadow-sm">
          <CardHeader className="border-b border-blue-100 pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base"><Bot size={17} />下一步：生成 8D 报告</CardTitle>
                <p className="mt-1 text-xs text-slate-600">点击后会先保存本页填写的实际发现与工程师意见，然后进入 8D 报告页；8D Agent 在报告页读取诊断摘要、本页引用的限值与批次/设备数据、上方结论卡片和工程师记录，实时生成 D1–D8，生成过程与草稿内容都在报告页展示。</p>
              </div>
              {report
                ? <Badge className={report.generation_engine === 'agent' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}>{report.generation_engine === 'agent' ? 'LangChain Agent 生成' : report.generation_engine === 'rule' ? '规则模板生成' : '已有草稿'}</Badge>
                : <Badge variant="outline">尚无草稿</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            {report ? <div className="grid gap-3 rounded-xl border border-blue-100 bg-white p-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
              <div><span className="text-slate-500">报告编号</span><b className="mt-0.5 block font-mono text-slate-900">{String(report.report_no || '—')}</b></div>
              <div><span className="text-slate-500">生成模型</span><b className="mt-0.5 block text-slate-900">{String(report.model_name || '规则模板（不调用模型）')}</b></div>
              <div><span className="text-slate-500">生成时间</span><b className="mt-0.5 block text-slate-900">{report.generated_at ? String(report.generated_at) : '—'}</b></div>
              <div><span className="text-slate-500">证据轨迹</span><b className="mt-0.5 block text-slate-900">{asTraceCount(report.tool_trace_json) ? `${asTraceCount(report.tool_trace_json)} 次工具调用` : '规则模板无工具轨迹'}</b></div>
            </div> : <p className="text-xs text-slate-600">尚未生成 8D 报告。建议先在结论卡片中填写实际发现与工程师意见，并完成确认或否决，Agent 会据此区分「已确认根因 / 已排除项 / 仍待验证假设」。</p>}
            {Boolean(report?.fallback_reason) && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><b>降级说明：</b>{String(report?.fallback_reason)}</div>}
            {report?.status === 'finalized' && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">报告已归档：可在历史分析或「进入 8D 工作台」中继续修改 D1–D8，归档状态下不提供重新生成。</div>}
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={goGenerate} disabled={navigating || report?.status === 'finalized'} className="bg-indigo-600 hover:bg-indigo-700">
                {navigating ? <Loader2 className="animate-spin" size={16} /> : report ? <RefreshCw size={16} /> : <Bot size={16} />}
                {report ? '重新生成 8D 报告' : '生成 8D 报告'}
              </Button>
              {report ? <Button asChild className="bg-blue-700 hover:bg-blue-800"><Link href={`/quality/report?analysisId=${analysisId}`}>进入 8D 工作台<ChevronRight size={16} /></Link></Button> : null}
              <span className="text-xs text-slate-500">{navigating ? '正在保存工程师验证记录并跳转…' : '生成过程在 8D 报告页实时展示。'}</span>
            </div>
          </CardContent>
        </Card>}
      </>}

    </>}

    {/* 全部结论渲染完成后的收尾弹窗：确认本次生成了什么，并给出下一步入口。 */}
    <Dialog open={completed} onOpenChange={setCompleted}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="text-emerald-600" size={18} />分析完成</DialogTitle>
          <DialogDescription>
            已生成 {((analysis?.conclusions as Row[]) || []).length} 条待验证结论{analysis ? `，保存在分析任务 ${String(analysis.run_no)}` : ''}。结论只是待验证假设，请逐条填写实际发现与工程师意见后再确认或驳回。
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
          <div><span className="text-xs text-slate-500">分析引擎</span><b className="mt-0.5 block">{engineType === 'agent' ? 'LangChain Agent' : '规则引擎'}</b></div>
          <div><span className="text-xs text-slate-500">模型</span><b className="mt-0.5 block">{String(analysis?.model_name || '规则模板（不调用模型）')}</b></div>
          <div><span className="text-xs text-slate-500">结论条数</span><b className="mt-0.5 block">{((analysis?.conclusions as Row[]) || []).length} 条</b></div>
          <div><span className="text-xs text-slate-500">耗时</span><b className="mt-0.5 block">{String(analysis?.latency_ms || 0)} ms</b></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCompleted(false)}>查看结论</Button>
          <Button className="bg-indigo-600 hover:bg-indigo-700" disabled={!analysisId || navigating} onClick={() => { setCompleted(false); goGenerate(); }}>
            {navigating ? <Loader2 className="animate-spin" size={16} /> : <Bot size={16} />}
            生成 8D 报告
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
