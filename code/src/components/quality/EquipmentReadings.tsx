'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Download, Loader2, Pencil, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { type ReadingFieldMeta } from '@/lib/quality-equipment';
import { PageHeader } from './PageHeader';

type Row = Record<string, unknown>;

interface EquipmentInfo { id: number; code: string; name: string; type_name: string; type_code: string; line_name: string }
interface BatchInfo { id: number; batch_no: string; spec_name?: string; production_group?: string }

/** 示例值：让下载的模板自带一行可直接参照的模拟数据 */
const SAMPLE_VALUES: Record<string, number> = {
  temperature_c: 205.0,
  pressure_mpa: 12.6,
  haul_off_speed_mpm: 8.2,
};

function displayDateTime(value: unknown): string {
  if (value == null || value === '') return '—';
  return String(value).replace('T', ' ').replace(/\.000Z$/, '').slice(0, 16);
}

function displayNumber(value: unknown): string {
  if (value == null || value === '') return '—';
  return String(value);
}

/** datetime-local 输入框要 'YYYY-MM-DDTHH:mm'，接口返回的是 ISO 字符串，这里裁到分钟 */
function toLocalInput(value: unknown): string {
  if (value == null || value === '') return '';
  return String(value).slice(0, 16);
}

/**
 * 设备台账第三级：某个批次下、某台设备的采集项列表。
 *
 * 列由设备类型决定（挤出机=温度/压力，牵引机=牵引速度，单位写在列头里），
 * 批次与设备由页面上下文带入，所以 Excel 模板只需要「采集时间 + 数据项」。
 */
