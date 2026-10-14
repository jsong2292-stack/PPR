'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, Download, Loader2, RefreshCw, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { type ReadingFieldMeta } from '@/lib/quality-equipment';
import { describeImport, importRows } from '@/lib/quality-import-client';
import { useConfirmDialog } from '@/components/common/use-confirm-dialog';
import { deleteQualityRecord } from '@/lib/quality-delete';
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

/**
 * 设备台账第二级：某台设备下的生产批次列表。
 *
 * 批次不再保存「归属哪台设备」，这个关系由采集数据反推：
 * 本页列出的是「已经在这台设备下导过采集数据」的批次；
 * 导入时先选批次号（批次号来自产品数据，见候选列表），再把该批次的采集数据导进来。
 */
export function EquipmentBatches({ equipmentId }: { equipmentId: number }) {
  const [equipment, setEquipment] = useState<EquipmentInfo | null>(null);
  const [batches, setBatches] = useState<Row[]>([]);
  const [candidates, setCandidates] = useState<Row[]>([]);
  const [dataColumns, setDataColumns] = useState<ReadingFieldMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [batchNo, setBatchNo] = useState('');
  const { confirm, element: confirmElement } = useConfirmDialog();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/quality/equipment/${equipmentId}/batches`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '加载失败');
      setEquipment(json.equipment);
      setBatches(json.batches || []);
      setCandidates(json.candidates || []);
      setDataColumns(json.dataColumns || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [equipmentId]);

  useEffect(() => { load(); }, [load]);

  /** 模板只含「采集时间 + 本设备类型的采集项」，批次号与设备由页面带入。 */
  const downloadTemplate = async () => {
    try {
      const { writeImportTemplate } = await import('@/lib/quality-template');
      const fields = [
        { key: 'collect_time', label: '采集时间', type: 'datetime', required: true },
        ...dataColumns.map((column) => ({ key: column.key, label: column.columnLabel, type: 'number' })),
      ];
      const buffer = writeImportTemplate({
        resource: 'readings',
        sheetName: `${equipment?.name ?? '设备'} 采集数据`,
        fields,
        notes: [
          `本模板用于导入「${equipment?.name ?? ''}」的采集数据：只需要采集时间和采集项，批次号在页面「导入采集数据」时选择。`,
          '第一行是列名，不要修改或删除；第二行是示例行，导入前请删除或覆盖成真实数据。',
          'collect_time 必须是文本格式 YYYY-MM-DD HH:mm:ss，不要用 Excel 日期单元格，否则会变成序列号导入失败。',
          '同一设备 + 同一批次号 + 同一采集时间重复导入时会覆盖原有数值（幂等），导错重导一次即可。',
        ],
        sample: { collect_time: '2026-11-17 06:00:00', ...SAMPLE_VALUES },
      });
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `采集数据导入模板-${equipment?.name ?? equipmentId}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '模板生成失败');
    }
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    if (!batchNo) { toast.error('请先选择这批采集数据属于哪个批次号'); return; }
    setImporting(true);
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer());
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      if (!rows.length) throw new Error('文件中没有可导入数据');
      const outcome = await importRows({
        rows,
        target: 'readings',
        // 批次号与设备都取自页面上下文：一个采集文件只属于「这台设备的这个批次」
        endpoint: `/api/quality/equipment/${equipmentId}/batches/${encodeURIComponent(batchNo)}/readings`,
        preset: {},
        // 采集文件里没有批次号列，汇总提示要显示批次号只能显式传
        batchNo,
      });
      const { message, details, failed } = describeImport(outcome);
      if (failed) toast.warning(message, { description: details, duration: 12000 });
      else toast.success(message, details ? { description: details, duration: 8000 } : undefined);
      setOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导入失败');
    } finally {
      setImporting(false);
    }
  };

  /**
   * 批次清理：批次是视图，删除 = 把这个批次号下的检验记录与采集数据一起清掉，
   * 所以这里删的是整个批次（两个台账共用），确认文案必须写清楚。
   */
  const remove = async (row: Row) => {
    const no = String(row.batch_no ?? '');
    const outcome = await deleteQualityRecord(confirm, 'batches', no, {
      title: '清理批次',
      description: `将删除批次「${no}」下的全部检验记录与设备采集数据（含预警事件）。批次号下没有数据后，批次总览里也就没有它了。`,
    });
    if (outcome.status === 'deleted') { toast.success('批次数据已清理'); await load(); }
    else if (outcome.status === 'failed') toast.error(outcome.error);
  };

  if (!equipment && !loading) {
    return <Card className="border-slate-200 shadow-sm"><CardContent className="p-8 text-center text-slate-500">设备不存在或已被删除。<div className="mt-4"><Button asChild variant="outline"><Link href="/quality/data/equipment"><ArrowLeft size={16} />返回设备台账</Link></Button></div></CardContent></Card>;
  }

  return <>
    <PageHeader
      title={`${equipment?.name ?? '设备'} · 生产批次`}
      description={`${equipment?.type_name ?? ''} · ${equipment?.line_name ?? ''} · 设备编码 ${equipment?.code ?? ''}${dataColumns.length ? ` · 采集项：${dataColumns.map((column) => column.columnLabel).join('、')}` : ''}${' · 每个批次导入一次采集数据，导进去这个批次就出现在本设备下面'}`}
      actions={<>
        <Button asChild variant="outline"><Link href="/quality/data/equipment"><ArrowLeft size={16} />返回设备台账</Link></Button>
        {dataColumns.length > 0 && <>
          <Button variant="outline" onClick={() => { void downloadTemplate(); }}><Download size={16} />下载模板</Button>
          <Button variant="outline" onClick={() => { setBatchNo(''); setOpen(true); }}><Upload size={16} />导入采集数据</Button>
        </>}
        <Button variant="outline" onClick={load}><RefreshCw size={16} />刷新</Button>
      </>}
    />

    {!dataColumns.length && (
      <Card className="mb-4 border-amber-200 bg-amber-50 shadow-sm">
        <CardContent className="p-4 text-sm text-amber-800">
          「{equipment?.type_name ?? '该类型设备'}」没有配置采集项，因此不参与采集数据；可在 数据源管理 / 设备类型 里确认。
        </CardContent>
      </Card>
    )}

    <Card className="gap-0 border-slate-200 py-0 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <div className="text-sm text-slate-600">批次清单来自本设备的采集数据：没有采集数据的批次不会出现在这里</div>
        <div className="text-sm text-slate-500">共 {batches.length} 个批次</div>
      </div>
      <CardContent className="p-4">
        <Table>
          <TableHeader><TableRow>
            <TableHead>批次号</TableHead>
            <TableHead>产品规格</TableHead>
            <TableHead>生产组别</TableHead>
            <TableHead>批次开始时间</TableHead>
            <TableHead>本设备采集条数</TableHead>
            <TableHead>最近采集时间</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={7} className="h-32 text-center"><Loader2 className="mx-auto animate-spin text-blue-600" /></TableCell></TableRow>
              : batches.length ? batches.map((row) => (
                <TableRow key={String(row.batch_no)}>
                  <TableCell className="whitespace-nowrap font-medium">{String(row.batch_no ?? '')}</TableCell>
                  <TableCell className="whitespace-nowrap">{row.spec_name ? String(row.spec_name) : '—'}</TableCell>
                  <TableCell className="whitespace-nowrap">{row.production_group ? String(row.production_group) : '—'}</TableCell>
                  <TableCell className="whitespace-nowrap">{displayDateTime(row.start_time)}</TableCell>
                  <TableCell className="whitespace-nowrap">{Number(row.equipment_reading_count ?? 0)} 条</TableCell>
                  <TableCell className="whitespace-nowrap">{displayDateTime(row.equipment_last_collect_time)}</TableCell>
                  <TableCell className="sticky right-0 whitespace-nowrap bg-white text-right">
                    <Button variant="ghost" size="sm" asChild className="text-blue-700">
                      <Link href={`/quality/data/equipment/${equipmentId}/${encodeURIComponent(String(row.batch_no ?? ''))}`}>采集数据<ChevronRight size={15} /></Link>
                    </Button>
                    <Button variant="ghost" size="icon" className="text-red-600" onClick={() => { void remove(row); }}><Trash2 size={15} /></Button>
                  </TableCell>
                </TableRow>
              )) : <TableRow><TableCell colSpan={7} className="h-32 text-center text-slate-500">
                本设备还没有采集数据。先在 数据源管理 / 产品台账 导入产品数据（批次号会随检验记录一起产生），再点右上角「导入采集数据」选择批次号。
              </TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>导入采集数据</DialogTitle>
          <DialogDescription>一个采集文件只属于「{equipment?.name ?? '本设备'}」的某一个批次，请先选择批次号，再选择文件。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">批次号<span className="text-red-500"> *</span></Label>
            <Select value={batchNo} onValueChange={setBatchNo}>
              <SelectTrigger><SelectValue placeholder={candidates.length ? '选择批次号' : '还没有批次号，请先导入产品数据'} /></SelectTrigger>
              <SelectContent>
                {candidates.map((row) => (
                  <SelectItem key={String(row.batch_no)} value={String(row.batch_no)}>
                    {String(row.batch_no)}{row.spec_name ? ` · ${String(row.spec_name)}` : ''} · 检验 {Number(row.measurement_count ?? 0)} 条
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-2 text-xs text-slate-500">批次号来自产品数据（产品台账 / 批次总览里导入），采集数据只是按批次号挂靠，不新建批次。</p>
          </div>
          <div>
            <Label className="mb-2 block">采集数据文件<span className="text-red-500"> *</span></Label>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={importing || !batchNo}
              onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ''; }}
              className="block w-full cursor-pointer rounded-md border border-input bg-transparent px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-sm"
            />
            <p className="mt-2 text-xs text-slate-500">文件列头：采集时间 + {dataColumns.map((column) => column.columnLabel).join('、') || '采集项'}，可先「下载模板」。</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
          {importing && <span className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="animate-spin" size={15} />导入中…</span>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {confirmElement}
  </>;
}
