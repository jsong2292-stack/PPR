'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleGauge, FileSearch, Loader2, RefreshCw, ScanSearch } from 'lucide-react';
import { toast } from 'sonner';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from './PageHeader';

type Row = Record<string, unknown>;
const metricLabels: Record<string,string> = { outer_diameter:'外径', min_wall_thickness:'壁厚', ovality:'不圆度' };
const riskStyles: Record<string,string> = { normal:'bg-emerald-50 text-emerald-700', medium:'bg-amber-50 text-amber-700', high:'bg-red-50 text-red-700', error:'bg-violet-50 text-violet-700' };
const riskLabels: Record<string,string> = { normal:'正常', medium:'中风险', high:'高风险', error:'数据核对' };

export function MonitorClient() {
  const [data, setData] = useState<{ alerts: Row[]; measurements: Row[]; readings: Row[]; stats: Row }>({ alerts:[], measurements:[], readings:[], stats:{} });
  const [loading,setLoading]=useState(true); const [scanning,setScanning]=useState(false); const [metric,setMetric]=useState('min_wall_thickness'); const [batch,setBatch]=useState('all');
  const load=useCallback(async()=>{setLoading(true);try{const res=await fetch('/api/quality/dashboard');const json=await res.json();if(!res.ok)throw new Error(json.error);setData(json);}catch(e){toast.error(e instanceof Error?e.message:'加载失败')}finally{setLoading(false)}},[]);
  useEffect(()=>{load()},[load]);
  const batches=useMemo(()=>[...new Set(data.measurements.map(row=>String(row.batch_no)))], [data.measurements]);
  const chartData=useMemo(()=>data.measurements.filter(row=>batch==='all'||row.batch_no===batch).map(row=>({time:String(row.inspect_time).slice(5,16).replace('T',' '), batch:row.batch_no, value:Number(row[metric === 'outer_diameter' ? 'outer_diameter_mm' : metric === 'ovality' ? 'ovality_mm' : 'min_wall_thickness_mm'])})),[data.measurements,batch,metric]);
  const selectedAlert=data.alerts.find(row=>String(row.metric_code)===metric); const limits=selectedAlert ? (metric==='outer_diameter'?[Number(selectedAlert.outer_lower_mm),Number(selectedAlert.outer_upper_mm)]:metric==='ovality'?[0,Number(selectedAlert.ovality_upper_mm)]:[Number(selectedAlert.wall_lower_mm),Number(selectedAlert.wall_upper_mm)]) : [];
  const scan=async()=>{setScanning(true);try{const res=await fetch('/api/quality/alerts/evaluate',{method:'POST'});const json=await res.json();if(!res.ok)throw new Error(json.error);toast.success(`扫描完成，新增 ${json.created} 条预警`);await load()}catch(e){toast.error(e instanceof Error?e.message:'扫描失败')}finally{setScanning(false)}};
  if(loading)return <div className="grid h-96 place-items-center"><Loader2 className="animate-spin text-blue-700"/></div>;
  const cards=[['检验记录',data.stats.measurement_count,FileSearch,'text-blue-700 bg-blue-50'],['待处理预警',data.stats.open_alert_count,AlertTriangle,'text-amber-700 bg-amber-50'],['高风险预警',data.stats.high_alert_count,CircleGauge,'text-red-700 bg-red-50'],['已定稿报告',data.stats.finalized_report_count,CheckCircle2,'text-emerald-700 bg-emerald-50']] as const;
  return <>
    <PageHeader title="质量监控与预警" description="汇总产品检验与设备采集数据，按演示规则识别异常，并将事件送入诊断流程。" actions={<><Button variant="outline" onClick={load}><RefreshCw size={16}/>刷新数据</Button><Button onClick={scan} disabled={scanning} className="bg-blue-700 hover:bg-blue-800">{scanning?<Loader2 className="animate-spin" size={16}/>:<ScanSearch size={16}/>}重新扫描</Button></>} />
    <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label,value,Icon,color])=><Card key={label} className="border-slate-200 shadow-sm"><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-slate-500">{label}</p><b className="mt-1 block text-3xl text-slate-950">{String(value??0)}</b></div><span className={`grid h-11 w-11 place-items-center rounded-xl ${color}`}><Icon size={21}/></span></CardContent></Card>)}</div>
    <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,.5fr)]">
      <Card className="border-slate-200 shadow-sm"><CardHeader className="flex-row items-center justify-between gap-3"><div><CardTitle className="text-base">质量指标趋势</CardTitle><p className="mt-1 text-xs text-slate-500">演示限值仅用于排查提示</p></div><div className="flex gap-2"><Select value={metric} onValueChange={setMetric}><SelectTrigger className="w-36"><SelectValue/></SelectTrigger><SelectContent>{Object.entries(metricLabels).map(([value,label])=><SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select><Select value={batch} onValueChange={setBatch}><SelectTrigger className="w-36"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">全部批次</SelectItem>{batches.map(value=><SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div></CardHeader><CardContent className="h-[330px]">
        <ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{left:10,right:20,top:10,bottom:15}}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="time" tick={{fontSize:11}} angle={-25} textAnchor="end" height={55}/><YAxis domain={['auto','auto']} tick={{fontSize:11}} unit=" mm"/><Tooltip formatter={(value)=>[`${Number(value).toFixed(3)} mm`,metricLabels[metric]]}/><Legend/><Line name={metricLabels[metric]} type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={{r:3}}/>{limits.map((value,index)=><ReferenceLine key={index} y={value} stroke="#dc2626" strokeDasharray="5 5" label={{value:index?'演示上限':'演示下限',fontSize:10,fill:'#dc2626'}}/>)}</LineChart></ResponsiveContainer>
      </CardContent></Card>
      <Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-base">数据关联说明</CardTitle></CardHeader><CardContent className="space-y-3 text-sm leading-6 text-slate-600"><div className="rounded-lg bg-blue-50 p-3 text-blue-800"><b>关联主键</b><br/>产品数据与设备数据按“批次号 + 时间窗口”关联。</div><div className="rounded-lg bg-amber-50 p-3 text-amber-800"><b>规则边界</b><br/>限值、趋势点数及时间窗口均为演示策略，需现场校准。</div><div className="rounded-lg bg-slate-50 p-3"><b>当前数据量</b><br/>产品记录 {data.measurements.length} 条，设备记录 {data.readings.length} 条。</div></CardContent></Card>
    </div>
    <Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-base">预警事件队列</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>事件编号</TableHead><TableHead>风险</TableHead><TableHead>批次 / 规格</TableHead><TableHead>异常指标</TableHead><TableHead>触发规则</TableHead><TableHead>观测值</TableHead><TableHead>识别时间</TableHead><TableHead>状态</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{data.alerts.map(row=><TableRow key={String(row.id)}><TableCell className="font-mono text-xs">{String(row.event_no)}</TableCell><TableCell><Badge className={riskStyles[String(row.risk_level)]}>{riskLabels[String(row.risk_level)]}</Badge></TableCell><TableCell><b>{String(row.batch_no)}</b><br/><span className="text-xs text-slate-500">{String(row.spec_name)}</span></TableCell><TableCell>{metricLabels[String(row.metric_code)]||String(row.metric_code)}</TableCell><TableCell className="max-w-52"><b className="text-slate-700">{String(row.rule_code)} · {String(row.rule_name)}</b><br/><span className="text-xs text-slate-500">{String(row.threshold_text||'')}</span></TableCell><TableCell className="font-mono">{String(row.observed_value??'—')} mm</TableCell><TableCell className="whitespace-nowrap text-xs">{String(row.detected_at).replace('T',' ').replace(/\.000Z$/,'').slice(0,16)}</TableCell><TableCell>{String(row.status)}</TableCell><TableCell className="text-right"><Button asChild size="sm" variant="outline"><Link href={`/quality/diagnosis?alertId=${row.id}`}>进入诊断</Link></Button></TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card>
  </>;
}