export function EquipmentReadings({ equipmentId, batchId }: { equipmentId: number; batchId: number }) {
  const [equipment, setEquipment] = useState<EquipmentInfo | null>(null);
  const [batch, setBatch] = useState<BatchInfo | null>(null);
  const [dataColumns, setDataColumns] = useState<ReadingFieldMeta[]>([]);
  const [readings, setReadings] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const baseUrl = `/api/quality/equipment/${equipmentId}/batches/${batchId}/readings`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(baseUrl);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '加载失败');
      setEquipment(json.equipment);
      setBatch(json.batch);
      setDataColumns(json.dataColumns || []);
      setReadings(json.readings || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => { load(); }, [load]);

  const showEditor = (row?: Row) => {
    setEditing(row ?? null);
    if (row) {
      const next: Record<string, string> = {
        collect_time: toLocalInput(row.collect_time),
        data_source: String(row.data_source ?? ''),
        remark: String(row.remark ?? ''),
      };
      for (const column of dataColumns) next[column.key] = row[column.key] == null ? '' : String(row[column.key]);
      setForm(next);
    } else {
      setForm({ collect_time: '', data_source: 'SCADA', remark: '' });
    }
    setOpen(true);
  };

  const save = async () => {
    if (!form.collect_time) return toast.warning('请填写采集时间');
    if (!dataColumns.some((column) => String(form[column.key] ?? '').trim() !== '')) return toast.warning(`请至少填写一项：${dataColumns.map((column) => column.columnLabel).join('、')}`);
    setSaving(true);
    try {
      const res = await fetch(editing ? `${baseUrl}/${editing.id}` : baseUrl, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '保存失败');
      toast.success(editing ? '采集数据已更新' : '采集数据已新增');
      setOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: Row) => {
    if (!window.confirm('确认删除该条采集记录？')) return;
    const res = await fetch(`${baseUrl}/${row.id}`, { method: 'DELETE' });
    const json = await res.json().catch(() => null);
    if (!res.ok) return toast.error(json?.error || '删除失败');
    toast.success('采集数据已删除');
    load();
  };

  /** 下载模板：只含「采集时间 + 本设备类型的数据项」，批次号与设备由当前页面带入，不用填 */
  const downloadTemplate = async () => {
    try {
      const { writeImportTemplate } = await import('@/lib/quality-template');
      const sample: Record<string, string | number> = { collect_time: '2026-10-10 08:00:00' };
      for (const column of dataColumns) sample[column.key] = SAMPLE_VALUES[column.key] ?? 1;
      const buffer = writeImportTemplate({
        resource: `equipment-${equipmentId}-batch-${batchId}-readings`,
        sheetName: `采集数据 ${batch?.batch_no ?? ''}`.trim(),
        fields: [
          { key: 'collect_time', label: '采集时间', type: 'datetime', required: true },
          ...dataColumns.map((column) => ({ key: column.key, label: column.columnLabel, type: 'number' })),
        ],
        sample,
        notes: [
          '第一行是列名，不要修改或删除；第二行是示例行，导入前请删除或覆盖成真实数据。',
          `本模板只用于「${equipment?.name ?? '当前设备'}」在批次「${batch?.batch_no ?? '当前批次'}」下的采集数据：批次与设备由页面自动带入，模板里不需要填，也不要新增批次号或设备列。`,
          '记录编号由系统自动生成，不需要填写。',
          'collect_time 必须是文本格式 YYYY-MM-DD HH:mm:ss，不要用 Excel 的日期单元格，否则会变成数字序列号导入失败。',
          '同一设备 + 同一批次 + 同一采集时刻只允许一条记录，重复时刻的行会被拒绝并逐行提示。',
          `至少要填写一项采集数据：${dataColumns.map((column) => column.columnLabel).join('、')}。`,
        ],
      });
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `采集数据-${batch?.batch_no ?? batchId}-${equipment?.name ?? equipmentId}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '模板生成失败');
    }
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer());
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      if (!data.length) throw new Error('文件中没有可导入数据');
      let ok = 0;
      const failures: string[] = [];
      for (const [index, row] of data.entries()) {
        const res = await fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(row) });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          if (failures.length < 3) failures.push(`第 ${index + 2} 行：${json?.error ?? `HTTP ${res.status}`}`);
          continue;
        }
        ok += 1;
      }
      const message = `导入完成：成功 ${ok} / ${data.length} 条`;
      if (failures.length) toast.warning(message, { description: failures.join('；'), duration: 12000 });
      else toast.success(message);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导入失败');
    }
  };

  if (loading) return <div className="grid h-96 place-items-center"><Loader2 className="animate-spin text-blue-700" /></div>;
  if (!equipment || !batch) return <Card className="border-slate-200 shadow-sm"><CardContent className="p-8 text-center text-slate-500">设备或批次不存在。<div className="mt-4"><Button asChild variant="outline"><Link href="/quality/data/equipment"><ArrowLeft size={16} />返回设备台账</Link></Button></div></CardContent></Card>;

  return <>
    <PageHeader
      title={`${equipment.name} · ${batch.batch_no} · 采集数据`}
      description={`${equipment.type_name} · ${equipment.line_name} · 产品规格 ${batch.spec_name ?? '—'} · 本页只展示该设备在该批次下的采集项，数据项由设备类型决定`}
      actions={<>
        <Button asChild variant="outline"><Link href={`/quality/data/equipment/${equipmentId}`}><ArrowLeft size={16} />返回批次列表</Link></Button>
        <Button variant="outline" onClick={() => { void downloadTemplate(); }}><Download size={16} />下载模板</Button>
        <Button variant="outline" asChild><label className="cursor-pointer"><Upload size={16} />Excel 导入<input className="hidden" type="file" accept=".xlsx,.xls,.csv" onChange={(event) => { importFile(event.target.files?.[0]); event.target.value = ''; }} /></label></Button>
        <Button variant="outline" onClick={load}><RefreshCw size={16} />刷新</Button>
        <Button onClick={() => showEditor()} className="bg-blue-700 hover:bg-blue-800"><Plus size={16} />新增</Button>
      </>}
    />

    <Card className="gap-0 border-slate-200 py-0 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <div className="text-sm text-slate-600">数据项：{dataColumns.map((column) => column.columnLabel).join(' ｜ ')}</div>
        <div className="text-sm text-slate-500">共 {readings.length} 条采集记录</div>
      </div>
      <CardContent className="p-4">
        <Table>
          <TableHeader><TableRow>
            <TableHead className="whitespace-nowrap">采集时间</TableHead>
            <TableHead className="whitespace-nowrap">批次号</TableHead>
            {dataColumns.map((column) => <TableHead key={column.key} className="whitespace-nowrap">{column.columnLabel}</TableHead>)}
            <TableHead className="whitespace-nowrap text-right">操作</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {readings.length ? readings.map((row) => (
              <TableRow key={String(row.id)}>
                <TableCell className="whitespace-nowrap">{displayDateTime(row.collect_time)}</TableCell>
                <TableCell className="whitespace-nowrap font-medium">{String(batch.batch_no)}</TableCell>
                {dataColumns.map((column) => <TableCell key={column.key} className="whitespace-nowrap font-mono">{displayNumber(row[column.key])}</TableCell>)}
                <TableCell className="whitespace-nowrap text-right">
                  <Button variant="ghost" size="icon" onClick={() => showEditor(row)}><Pencil size={15} /></Button>
                  <Button variant="ghost" size="icon" className="text-red-600" onClick={() => remove(row)}><Trash2 size={15} /></Button>
                </TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={dataColumns.length + 3} className="h-32 text-center text-slate-500">
                该批次下还没有采集数据，可点右上角「新增」手工录入，或用「下载模板 → 填写 → Excel 导入」批量导入。
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? '编辑' : '新增'}采集数据</DialogTitle>
          <DialogDescription>写入「{equipment.name} · {batch.batch_no}」，记录编号由系统自动生成。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div>
            <Label className="mb-2 block">采集时间<span className="text-red-500"> *</span></Label>
            <Input type="datetime-local" value={form.collect_time ?? ''} onChange={(event) => setForm((state) => ({ ...state, collect_time: event.target.value }))} />
          </div>
          <div>
            <Label className="mb-2 block">数据来源</Label>
            <Input value={form.data_source ?? ''} onChange={(event) => setForm((state) => ({ ...state, data_source: event.target.value }))} placeholder="例如 SCADA" />
          </div>
          {dataColumns.map((column) => (
            <div key={column.key}>
              <Label className="mb-2 block">{column.columnLabel}</Label>
              <Input type="number" step="0.001" value={form[column.key] ?? ''} onChange={(event) => setForm((state) => ({ ...state, [column.key]: event.target.value }))} />
            </div>
          ))}
          <div className="sm:col-span-2">
            <Label className="mb-2 block">备注</Label>
            <textarea className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={form.remark ?? ''} onChange={(event) => setForm((state) => ({ ...state, remark: event.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
          <Button onClick={save} disabled={saving} className="bg-blue-700 hover:bg-blue-800">{saving && <Loader2 className="animate-spin" size={16} />}保存到数据库</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
