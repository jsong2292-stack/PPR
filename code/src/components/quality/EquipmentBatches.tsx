'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, Loader2, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BATCH_LINK_LABEL, type BatchLinkField, type ReadingFieldMeta } from '@/lib/quality-equipment';
import { PageHeader } from './PageHeader';

type Row = Record<string, unknown>;

interface EquipmentInfo {
  id: number;
  code: string;
  name: string;
  type_name: string;
  type_code: string;
  line_name: string;
}

const batchStatusLabels: Record<string, string> = { running: '生产中', completed: '已完成', paused: '暂停' };
const batchStatusOptions = [
  { label: '生产中', value: 'running' },
  { label: '已完成', value: 'completed' },
  { label: '暂停', value: 'paused' },
];

function displayDateTime(value: unknown): string {
  if (value == null || value === '') return '—';
  return String(value).replace('T', ' ').replace(/\.000Z$/, '').slice(0, 16);
}

/**
 * 设备台账第二级：某台设备下的生产批次列表。
 * 批次来源是批次表上的挤出机 / 牵引机字段（由设备类型决定），点进批次看该设备的采集项。
 */
export function EquipmentBatches({ equipmentId }: { equipmentId: number }) {
  const [equipment, setEquipment] = useState<EquipmentInfo | null>(null);
  const [batches, setBatches] = useState<Row[]>([]);
  const [dataColumns, setDataColumns] = useState<ReadingFieldMeta[]>([]);
  const [batchLinkField, setBatchLinkField] = useState<BatchLinkField | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [specOptions, setSpecOptions] = useState<{ label: string; value: string }[]>([]);
  const [form, setForm] = useState<Record<string, string>>({ status: 'completed' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/quality/equipment/${equipmentId}/batches`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '加载失败');
      setEquipment(json.equipment);
      setBatches(json.batches || []);
      setDataColumns(json.dataColumns || []);
      setBatchLinkField(json.batchLinkField ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [equipmentId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    // 新增批次时选产品规格；复用主数据接口，取 id 作值、name 作显示。
    fetch('/api/quality/master/specs')
      .then((res) => res.json())
      .then((json) => setSpecOptions((json.data || []).map((item: Row) => ({ label: String(item.name), value: String(item.id) }))))
      .catch(() => undefined);
  }, []);

  const showEditor = () => { setForm({ status: 'completed' }); setOpen(true); };

  const save = async () => {
    if (!form.batch_no?.trim()) return toast.warning('请填写批次号');
    if (!form.spec_id) return toast.warning('请选择产品规格');
    if (!form.production_group?.trim()) return toast.warning('请填写生产组别');
    if (!form.start_time) return toast.warning('请填写生产开始时间');
    setSaving(true);
    try {
      const res = await fetch(`/api/quality/equipment/${equipmentId}/batches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '新增失败');
      toast.success('批次已新增');
      setOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '新增失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="grid h-96 place-items-center"><Loader2 className="animate-spin text-blue-700" /></div>;
  if (!equipment) return <Card className="border-slate-200 shadow-sm"><CardContent className="p-8 text-center text-slate-500">设备不存在或已被删除。<div className="mt-4"><Button asChild variant="outline"><Link href="/quality/data/equipment"><ArrowLeft size={16} />返回设备台账</Link></Button></div></CardContent></Card>;

  const linkLabel = batchLinkField ? BATCH_LINK_LABEL[batchLinkField] : null;

  return <>
    <PageHeader
      title={`${equipment.name} · 生产批次`}
      description={`${equipment.type_name} · ${equipment.line_name} · 设备编码 ${equipment.code}${dataColumns.length ? ` · 采集项：${dataColumns.map((column) => column.columnLabel).join('、')}` : ''}`}
      actions={<>
        <Button asChild variant="outline"><Link href="/quality/data/equipment"><ArrowLeft size={16} />返回设备台账</Link></Button>
        <Button variant="outline" onClick={load}><RefreshCw size={16} />刷新</Button>
        {batchLinkField && <Button onClick={showEditor} className="bg-blue-700 hover:bg-blue-800"><Plus size={16} />新增批次</Button>}
      </>}
    />

    {!batchLinkField && (
      <Card className="mb-4 border-amber-200 bg-amber-50 shadow-sm">
        <CardContent className="p-4 text-sm text-amber-800">
          「{equipment.type_name}」既不是挤出机也不是牵引机，无法关联生产批次；本设备只提供采集项查看。
        </CardContent>
      </Card>
    )}

    <Card className="gap-0 border-slate-200 py-0 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <div className="text-sm text-slate-600">
          {linkLabel ? `批次表按「${linkLabel}」关联本设备` : '当前设备类型无批次关联字段'}
        </div>
        <div className="text-sm text-slate-500">共 {batches.length} 个批次</div>
      </div>
      <CardContent className="p-4">
        <Table>
          <TableHeader><TableRow>
            <TableHead className="whitespace-nowrap">批次号</TableHead>
            <TableHead className="whitespace-nowrap">产品规格</TableHead>
            <TableHead className="whitespace-nowrap">生产组别</TableHead>
            <TableHead className="whitespace-nowrap">开始时间</TableHead>
            <TableHead className="whitespace-nowrap">结束时间</TableHead>
            <TableHead className="whitespace-nowrap">状态</TableHead>
            <TableHead className="whitespace-nowrap">采集条数</TableHead>
            <TableHead className="whitespace-nowrap text-right">操作</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {batches.length ? batches.map((row) => (
              <TableRow key={String(row.id)}>
                <TableCell className="whitespace-nowrap font-medium">{String(row.batch_no)}</TableCell>
                <TableCell className="whitespace-nowrap">{String(row.spec_name ?? '—')}</TableCell>
                <TableCell className="whitespace-nowrap">{String(row.production_group ?? '—')}</TableCell>
                <TableCell className="whitespace-nowrap">{displayDateTime(row.start_time)}</TableCell>
                <TableCell className="whitespace-nowrap">{displayDateTime(row.end_time)}</TableCell>
                <TableCell className="whitespace-nowrap"><Badge variant="outline">{batchStatusLabels[String(row.status)] || String(row.status)}</Badge></TableCell>
                <TableCell className="whitespace-nowrap">{Number(row.reading_count ?? 0)} 条</TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <Button variant="ghost" size="sm" asChild className="text-blue-700">
                    <Link href={`/quality/data/equipment/${equipmentId}/${row.id}`}>采集数据<ChevronRight size={15} /></Link>
                  </Button>
                </TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={8} className="h-32 text-center text-slate-500">
                {batchLinkField ? '该设备下还没有生产批次，点右上角「新增批次」创建。' : '该设备类型不支持关联生产批次。'}
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>新增批次</DialogTitle>
          <DialogDescription>
            新批次会自动把「{equipment.name}」写进批次表的{linkLabel ? `「${linkLabel}」` : '设备字段'}，不需要再去批次基础信息里手动关联。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div><Label className="mb-2 block">批次号<span className="text-red-500"> *</span></Label><Input value={form.batch_no ?? ''} onChange={(event) => setForm((state) => ({ ...state, batch_no: event.target.value }))} placeholder="例如 12121D0036" /></div>
          <div>
            <Label className="mb-2 block">产品规格<span className="text-red-500"> *</span></Label>
            <Select value={form.spec_id ?? ''} onValueChange={(value) => setForm((state) => ({ ...state, spec_id: value }))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="请选择" /></SelectTrigger>
              <SelectContent>{specOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="mb-2 block">生产组别<span className="text-red-500"> *</span></Label><Input value={form.production_group ?? ''} onChange={(event) => setForm((state) => ({ ...state, production_group: event.target.value }))} placeholder="例如 甲班" /></div>
          <div>
            <Label className="mb-2 block">批次状态</Label>
            <Select value={form.status ?? 'completed'} onValueChange={(value) => setForm((state) => ({ ...state, status: value }))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="请选择" /></SelectTrigger>
              <SelectContent>{batchStatusOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="mb-2 block">生产开始时间<span className="text-red-500"> *</span></Label><Input type="datetime-local" value={form.start_time ?? ''} onChange={(event) => setForm((state) => ({ ...state, start_time: event.target.value }))} /></div>
          <div><Label className="mb-2 block">生产结束时间</Label><Input type="datetime-local" value={form.end_time ?? ''} onChange={(event) => setForm((state) => ({ ...state, end_time: event.target.value }))} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
          <Button onClick={save} disabled={saving} className="bg-blue-700 hover:bg-blue-800">{saving && <Loader2 className="animate-spin" size={16} />}保存到数据库</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
