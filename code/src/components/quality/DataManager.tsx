'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from './PageHeader';

export type Field = { key: string; label: string; type?: 'text'|'number'|'datetime'|'textarea'|'select'; required?: boolean; options?: { label: string; value: string }[]; optionResource?: string; optionLabel?: string };
export type Column = { key: string; label: string; render?: (row: Record<string, unknown>) => React.ReactNode };
/** 只出现在 Excel 模板里、不出现在页面表单上的列（例如产品数据的「批次号」）。replaces 指向它替代的表单字段，该字段不进模板。 */
export type TemplateColumn = { key: string; label: string; note?: string; required?: boolean; replaces?: string };

function displayCell(key: string, value: unknown) {
  if (value == null || value === '') return '—';
  if (/(time|_at|date)$/i.test(key) && typeof value === 'string') return value.replace('T', ' ').replace(/\.000Z$/, '').slice(0, 16);
  return String(value);
}

export function DataManager({ resource, title, description, fields, columns, excel = true, templateColumns = [], templateNotes = [], templateSample }: { resource: string; title: string; description: string; fields: Field[]; columns: Column[]; excel?: boolean; templateColumns?: TemplateColumn[]; templateNotes?: string[]; templateSample?: Record<string, string | number> }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [options, setOptions] = useState<Record<string, { label: string; value: string }[]>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/quality/master/${resource}`); const json = await res.json();
      if (!res.ok) throw new Error(json.error); setRows(json.data || []);
    } catch (error) { toast.error(error instanceof Error ? error.message : '加载失败'); }
    finally { setLoading(false); }
  }, [resource]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const sources = [...new Set(fields.map((field) => field.optionResource).filter(Boolean))] as string[];
    Promise.all(sources.map(async (source) => {
      const res = await fetch(`/api/quality/master/${source}`); const json = await res.json();
      return [source, (json.data || []).map((item: Record<string, unknown>) => ({ value: String(item.id), label: String(item.name || item.batch_no || item.code) }))] as const;
    })).then((entries) => setOptions(Object.fromEntries(entries))).catch(() => undefined);
  }, [fields]);

  const visible = useMemo(() => rows.filter((row) => JSON.stringify(row).toLowerCase().includes(query.toLowerCase())), [rows, query]);
  const showEditor = (row?: Record<string, unknown>) => { setEditing(row || null); setForm(row ? { ...row } : Object.fromEntries(fields.map((field) => [field.key, '']))); setOpen(true); };
  const save = async () => {
    const missing = fields.filter((field) => field.required && (form[field.key] === '' || form[field.key] == null));
    if (missing.length) return toast.warning(`请填写：${missing.map((field) => field.label).join('、')}`);
    setSaving(true);
    try {
      const res = await fetch(`/api/quality/master/${resource}`, { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, id: editing?.id }) });
      const json = await res.json(); if (!res.ok) throw new Error(json.error); toast.success(editing ? '数据已更新' : '数据已新增'); setOpen(false); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : '保存失败'); } finally { setSaving(false); }
  };
  const remove = async (row: Record<string, unknown>) => {
    if (!window.confirm('确认删除该记录？存在关联数据时系统会拒绝删除。')) return;
    const res = await fetch(`/api/quality/master/${resource}?id=${row.id}`, { method: 'DELETE' }); const json = await res.json();
    if (!res.ok) return toast.error(json.error || '删除失败'); toast.success('数据已删除'); load();
  };
  /**
   * 下载导入模板：第一个工作表是纯数据表（导入只读第一个表），第二个「填写说明」放中文含义、
   * 必填、示例值和注意事项。列的组装与校验集中在 src/lib/quality-template.ts。
   */
  const downloadTemplate = async () => {
    try {
      const { writeImportTemplate } = await import('@/lib/quality-template');
      const buffer = writeImportTemplate({ resource, sheetName: title || resource, fields, templateColumns, notes: templateNotes, sample: templateSample });
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a'); link.href = url; link.download = `${resource}-import-template.xlsx`; link.click(); URL.revokeObjectURL(url);
    } catch (error) { toast.error(error instanceof Error ? error.message : '模板生成失败'); }
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      const XLSX = await import('xlsx'); const buffer = await file.arrayBuffer(); const workbook = XLSX.read(buffer); const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      if (!data.length) throw new Error('文件中没有可导入数据');
      let ok = 0; let newBatches = 0;
      const flagged = { high: 0, medium: 0 };
      const failures: string[] = [];
      for (const [index, row] of data.entries()) {
        const res = await fetch(`/api/quality/master/${resource}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(row) });
        if (!res.ok) {
          // 之前是把失败行静默丢掉，只报「成功 N / M」，用户根本不知道哪行错了。
          const json = await res.json().catch(() => null);
          if (failures.length < 3) failures.push(`第 ${index + 2} 行：${json?.error ?? `HTTP ${res.status}`}`);
          continue;
        }
        ok += 1;
        // 产品数据保存后服务端会自动重算预警，这里把高风险/中风险条数汇总给用户。
        const json = await res.json().catch(() => null);
        const summary = json?.alerts as { high?: number; medium?: number } | null;
        if (summary) { flagged.high += summary.high ?? 0; flagged.medium += summary.medium ?? 0; }
        if (json?.batch?.created) newBatches += 1;
      }
      const triggered = flagged.high + flagged.medium;
      const details = [
        newBatches ? `自动新建批次 ${newBatches} 个` : '',
        triggered ? `自动预警：高风险 ${flagged.high} 条，中风险 ${flagged.medium} 条` : '',
        failures.length ? `${data.length - ok} 行失败 → ${failures.join('；')}` : '',
      ].filter(Boolean).join(' ｜ ');
      const message = `导入完成：成功 ${ok} / ${data.length} 条`;
      if (failures.length) toast.warning(message, { description: details, duration: 12000 });
      else toast.success(message, details ? { description: details, duration: 8000 } : undefined);
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : '导入失败'); }
  };

  return <>
    <PageHeader title={title} description={description} actions={<>
      {excel && <>
        <Button variant="outline" onClick={() => { void downloadTemplate(); }}><Download size={16} />下载模板</Button>
        <Button variant="outline" asChild><label className="cursor-pointer"><Upload size={16} />Excel 导入<input className="hidden" type="file" accept=".xlsx,.xls,.csv" onChange={(event) => { importFile(event.target.files?.[0]); event.target.value=''; }} /></label></Button>
      </>}
      <Button onClick={() => showEditor()} className="bg-blue-700 hover:bg-blue-800"><Plus size={16} />新增</Button>
    </>} />
    <Card className="border-slate-200 shadow-sm"><CardContent className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <div className="relative w-full max-w-sm"><Search className="absolute left-3 top-2.5 text-slate-400" size={16}/><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索当前数据" className="pl-9" /></div>
        <div className="flex items-center gap-3 text-sm text-slate-500"><FileSpreadsheet size={16}/>共 {visible.length} 条<Button variant="ghost" size="icon" onClick={load}><RefreshCw size={16}/></Button></div>
      </div>
      <div className="overflow-x-auto"><Table><TableHeader><TableRow>{columns.map((column) => <TableHead key={column.key} className="whitespace-nowrap">{column.label}</TableHead>)}<TableHead className="sticky right-0 bg-white text-right">操作</TableHead></TableRow></TableHeader>
      <TableBody>{loading ? <TableRow><TableCell colSpan={columns.length + 1} className="h-32 text-center"><Loader2 className="mx-auto animate-spin text-blue-600"/></TableCell></TableRow> : visible.length ? visible.map((row) => <TableRow key={String(row.id)}>{columns.map((column) => <TableCell key={column.key} className="max-w-[280px] whitespace-nowrap">{column.render ? column.render(row) : displayCell(column.key, row[column.key])}</TableCell>)}<TableCell className="sticky right-0 bg-white text-right"><Button variant="ghost" size="icon" onClick={() => showEditor(row)}><Pencil size={15}/></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => remove(row)}><Trash2 size={15}/></Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={columns.length + 1} className="h-32 text-center text-slate-500">暂无数据</TableCell></TableRow>}</TableBody></Table></div>
    </CardContent></Card>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{editing ? '编辑' : '新增'}{title}</DialogTitle><DialogDescription>保存后写入 MySQL，监控、诊断和报告将读取同一份数据。</DialogDescription></DialogHeader>
      <div className="grid gap-4 py-2 sm:grid-cols-2">{fields.map((field) => <div key={field.key} className={field.type === 'textarea' ? 'sm:col-span-2' : ''}><Label className="mb-2 block">{field.label}{field.required && <span className="text-red-500"> *</span>}</Label>{field.type === 'select' ? <Select value={String(form[field.key] ?? '')} onValueChange={(value) => setForm((state) => ({ ...state, [field.key]: value }))}><SelectTrigger className="w-full"><SelectValue placeholder="请选择" /></SelectTrigger><SelectContent>{(field.options || options[field.optionResource || ''] || []).map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select> : field.type === 'textarea' ? <textarea className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={String(form[field.key] ?? '')} onChange={(event) => setForm((state) => ({ ...state, [field.key]: event.target.value }))}/> : <Input type={field.type === 'number' ? 'number' : field.type === 'datetime' ? 'datetime-local' : 'text'} step={field.type === 'number' ? '0.001' : undefined} value={String(form[field.key] ?? '')} onChange={(event) => setForm((state) => ({ ...state, [field.key]: event.target.value }))}/>}</div>)}</div>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>取消</Button><Button onClick={save} disabled={saving} className="bg-blue-700 hover:bg-blue-800">{saving && <Loader2 className="animate-spin" size={16}/>}保存到数据库</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}
