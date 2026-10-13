'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Bot, Check, ChevronRight, Database, Loader2, RefreshCw, Save, Settings2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { MetricTrendCard } from './MetricTrendCard';
import { PageHeader } from './PageHeader';

type Row = Record<string, unknown>;
type AnalysisMode = 'rule' | 'agent';
type AgentStatus = { mode: AnalysisMode; configured: boolean; model: string; fallbackToRule: boolean; framework: string };

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
  const [alertId, setAlertId] = useState(search.get('alertId') || '');
  const [analysis, setAnalysis] = useState<Row | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [mode, setMode] = useState<AnalysisMode>('rule');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const loadAlerts = useCallback(async () => {
    const response = await fetch('/api/quality/dashboard');
    const json = await response.json();
    if (response.ok) {
      setAlerts(json.alerts || []);
      setMeasurements(json.measurements || []);
      if (!alertId && json.alerts?.[0]) setAlertId(String(json.alerts[0].id));
    }
  }, [alertId]);

  const loadAgentStatus = useCallback(async () => {
    const response = await fetch('/api/quality/agent/status');
    const json = await response.json();
    if (response.ok) {
      setAgentStatus(json);
      setMode(json.mode === 'agent' ? 'agent' : 'rule');
    }
  }, []);

  const loadAnalysis = useCallback(async (id: string) => {
    if (!id) { setAnalysis(null); return; }
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
    try {
      const response = await fetch('/api/quality/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alertId: Number(alertId),
          mode,
          regenerate: Boolean(analysis),
          generatedBy: '质量工程师',
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      setAnalysis(json.data);
      if (json.data?.fallback_reason) toast.warning(`Agent已降级：${json.data.fallback_reason}`);
      else toast.success(mode === 'agent' ? 'LangChain Agent分析已完成' : '规则分析已完成');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '生成失败');
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

  const selected = alerts.find((item) => String(item.id) === alertId);
  const engineType = String(analysis?.engine_type || 'rule');

  return <>
    <PageHeader
      title="异常诊断与验证"
      description="支持确定性规则引擎与LangChain Agent两种模式；所有结论均需工程师验证。"
      actions={<Button variant="outline" asChild><Link href="/quality/monitor"><ChevronRight className="rotate-180" size={16} />返回监控</Link></Button>}
    />

    <Card className="mb-5 border-slate-200 shadow-sm">
      <CardContent className="flex flex-wrap items-center gap-3 p-4">
        <Select value={alertId} onValueChange={setAlertId}>
          <SelectTrigger className="w-full max-w-xl"><SelectValue placeholder="选择预警事件" /></SelectTrigger>
          <SelectContent>{alerts.map((item) => <SelectItem key={String(item.id)} value={String(item.id)}>{String(item.event_no)} · {String(item.batch_no)} · {String(item.rule_name)}</SelectItem>)}</SelectContent>
        </Select>
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
        <Button variant="ghost" onClick={() => loadAnalysis(alertId)}><RefreshCw size={16} />刷新</Button>
      </CardContent>
    </Card>

    {agentStatus && <div className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm ${mode === 'agent' && !agentStatus.configured ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
      <div className="flex items-center gap-2"><Settings2 size={16} /><b>当前选择：{mode === 'agent' ? 'LangChain Agent' : '规则引擎'}</b><span>· 系统默认 {agentStatus.mode === 'agent' ? 'Agent' : '规则'}</span></div>
      <span>{mode === 'agent' ? (agentStatus.configured ? `模型 ${agentStatus.model} · ${agentStatus.framework}` : `未配置API密钥${agentStatus.fallbackToRule ? '，将自动降级规则模式' : ''}`) : '确定性规则和模板，不调用大模型'}</span>
    </div>}

    {selected && <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[['预警事件', selected.event_no], ['生产批次', selected.batch_no], ['触发规则', `${selected.rule_code} · ${selected.rule_name}`], ['观测值', `${selected.observed_value ?? '—'} mm`]].map(([label, value]) =>
        <Card key={String(label)} className="border-slate-200 shadow-sm"><CardContent className="p-4"><span className="text-xs text-slate-500">{String(label)}</span><b className="mt-1 block text-sm text-slate-900">{String(value)}</b></CardContent></Card>)}
    </div>}

    {/* 趋势图跟随所选事件：key 绑定事件 id，切换事件即重置视图并自动定位到该事件的异常指标、规格与批次。 */}
    {selected && <MetricTrendCard key={alertId} measurements={measurements} focus={{ metricCode: String(selected.metric_code ?? ''), specName: String(selected.spec_name ?? ''), batchNo: String(selected.batch_no ?? '') }} />}

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
  </>;
}
