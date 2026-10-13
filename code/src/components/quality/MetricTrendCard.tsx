'use client';

import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Row = Record<string, unknown>;
export const metricLabels: Record<string,string> = { outer_diameter:'外径', min_wall_thickness:'壁厚', ovality:'不圆度' };
const metricValueKeys: Record<string,string> = { outer_diameter:'outer_diameter_mm', min_wall_thickness:'min_wall_thickness_mm', ovality:'ovality_mm' };
/** 指标在产品规格上对应的限值列。不圆度规格只维护上限，所以只画一条线。 */
const metricLimitColumns: Record<string,{ upper:string; upperLabel:string; lower?:string; lowerLabel?:string }> = {
  outer_diameter: { lower:'outer_lower_mm', lowerLabel:'最小外径', upper:'outer_upper_mm', upperLabel:'最大外径' },
  min_wall_thickness: { lower:'wall_lower_mm', lowerLabel:'最小壁厚', upper:'wall_upper_mm', upperLabel:'最大壁厚' },
  ovality: { upper:'ovality_upper_mm', upperLabel:'不圆度上限' },
};
const UPPER_LINE_COLOR = '#dc2626';
const LOWER_LINE_COLOR = '#7c3aed';
const DEFAULT_METRIC = 'min_wall_thickness';

/** 由预警事件换算出的聚焦条件：进入诊断页时图表直接定位到该事件的指标、规格与批次。 */
export type MetricTrendFocus = { metricCode?: string; specName?: string; batchNo?: string };

export function MetricTrendCard({ measurements, focus }: { measurements: Row[]; focus?: MetricTrendFocus }) {
  const focusMetric = focus?.metricCode && metricLabels[focus.metricCode] ? focus.metricCode : DEFAULT_METRIC;
  const [metric,setMetric]=useState(focusMetric);
  const specOptions=useMemo(()=>{
    const map=new Map<string,string>();
    for(const row of measurements){ const id=String(row.spec_id??''); if(id&&id!=='undefined'&&!map.has(id)) map.set(id,String(row.spec_name??id)); }
    return [...map.entries()].map(([value,label])=>({value,label}));
  },[measurements]);
  /** 事件所属规格优先，找不到时回落到第一个规格。 */
  const [spec,setSpec]=useState(()=>specOptions.find(option=>option.label===focus?.specName)?.value??'');
  const [batch,setBatch]=useState(focus?.batchNo??'');
  const activeSpec=specOptions.some(option=>option.value===spec)?spec:(specOptions[0]?.value??'');
  const specRows=useMemo(()=>measurements.filter(row=>String(row.spec_id??'')===activeSpec),[measurements,activeSpec]);
  /** 产品数据按检验时间升序返回，倒序后第一条即最新批次；默认停留在事件所属批次。 */
  const batches=useMemo(()=>[...new Set(specRows.map(row=>String(row.batch_no)))].reverse(),[specRows]);
  const activeBatch=batches.includes(batch)?batch:(batches[0]??'');
  const filtered=useMemo(()=>specRows.filter(row=>row.batch_no===activeBatch),[specRows,activeBatch]);
  const changeSpec=(value:string)=>{setSpec(value);setBatch('')};
  const chartData=useMemo(()=>filtered.map(row=>({time:String(row.inspect_time).slice(5,16).replace('T',' '), batch:row.batch_no, value:Number(row[metricValueKeys[metric] ?? 'min_wall_thickness_mm'])})),[filtered,metric]);
  /** 取当前视图内各规格的最大/最小值，作为判定区间的两条虚线；视图内有多个规格时分别成组绘制。 */
  const specLimits=useMemo(()=>{
    const config=metricLimitColumns[metric]; const lines:{key:string;value:number;text:string;color:string}[]=[];
    if(!config) return lines;
    const specs=new Map<string,Row>();
    for(const row of filtered){ const name=String(row.spec_name??''); if(!specs.has(name)) specs.set(name,row); }
    const prefixFor=(name:string)=>specs.size>1&&name?`${name} `:'';
    for(const [name,row] of specs){
      const upper=row[config.upper];
      if(upper!=null&&Number.isFinite(Number(upper))){ const value=Number(upper); lines.push({key:`${name}-upper`,value,text:`${prefixFor(name)}${config.upperLabel} ${value.toFixed(3)}`,color:UPPER_LINE_COLOR}); }
      const lower=config.lower?row[config.lower]:null;
      if(lower!=null&&Number.isFinite(Number(lower))){ const value=Number(lower); lines.push({key:`${name}-lower`,value,text:`${prefixFor(name)}${config.lowerLabel??'最小值'} ${value.toFixed(3)}`,color:LOWER_LINE_COLOR}); }
    }
    return lines;
  },[filtered,metric]);
  /** Y轴范围同时容纳数据点与规格限值，避免区间虚线被裁掉。 */
  const yDomain=useMemo<[number,number]|undefined>(()=>{
    const values=[...chartData.map(item=>item.value),...specLimits.map(line=>line.value)].filter(value=>Number.isFinite(value));
    if(!values.length) return undefined;
    const min=Math.min(...values); const max=Math.max(...values); const pad=(max-min||Math.abs(max)||1)*0.12;
    return [min-pad,max+pad];
  },[chartData,specLimits]);
  const focused=Boolean(focus?.metricCode)&&focus?.metricCode===metric;
  return <Card className="mb-5 border-slate-200 shadow-sm"><CardHeader className="flex-row items-center justify-between gap-3"><div><CardTitle className="text-base">质量指标趋势</CardTitle><p className="mt-1 text-xs text-slate-500">数据取自产品数据；虚线为当前规格的最大/最小值，不圆度仅上限{focused?<span className="ml-1 font-medium text-amber-700">· 已定位事件异常指标「{metricLabels[metric]}」</span>:null}</p></div><div className="flex flex-wrap justify-end gap-2"><Select value={activeSpec} onValueChange={changeSpec}><SelectTrigger className="w-44"><SelectValue placeholder="产品规格"/></SelectTrigger><SelectContent>{specOptions.map(option=><SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select><Select value={metric} onValueChange={setMetric}><SelectTrigger className={`w-28 ${focused?'border-amber-400 text-amber-700':''}`}><SelectValue/></SelectTrigger><SelectContent>{Object.entries(metricLabels).map(([value,label])=><SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select><Select value={activeBatch} onValueChange={setBatch}><SelectTrigger className="w-32"><SelectValue placeholder="批次"/></SelectTrigger><SelectContent>{batches.map(value=><SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div></CardHeader><CardContent className="h-[330px]">
    <ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{left:10,right:20,top:10,bottom:15}}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="time" tick={{fontSize:11}} angle={-25} textAnchor="end" height={55}/><YAxis domain={yDomain} tick={{fontSize:11}} unit=" mm"/><Tooltip formatter={(value)=>[`${Number(value).toFixed(3)} mm`,metricLabels[metric]]}/><Legend/><Line name={metricLabels[metric]} type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={{r:3}}/>{specLimits.map(line=><ReferenceLine key={line.key} y={line.value} stroke={line.color} strokeDasharray="5 5" label={{value:line.text,fontSize:10,fill:line.color}}/>)}</LineChart></ResponsiveContainer>
  </CardContent></Card>;
}
