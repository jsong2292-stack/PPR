'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Download, Loader2, RefreshCw, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { type ReadingFieldMeta } from '@/lib/quality-equipment';
import { describeImport, importRows } from '@/lib/quality-import-client';
import { PageHeader } from './PageHeader';

type Row = Record<string, unknown>;

interface EquipmentInfo { id: number; code: string; name: string; type_name: string; type_code: string; line_name: string }
interface BatchInfo { batch_no: string; spec_name?: string | null; production_group?: string | null; start_time?: string | null; measurement_count?: number; reading_count?: number }

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

/**
 * 设备台账第三级：某个批次下、某台设备的采集项列表。
 *
 * 列由设备类型决定（挤出机=温度/压力，牵引机=牵引速度，单位写在列头里），
 * 批次号与设备由页面上下文带入，所以 Excel 模板只需要「采集时间 + 数据项」。
 * 采集数据只从 Excel 导入（同一设备 + 同一批次号 + 同一采集时间重复导入会覆盖），因此没有新增 / 编辑 / 删除入口。
 */
export function EquipmentReadings({ equipmentId, batchNo }: { equipmentId: number; batchNo: string }) {
  const [equipment, setEquipment] = useState<EquipmentInfo | null>(null);
  const [batch, setBatch] = useState<BatchInfo | null>(null);
  const [dataColumns, setDataColumns] = useState<ReadingFieldMeta[]>([]);
  const [readings, setReadings] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  const baseUrl = `/api/quality/equipment/${equipmentId}/batches/${encodeURIComponent(batchNo)}/readings`;

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

  /** 模板只含「采集时间 + 本设备类型的采集项」，批次号与设备由页面带入。 */
  const downloadTemplate = async () => {
    try {
      const { writeImportTemplate } = await import('@/lib/quality-template');
      const buffer = writeImportTemplate({
        resource: 'readings',
        sheetName: `${equipment?.name ?? '设备'} 采集数据`,
        fields: [
          { key: 'collect_time', label: '采集时间', type: 'datetime', required: true },
          ...dataColumns.map((column) => ({ key: column.key, label: column.columnLabel, type: 'number' })),
        ],
        notes: [
          `本模板用于导入「${equipment?.name ?? ''}」在批次 ${batchNo} 下的采集数据：只需要采集时间和采集项。`,
          '第一行是列名，不要修改或删除；第二行是示例行，导入前请删除或覆盖成真实数据。',
          'collect_time 必须是文本格式 YYYY-MM-DD HH:mm:ss，不要用 Excel 日期单元格，否则会变成序列号导入失败。',
          '同一设备 + 同一批次号 + 同一采集时间重复导入时会覆盖原有数值（幂等），导错重导一次即可。',
        ],
        sample: { collect_time: '2026-11-17 06:00:00', ...SAMPLE_VALUES },
      });
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `采集数据导入模板-${equipment?.name ?? equipmentId}-${batchNo}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '模板生成失败');
    }
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    setImporting(true);
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer());
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      if (!rows.length) throw new Error('文件中没有可导入数据');
      const outcome = await importRows({ rows, target: 'readings', endpoint: baseUrl, preset: {}, batchNo });
      const { message, details, failed } = describeImport(outcome);
      if (failed) toast.warning(message, { description: details, duration: 12000 });
      else toast.success(message, details ? { description: details, duration: 8000 } : undefined);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导入失败');
    } finally {
      setImporting(false);
    }
  };

  return <>
    <PageHeader
      title={`${equipment?.name ?? '设备'} · 批次 ${batchNo} · 采集数据`}
      description={`${equipment?.type_name ?? ''} · ${equipment?.line_name ?? ''} · 采集项：${dataColumns.map((column) => column.columnLabel).join('、') || '—'}${batch?.spec_name ? ` · 产品规格 ${batch.spec_name}` : ''} · 数据只从 Excel 导入，同一采集时间重复导入会覆盖`}
      actions={<>
        <Button asChild variant="outline"><Link href={`/quality/data/equipment/${equipmentId}`}><ArrowLeft size={16} />返回批次列表</Link></Button>
        <Button variant="outline" onClick={() => { void downloadTemplate(); }}><Download size={16} />下载模板</Button>
        <Button variant="outline" asChild>
          <label className="cursor-pointer">{importing ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}Excel 导入
            <input className="hidden" type="file" accept=".xlsx,.xls,.csv" disabled={importing} onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ''; }} />
          </label>
        </Button>
        <Button variant="outline" onClick={load}><RefreshCw size={16} />刷新</Button>
      </>}
    />

    <Card className="gap-0 border-slate-200 py-0 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <div className="text-sm text-slate-600">批次 {batchNo}{batch?.measurement_count != null ? ` · 检验记录 ${Number(batch.measurement_count)} 条` : ''}</div>
        <div className="text-sm text-slate-500">共 {readings.length} 条采集数据</div>
      </div>
      <CardContent className="p-4">
        <Table>
          <TableHeader><TableRow>
            <TableHead>采集时间</TableHead>
            {dataColumns.map((column) => <TableHead key={column.key}>{column.columnLabel}</TableHead>)}
            <TableHead>数据来源</TableHead>
            <TableHead>备注</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={dataColumns.length + 3} className="h-32 text-center"><Loader2 className="mx-auto animate-spin text-blue-600" /></TableCell></TableRow>
              : readings.length ? readings.map((row) => (
                <TableRow key={String(row.id)}>
                  <TableCell className="whitespace-nowrap">{displayDateTime(row.collect_time)}</TableCell>
                  {dataColumns.map((column) => <TableCell key={column.key} className="whitespace-nowrap">{displayNumber(row[column.key])}</TableCell>)}
                  <TableCell className="whitespace-nowrap">{row.data_source ? String(row.data_source) : '—'}</TableCell>
                  <TableCell className="max-w-[280px] truncate">{row.remark ? String(row.remark) : '—'}</TableCell>
                </TableRow>
              )) : <TableRow><TableCell colSpan={dataColumns.length + 3} className="h-32 text-center text-slate-500">还没有采集数据，点右上角「Excel 导入」上传本设备的采集文件（可先下载模板）。</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </>;
}
