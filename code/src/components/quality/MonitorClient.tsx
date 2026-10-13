'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleGauge, FileSearch, Loader2, RefreshCw, ScanSearch } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { metricLabels } from './MetricTrendCard';
import { PageHeader } from './PageHeader';

type Row = Record<string, unknown>;
const riskStyles: Record<string,string> = { normal:'bg-emerald-50 text-emerald-700', medium:'bg-amber-50 text-amber-700', high:'bg-red-50 text-red-700', error:'bg-violet-50 text-violet-700' };
const riskLabels: Record<string,string> = { normal:'正常', medium:'中风险', high:'高风险', error:'数据核对' };
const statusLabels: Record<string,string> = { open:'待分析', analyzing:'分析中', closed:'已关闭' };

export function MonitorClient() {
  const [data, setData] = useState<{ alerts: Row[]; measurements: Row[]; readings: Row[]; stats: Row }>({ alerts:[], measurements:[], readings:[], stats:{} });
  const [loading,setLoading]=useState(true); const [scanning,setScanning]=useState(false); const [alertTab,setAlertTab]=useState('abnormal');
  const load=useCallback(async()=>{setLoading(true);try{const res=await fetch('/api/quality/dashboard');const json=await res.json();if(!res.ok)throw new Error(json.error);setData(json);}catch(e){toast.error(e instanceof Error?e.message:'加载失败')}finally{setLoading(false)}},[]);
  useEffect(()=>{load()},[load]);
  /** 队列分两个页签：异常（中/高风险）默认展示，正常记录收在第二个页签里备查。 */
  const abnormalAlerts=useMemo(()=>data.alerts.filter(row=>String(row.risk_level)!=='normal'),[data.alerts]);
  const normalAlerts=useMemo(()=>data.alerts.filter(row=>String(row.risk_level)==='normal'),[data.alerts]);
  const visibleAlerts=alertTab==='normal'?normalAlerts:abnormalAlerts;
  const scan=async()=>{setScanning(true);try{const res=await fetch('/api/quality/alerts/evaluate',{method:'POST'});const json=await res.json();if(!res.ok)throw new Error(json.error);toast.success(`扫描完成：高风险 ${json.high} / 中风险 ${json.medium} / 正常 ${json.normal}`);await load()}catch(e){toast.error(e instanceof Error?e.message:'扫描失败')}finally{setScanning(false)}};
  if(loading)return <div className="grid h-96 place-items-center"><Loader2 className="animate-spin text-blue-700"/></div>;
  const cards=[['检验记录',data.stats.measurement_count,FileSearch,'text-blue-700 bg-blue-50'],['待处理预警',data.stats.open_alert_count,AlertTriangle,'text-amber-700 bg-amber-50'],['高风险预警',data.stats.high_alert_count,CircleGauge,'text-red-700 bg-red-50'],['已定稿报告',data.stats.finalized_report_count,CheckCircle2,'text-emerald-700 bg-emerald-50']] as const;
  return <>
    <PageHeader title="质量监控与预警" description="汇总产品检验与设备采集数据，导入后自动按产品规格的标准区间判定异常，并将事件送入诊断流程。" actions={<><Button variant="outline" onClick={load}><RefreshCw size={16}/>刷新数据</Button><Button onClick={scan} disabled={scanning} className="bg-blue-700 hover:bg-blue-800">{scanning?<Loader2 className="animate-spin" size={16}/>:<ScanSearch size={16}/>}重新扫描</Button></>} />
    <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label,value,Icon,color])=><Card key={label} className="border-slate-200 shadow-sm"><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-slate-500">{label}</p><b className="mt-1 block text-3xl text-slate-950">{String(value??0)}</b></div><span className={`grid h-11 w-11 place-items-center rounded-xl ${color}`}><Icon size={21}/></span></CardContent></Card>)}</div>
    <Card className="border-slate-200 shadow-sm"><CardHeader className="flex-row items-center justify-between gap-3"><div><CardTitle className="text-base">预警事件队列</CardTitle><p className="mt-1 text-xs text-slate-500">产品数据导入或改动后自动判定：超出标准区间为高风险，连续 3 点进入接近带（区间宽度的 15%）为中风险</p></div><Tabs value={alertTab} onValueChange={setAlertTab}><TabsList><TabsTrigger value="abnormal">异常事件 {abnormalAlerts.length}</TabsTrigger><TabsTrigger value="normal">正常记录 {normalAlerts.length}</TabsTrigger></TabsList></Tabs></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>事件编号</TableHead><TableHead>风险</TableHead><TableHead>批次 / 规格</TableHead><TableHead>指标</TableHead><TableHead>判定规则</TableHead><TableHead>观测值</TableHead><TableHead>识别时间</TableHead><TableHead>状态</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{visibleAlerts.map(row=><TableRow key={String(row.id)}><TableCell className="font-mono text-xs">{String(row.event_no)}</TableCell><TableCell><Badge className={riskStyles[String(row.risk_level)]}>{riskLabels[String(row.risk_level)]}</Badge></TableCell><TableCell><b>{String(row.batch_no)}</b><br/><span className="text-xs text-slate-500">{String(row.spec_name)}</span></TableCell><TableCell>{metricLabels[String(row.metric_code)]||String(row.metric_code)}</TableCell><TableCell className="max-w-52"><b className="text-slate-700">{String(row.rule_code)} · {String(row.rule_name)}</b><br/><span className="text-xs text-slate-500">{String(row.threshold_text||'')}</span></TableCell><TableCell className="font-mono">{String(row.observed_value??'—')} mm</TableCell><TableCell className="whitespace-nowrap text-xs">{String(row.detected_at).replace('T',' ').replace(/\.000Z$/,'').slice(0,16)}</TableCell><TableCell>{statusLabels[String(row.status)]||String(row.status)}</TableCell><TableCell className="text-right">{String(row.risk_level)==='normal'?<span className="text-xs text-slate-400">无需处理</span>:<Button asChild size="sm" variant="outline"><Link href={`/quality/diagnosis?alertId=${row.id}`}>进入诊断</Link></Button>}</TableCell></TableRow>)}{!visibleAlerts.length&&<TableRow><TableCell colSpan={9} className="py-10 text-center text-sm text-slate-500">{alertTab==='normal'?'没有判定为正常的记录':'没有异常事件，产品数据全部落在标准区间内'}</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card>
  </>;
}
