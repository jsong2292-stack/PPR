'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Download, FileText, Loader2, Printer, Save, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from './PageHeader';

type Row=Record<string,unknown>;
const names:Record<string,string>={d1:'组建团队',d2:'问题描述',d3:'临时围堵措施',d4:'根因分析与验证',d5:'永久纠正措施选择',d6:'永久纠正措施实施与验证',d7:'预防再发生',d8:'团队表彰与结案'};

export function ReportClient(){
  const analysisId=Number(useSearchParams().get('analysisId')); const [report,setReport]=useState<Row|null>(null); const [loading,setLoading]=useState(Boolean(analysisId)); const [saving,setSaving]=useState(false);
  const load=useCallback(async()=>{if(!analysisId)return;setLoading(true);try{let res=await fetch(`/api/quality/reports?analysisId=${analysisId}`);let json=await res.json();if(!json.data){res=await fetch('/api/quality/reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({analysisId,ownerName:'质量工程师'})});json=await res.json()}if(!res.ok)throw new Error(json.error);setReport(json.data)}catch(e){toast.error(e instanceof Error?e.message:'加载失败')}finally{setLoading(false)}},[analysisId]);
  useEffect(()=>{load()},[load]);
  const update=(key:string,value:string)=>setReport(state=>state?{...state,[key]:value}:state);
  const save=async(finalize=false)=>{if(!report)return;setSaving(true);try{const res=await fetch('/api/quality/reports',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...report,finalize})});const json=await res.json();if(!res.ok)throw new Error(json.error);setReport(json.data);toast.success(finalize?'报告已定稿并归档':'草稿已保存')}catch(e){toast.error(e instanceof Error?e.message:'保存失败')}finally{setSaving(false)}};
  const exportHtml=()=>{if(!report)return;const sections=Object.entries(names).map(([key,name])=>`<section><h2>${key.toUpperCase()} · ${name}</h2><p>${String(report[key]||'').replace(/\n/g,'<br>')}</p></section>`).join('');const html=`<!doctype html><meta charset="utf-8"><title>${report.title}</title><style>body{font-family:Arial,'Microsoft YaHei';max-width:900px;margin:40px auto;color:#172033}h1{border-bottom:2px solid #1d4ed8;padding-bottom:16px}section{border:1px solid #ddd;margin:16px 0;padding:18px}h2{font-size:17px;color:#1d4ed8}p{line-height:1.8}</style><h1>${report.title}</h1><p>报告编号：${report.report_no}　批次：${report.batch_no}　状态：${report.status}</p>${sections}`;const url=URL.createObjectURL(new Blob([html],{type:'text/html'}));const a=document.createElement('a');a.href=url;a.download=`${report.report_no}.html`;a.click();URL.revokeObjectURL(url)};
  if(!analysisId)return <><PageHeader title="8D 报告工作台" description="从异常诊断页进入后，系统会继承已确认结论并生成报告草稿。"/><Card className="border-dashed"><CardContent className="grid h-72 place-items-center text-center"><div><FileText className="mx-auto mb-3 text-slate-400"/><b>请先完成异常诊断</b><p className="mt-1 text-sm text-slate-500">在诊断页面选择事件、生成分析并进入8D工作台。</p><Button asChild className="mt-4 bg-blue-700"><Link href="/quality/diagnosis">前往异常诊断</Link></Button></div></CardContent></Card></>;
  if(loading||!report)return <div className="grid h-96 place-items-center"><Loader2 className="animate-spin text-blue-700"/></div>;
  const finalized=report.status==='finalized'; const missing=Object.keys(names).filter(key=>!String(report[key]||'').trim());
  return <>
    <PageHeader title="8D 报告工作台" description="继承诊断结论，完成工程师编辑、校验、定稿与历史归档。" actions={<Badge className={finalized?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}>{finalized?'已定稿':'草稿'}</Badge>}/>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="border-slate-200 shadow-sm"><CardHeader className="border-b border-slate-200"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-xl">{String(report.title)}</CardTitle><p className="mt-2 font-mono text-xs text-slate-500">{String(report.report_no)} · {String(report.event_no)}</p></div><Badge className="bg-indigo-50 text-indigo-700">AI预填 + 人工确认</Badge></div><div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><span className="text-xs text-slate-500">产品规格</span><b className="block">{String(report.spec_name)}</b></div><div><span className="text-xs text-slate-500">生产批次</span><b className="block">{String(report.batch_no)}</b></div><div><span className="text-xs text-slate-500">异常指标</span><b className="block">{String(report.metric_code)}</b></div><div><span className="text-xs text-slate-500">风险级别</span><b className="block">{String(report.risk_level)}</b></div></div></CardHeader><CardContent className="divide-y divide-slate-200 p-0">{Object.entries(names).map(([key,name])=><section key={key} className="grid gap-4 p-5 lg:grid-cols-[180px_minmax(0,1fr)]"><div><b className="text-lg text-blue-700">{key.toUpperCase()}</b><p className="text-sm font-medium text-slate-700">{name}</p><span className="mt-2 block text-xs text-slate-400">{['d1','d2','d3','d4'].includes(key)?'系统预填，工程师确认':'工程师负责填写'}</span></div><div><Label className="sr-only">{name}</Label><Textarea disabled={finalized} value={String(report[key]||'')} onChange={e=>update(key,e.target.value)} className="min-h-32 leading-6" placeholder={`填写${name}`}/></div></section>)}</CardContent></Card>
      <aside className="space-y-4"><Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-base">定稿检查</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex items-center gap-2 text-emerald-700"><CheckCircle2 size={16}/>基本信息已继承</div><div className={`flex items-center gap-2 ${missing.length?'text-amber-700':'text-emerald-700'}`}><ShieldCheck size={16}/>{missing.length?`${missing.length} 项内容待补充`:'D1–D8 已完整'}</div><div className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">定稿会关闭预警、完成分析任务并写入历史归档。正式系统可在此接入审批流。</div></CardContent></Card>
        <Button className="w-full bg-blue-700 hover:bg-blue-800" disabled={saving||finalized} onClick={()=>save(false)}>{saving?<Loader2 className="animate-spin" size={16}/>:<Save size={16}/>}保存草稿</Button>
        <Button className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={saving||finalized} onClick={()=>save(true)}><ShieldCheck size={16}/>确认定稿并归档</Button>
        <Button className="w-full" variant="outline" onClick={exportHtml}><Download size={16}/>导出 HTML</Button>
        <Button className="w-full" variant="outline" onClick={()=>window.print()}><Printer size={16}/>打印 / PDF</Button>
        <Button className="w-full" variant="ghost" asChild><Link href={`/quality/diagnosis?alertId=${report.alert_id}`}>返回诊断</Link></Button>
      </aside>
    </div>
  </>;
}
