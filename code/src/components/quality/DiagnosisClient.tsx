'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Bot, Check, ChevronRight, Database, FileSearch, Loader2, RefreshCw, Save, Settings2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AnalysisProcessPanel, type AnalysisProcessEvent } from './AnalysisProcessPanel';
import { EquipmentProcessTrendCard } from './EquipmentProcessTrendCard';
import { MetricTrendCard, metricLabels } from './MetricTrendCard';
import { PageHeader } from './PageHeader';

type Row = Record<string, unknown>;
type AnalysisMode = 'rule' | 'agent';
type AgentStatus = { mode: AnalysisMode; configured: boolean; model: string; fallbackToRule: boolean; framework: string };

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

const decisionLabels: Record<string, string> = { pending: '待验证', confirmed: '已确认', rejected: '已驳回' };
const decisionStyles: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700',
  confirmed: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-slate-100 text-slate-600',
};

export function DiagnosisClient() {
  const search = useSearchParams();
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

  const generate = async () => {
    if (!alertId) return toast.warning('请选择预警事件');
    setGenerating(true);
    setProcessEvents([]);
    setProcessFinished(false);
    setProcessExpanded(true);
    let resultReceived = false;
    try {
      const response = await fetch('/api/quality/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({
          alertId: Number(alertId),
          mode,
          regenerate: Boolean(analysis),
          generatedBy: '质量工程师',
        }),
      });
      if (!response.ok || !response.body) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json.error || '无法建立分析流');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamError = '';

      const handleBlock = (block: string) => {
        if (!block.trim()) return;
        let eventName = 'progress';
        const dataLines: string[] = [];
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) eventName = line.slice(6).trim();
          if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
        }
        if (!dataLines.length) return;
        const payload = JSON.parse(dataLines.join('\n'));
        if (eventName === 'progress') {
          setProcessEvents((current) => [...current, payload as AnalysisProcessEvent]);
        } else if (eventName === 'result') {
          resultReceived = true;
          setAnalysis(payload.data);
          if (payload.data?.fallback_reason) toast.warning(`Agent已降级：${payload.data.fallback_reason}`);
          else toast.success(mode === 'agent' ? 'LangChain Agent分析已完成' : '规则分析已完成');
        } else if (eventName === 'error') {
          streamError = payload.message || '生成分析失败';
          setProcessEvents((current) => [...current, {
            stage: 'complete', status: 'error', message: '分析过程执行失败', detail: streamError,
            timestamp: new Date().toISOString(),
          }]);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';
        blocks.forEach(handleBlock);
        if (done) break;
      }
      if (buffer.trim()) handleBlock(buffer);
      if (streamError) throw new Error(streamError);
      if (!resultReceived) throw new Error('分析流结束但未返回结果');
      setProcessFinished(true);
      window.setTimeout(() => setProcessExpanded(false), 1400);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '生成失败');
      setProcessFinished(true);
    } finally {
      setGenerating(false);
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

  const update = (id: unknown, key: string, value: string) => setAnalysis((state) => state ? {
    ...state,
    conclusions: (state.conclusions as Row[]).map((item) => item.id === id ? { ...item, [key]: value } : item),
  } : state);

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

    {/* 生成分析移到数据展示之后：先读完限值对照与趋势图，再选择模式生成，结论紧随其后，保证阅读连贯。 */}
    <Card className="mb-5 border-slate-200 shadow-sm">
      <CardHeader className="border-b border-slate-100 pb-3"><div><CardTitle className="text-base">生成诊断分析</CardTitle><p className="mt-1 text-xs text-slate-500">基于上方限值对照、批次尺寸趋势与设备工艺数据整理结论；生成过程与结论在下方展示。</p></div></CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3 p-4">
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
      </CardContent>
    </Card>

    {agentStatus && <div className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm ${mode === 'agent' && !agentStatus.configured ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
      <div className="flex items-center gap-2"><Settings2 size={16} /><b>当前选择：{mode === 'agent' ? 'LangChain Agent' : '规则引擎'}</b><span>· 系统默认 {agentStatus.mode === 'agent' ? 'Agent' : '规则'}</span></div>
      <span>{mode === 'agent' ? (agentStatus.configured ? `模型 ${agentStatus.model} · ${agentStatus.framework}` : `未配置API密钥${agentStatus.fallbackToRule ? '，将自动降级规则模式' : ''}`) : '确定性规则和模板，不调用大模型'}</span>
    </div>}

    <AnalysisProcessPanel
      events={processEvents}
      expanded={processExpanded}
      generating={generating}
      finished={processFinished}
      onToggle={() => setProcessExpanded((value) => !value)}
    />

    {loading ? <div className="grid h-64 place-items-center"><Loader2 className="animate-spin text-blue-700" /></div> : !analysis ?
      <Card className="border-dashed border-slate-300"><CardContent className="grid h-64 place-items-center text-center"><div><Bot className="mx-auto mb-3 text-slate-400" /><b>尚未生成诊断分析</b><p className="mt-1 text-sm text-slate-500">选择模式后生成分析，系统会保存证据、工具轨迹和待验证结论。</p></div></CardContent></Card> : <>
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

        <Card className="border-blue-200 bg-blue-50 shadow-sm"><CardContent className="flex flex-wrap items-center justify-between gap-4 p-5"><div><b className="text-blue-950">下一步：生成 8D 报告</b><p className="mt-1 text-sm text-blue-800">报告会继承事件、分析摘要和工程师已确认结论，继续完成 D1–D8。</p></div><Button asChild className="bg-blue-700 hover:bg-blue-800"><Link href={`/quality/report?analysisId=${analysis.id}`}>进入 8D 工作台<ChevronRight size={16} /></Link></Button></CardContent></Card>
      </>}

    </>}
  </>;
}
