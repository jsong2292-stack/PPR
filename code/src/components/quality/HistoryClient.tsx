'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ChevronRight, FileText, Loader2, PencilLine, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { metricLabels } from './MetricTrendCard';
import { PageHeader } from './PageHeader';

type Row = Record<string, unknown>;

const riskLabels: Record<string, string> = { normal: '正常', medium: '中风险', high: '高风险', error: '数据核对' };
const riskStyles: Record<string, string> = {
  normal: 'bg-emerald-50 text-emerald-700',
  medium: 'bg-amber-50 text-amber-700',
  high: 'bg-red-50 text-red-700',
  error: 'bg-violet-50 text-violet-700',
};

/** MySQL DATETIME 经 JSON 序列化后是 ISO 字符串；统一裁到分钟，避免各页面显示口径不一致。 */
function formatTime(value: unknown) {
  const text = typeof value === 'string' ? value : value instanceof Date ? value.toISOString() : '';
  return text ? text.replace('T', ' ').slice(0, 16) : '—';
}

/**
 * 历史分析：一条 8D 报告就是一条历史记录，状态只有草稿与归档两种。
 * 列表不再展示归档快照，而是直接指向原始 8D 报告页（/quality/report?analysisId=），
 * 点进去即可沿用同一套编辑、保存与归档能力。
 */
export function HistoryClient() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetch('/api/quality/history')
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setRows(json.data || []);
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : '加载历史分析失败'))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(
    () => rows.filter((row) => JSON.stringify(row).toLowerCase().includes(query.trim().toLowerCase())),
    [rows, query],
  );
  const drafts = rows.filter((row) => row.status !== 'finalized').length;
  const finalized = rows.length - drafts;
  const open = (row: Row) => router.push(`/quality/report?analysisId=${String(row.analysis_id)}`);

  return <>
    <PageHeader title="历史分析" description="8D 报告的历史记录：草稿可继续完善，归档报告也可打开修改；点击记录进入原始 8D 报告页。" />
    <div className="mb-5 grid gap-4 sm:grid-cols-3">
      <Card className="border-slate-200"><CardContent className="p-5"><span className="text-sm text-slate-500">全部记录</span><b className="mt-1 block text-3xl">{rows.length}</b></CardContent></Card>
      <Card className="border-slate-200"><CardContent className="p-5"><span className="text-sm text-slate-500">草稿</span><b className="mt-1 block text-3xl text-amber-600">{drafts}</b></CardContent></Card>
      <Card className="border-slate-200"><CardContent className="p-5"><span className="text-sm text-slate-500">已归档</span><b className="mt-1 block text-3xl text-emerald-600">{finalized}</b></CardContent></Card>
    </div>

    <Card className="mb-4 border-slate-200"><CardContent className="p-4"><div className="relative w-full"><Search className="absolute left-3 top-2.5 text-slate-400" size={16}/><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="按报告编号、标题、异常事件、批次、产品规格或负责人搜索"/></div></CardContent></Card>

    <Card className="border-slate-200 shadow-sm">
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Archive size={17}/>8D 报告记录</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>报告编号 / 标题</TableHead>
              <TableHead>异常事件 / 批次</TableHead>
              <TableHead>产品规格 / 异常指标</TableHead>
              <TableHead>风险级别</TableHead>
              <TableHead>负责人</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>最近更新</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={8} className="h-40 text-center"><Loader2 className="mx-auto animate-spin text-blue-700"/></TableCell></TableRow>
              : visible.length ? visible.map((row) => {
                const isFinalized = row.status === 'finalized';
                return <TableRow key={String(row.id)} className="cursor-pointer hover:bg-slate-50" onClick={() => open(row)}>
                  <TableCell className="max-w-72 whitespace-normal">
                    <b className="font-mono text-xs text-blue-700">{String(row.report_no)}</b>
                    <span className="mt-1 block text-sm font-medium text-slate-900">{String(row.title || '—')}</span>
                  </TableCell>
                  <TableCell>
                    <b className="font-mono text-xs">{String(row.event_no)}</b>
                    <span className="mt-1 block text-xs text-slate-500">批次 {String(row.batch_no)}</span>
                  </TableCell>
                  <TableCell className="max-w-56 whitespace-normal">
                    <span className="text-sm text-slate-900">{String(row.spec_name || '—')}</span>
                    <span className="mt-1 block text-xs text-slate-500">{metricLabels[String(row.metric_code)] || String(row.metric_code)}</span>
                  </TableCell>
                  <TableCell><Badge className={riskStyles[String(row.risk_level)] || 'bg-slate-100 text-slate-600'}>{riskLabels[String(row.risk_level)] || String(row.risk_level || '—')}</Badge></TableCell>
                  <TableCell className="text-sm text-slate-700">{String(row.owner_name || '—')}</TableCell>
                  <TableCell>{isFinalized
                    ? <Badge className="bg-emerald-100 text-emerald-700">归档</Badge>
                    : <Badge className="bg-amber-100 text-amber-700">草稿</Badge>}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-slate-500">
                    {formatTime(row.updated_at)}
                    {isFinalized && <span className="mt-1 block">归档于 {formatTime(row.finalized_at)}</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" className="text-blue-700 hover:bg-blue-50" onClick={(event) => { event.stopPropagation(); open(row); }}>
                      {isFinalized ? <FileText size={14}/> : <PencilLine size={14}/>}
                      {isFinalized ? '查看编辑' : '继续编辑'}
                      <ChevronRight size={14}/>
                    </Button>
                  </TableCell>
                </TableRow>;
              })
              : <TableRow><TableCell colSpan={8} className="h-40 text-center text-slate-500">暂无历史记录。在诊断页生成 8D 报告并保存草稿或归档后，记录会自动出现在这里。</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </>;
}
