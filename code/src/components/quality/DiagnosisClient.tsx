'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Bot, Check, ChevronRight, Database, Loader2, RefreshCw, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from './PageHeader';

type Row=Record<string,unknown>;
const decisionLabels:Record<string,string>={pending:'待验证',confirmed:'已确认',rejected:'已驳回'};
const decisionStyles:Record<string,string>={pending:'bg-amber-50 text-amber-700',confirmed:'bg-emerald-50 text-emerald-700',rejected:'bg-slate-100 text-slate-600'};

export function DiagnosisClient(){
  const search=useSearchParams(); const [alerts,setAlerts]=useState<Row[]>([]); const [alertId,setAlertId]=useState(search.get('alertId')||''); const [analysis,setAnalysis]=useState<Row|null>(null); const [loading,setLoading]=useState(true); const [generating,setGenerating]=useState(false);
  const loadAlerts=useCallback(async()=>{const res=await fetch('/api/quality/dashboard');const json=await res.json();if(res.ok){setAlerts(json.alerts||[]);if(!alertId&&json.alerts?.[0])setAlertId(String(json.alerts[0].id));}},[alertId]);
  const loadAnalysis=useCallback(async(id:string)=>{if(!id){setAnalysis(null);return}setLoading(true);try{const res=await fetch(`/api/quality/analysis?alertId=${id}`);const json=await res.json();if(!res.ok)throw new Error(json.error);setAnalysis(json.data)}catch(e){toast.error(e instanceof Error?e.message:'加载失败')}finally{setLoading(false)}},[]);
  useEffect(()=>{loadAlerts()},[loadAlerts]); useEffect(()=>{loadAnalysis(alertId)},[alertId,loadAnalysis]);
  const generate=async()=>{if(!alertId)return toast.warning('请选择预警事件');setGenerating(true);try{const res=await fetch('/api/quality/analysis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({alertId:Number(alertId),generatedBy:'质量工程师'})});const json=await res.json();if(!res.ok)throw new Error(json.error);setAnalysis(json.data);toast.success('分析已生成并保存到数据库')}catch(e){toast.error(e instanceof Error?e.message:'生成失败')}finally{setGenerating(false)}};
  const saveConclusion=async(item:Row,decision?:string)=>{const res=await fetch('/api/quality/analysis',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({conclusionId:item.id,engineerDecision:decision||item.engineer_decision,engineerComment:item.engineer_comment||'',actualFinding:item.actual_finding||'',updatedBy:'质量工程师'})});const json=await res.json();if(!res.ok)return toast.error(json.error||'保存失败');toast.success('验证结果已保存');loadAnalysis(alertId)};
  const update=(id:unknown,key:string,value:string)=>setAnalysis(state=>state?{...state,conclusions:(state.conclusions as Row[]).map(item=>item.id===id?{...item,[key]:value}:item)}:state);
  const selected=alerts.find(item=>String(item.id)===alertId);
  return <>
    <PageHeader title="异常诊断与验证" description="将预警事件与同批次产品、设备数据关联，生成可解释的排查线索，并由工程师逐条验证。" actions={<Button variant="outline" asChild><Link href="/quality/monitor"><ChevronRight className="rotate-180" size={16}/>返回监控</Link></Button>}/>
    <Card className="mb-5 border-slate-200 shadow-sm"><CardContent className="flex flex-wrap items-center gap-3 p-4"><Select value={alertId} onValueChange={setAlertId}><SelectTrigger className="w-full max-w-xl"><SelectValue placeholder="选择预警事件"/></SelectTrigger><SelectContent>{alerts.map(item=><SelectItem key={String(item.id)} value={String(item.id)}>{String(item.event_no)} · {String(item.batch_no)} · {String(item.rule_name)}</SelectItem>)}</SelectContent></Select><Button onClick={generate} disabled={generating} className="bg-indigo-600 hover:bg-indigo-700">{generating?<Loader2 className="animate-spin" size={16}/>:<Bot size={16}/>}生成 / 重新打开分析</Button><Button variant="ghost" onClick={()=>loadAnalysis(alertId)}><RefreshCw size={16}/>刷新</Button></CardContent></Card>
    {selected&&<div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[['预警事件',selected.event_no],['生产批次',selected.batch_no],['触发规则',`${selected.rule_code} · ${selected.rule_name}`],['观测值',`${selected.observed_value??'—'} mm`]].map(([label,value])=><Card key={String(label)} className="border-slate-200 shadow-sm"><CardContent className="p-4"><span className="text-xs text-slate-500">{String(label)}</span><b className="mt-1 block text-sm text-slate-900">{String(value)}</b></CardContent></Card>)}</div>}
    {loading?<div className="grid h-64 place-items-center"><Loader2 className="animate-spin text-blue-700"/></div>:!analysis?<Card className="border-dashed border-slate-300"><CardContent className="grid h-64 place-items-center text-center"><div><Bot className="mx-auto mb-3 text-slate-400"/><b>尚未生成诊断分析</b><p className="mt-1 text-sm text-slate-500">选择事件后点击“生成分析”，系统将保存输入证据快照和待验证结论。</p></div></CardContent></Card>:<>
      <Card className="mb-5 border-indigo-200 bg-indigo-50/50 shadow-sm"><CardContent className="flex gap-3 p-5"><Bot className="mt-0.5 shrink-0 text-indigo-600"/><div><div className="flex items-center gap-2"><b className="text-indigo-950">分析摘要</b><Badge className="bg-indigo-100 text-indigo-700">规则引擎预填</Badge></div><p className="mt-2 text-sm leading-6 text-indigo-900">{String(analysis.summary)}</p><p className="mt-2 text-xs text-indigo-600">{String(analysis.run_no)} · 状态 {String(analysis.status)} · 生成于 {String(analysis.generated_at)}</p></div></CardContent></Card>
      <div className="mb-5 grid gap-4 xl:grid-cols-3">{(analysis.conclusions as Row[]).map((item,index)=><Card key={String(item.id)} className="border-slate-200 shadow-sm"><CardHeader className="border-b border-slate-100 pb-3"><div className="flex items-center justify-between gap-2"><CardTitle className="text-base">C{index+1} · {String(item.category)}</CardTitle><Badge className={decisionStyles[String(item.engineer_decision)]}>{decisionLabels[String(item.engineer_decision)]}</Badge></div></CardHeader><CardContent className="space-y-4 p-5">
        <section><Label className="text-xs text-slate-500">待验证结论</Label><p className="mt-1 text-sm font-medium leading-6 text-slate-900">{String(item.hypothesis)}</p></section>
        <section className="rounded-lg bg-slate-50 p-3"><div className="mb-1 flex items-center gap-1 text-xs font-semibold text-slate-600"><Database size={13}/>支持证据</div><p className="text-xs leading-5 text-slate-600">{String(item.evidence||'无')}</p></section>
        <section><Label className="text-xs text-slate-500">缺失证据</Label><p className="mt-1 text-xs leading-5 text-amber-700">{String(item.missing_evidence||'无')}</p></section>
        <section><Label className="text-xs text-slate-500">建议验证动作</Label><p className="mt-1 text-xs leading-5 text-blue-700">{String(item.validation_action||'无')}</p></section>
        <div><Label className="mb-2 block text-xs">实际发现</Label><Textarea value={String(item.actual_finding||'')} onChange={e=>update(item.id,'actual_finding',e.target.value)} placeholder="填写现场复核、复测或设备核查结果"/></div>
        <div><Label className="mb-2 block text-xs">工程师意见</Label><Textarea value={String(item.engineer_comment||'')} onChange={e=>update(item.id,'engineer_comment',e.target.value)} placeholder="填写判定理由"/></div>
        <div className="grid grid-cols-3 gap-2"><Button size="sm" variant="outline" onClick={()=>saveConclusion(item,'rejected')}><X size={14}/>驳回</Button><Button size="sm" variant="outline" onClick={()=>saveConclusion(item)}><Save size={14}/>保存</Button><Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={()=>saveConclusion(item,'confirmed')}><Check size={14}/>确认</Button></div>
      </CardContent></Card>)}</div>
      <Card className="border-blue-200 bg-blue-50 shadow-sm"><CardContent className="flex flex-wrap items-center justify-between gap-4 p-5"><div><b className="text-blue-950">下一步：生成 8D 报告</b><p className="mt-1 text-sm text-blue-800">报告会继承事件、分析摘要和工程师已确认结论，继续完成 D1–D8。</p></div><Button asChild className="bg-blue-700 hover:bg-blue-800"><Link href={`/quality/report?analysisId=${analysis.id}`}>进入 8D 工作台<ChevronRight size={16}/></Link></Button></CardContent></Card>
    </>}
  </>;
}
