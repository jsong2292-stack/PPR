'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DataManager } from './DataManager';
import {
  PRODUCT_BATCH_COLUMNS,
  PRODUCT_IMPORT_FIELDS,
  PRODUCT_IMPORT_NOTES,
  PRODUCT_IMPORT_SAMPLE,
  PRODUCT_MEASUREMENT_COLUMNS,
  SCOPED_MEASUREMENT_FIELDS,
  SCOPED_MEASUREMENT_NOTES,
  SCOPED_MEASUREMENT_SAMPLE,
} from '@/lib/quality-resource-config';

interface SpecContext { id: number; code: string; name: string; category_name: string }
interface BatchContext { batch_no: string; production_group: string | null; start_time: string | null; measurement_count: number; reading_count: number }

/**
 * 产品台账下钻链路：产品台账（规格）→ 该规格的生产批次 → 该批次的检验记录。
 *
 * 批次号是唯一关联键，批次本身不落表（ppr_batch 是按 batch_no 聚合的视图），
 * 所以页面上下文一律用批次号字符串传递。
 *
 * 列表与导入仍然复用 DataManager + /api/quality/master/*，这里只做两件事：
 *   1. 取回中文上下文（规格名 / 批次号）拼页面标题与面包屑；
 *   2. 通过 preset 把当前规格 / 批次固定住——列表按它收窄，导入自动归属。
 */
function useProductContext(specId: number, batchNo?: string) {
  const [spec, setSpec] = useState<SpecContext | null>(null);
  const [batch, setBatch] = useState<BatchContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/quality/products/${specId}${batchNo ? `?batch_no=${encodeURIComponent(batchNo)}` : ''}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || '加载失败');
        return json;
      })
      .then((json) => {
        if (!alive) return;
        setSpec(json.spec); setBatch(json.batch ?? null); setError(null);
      })
      .catch((cause) => { if (alive) setError(cause instanceof Error ? cause.message : '加载失败'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [specId, batchNo]);

  return { spec, batch, error, loading };
}

function Pending({ text }: { text: string }) {
  return <Card className="border-slate-200 shadow-sm"><CardContent className="p-8 text-center text-slate-500">{text}</CardContent></Card>;
}

function Missing({ text, back }: { text: string; back: { href: string; label: string } }) {
  return (
    <Card className="border-slate-200 shadow-sm"><CardContent className="p-8 text-center text-slate-500">
      {text}
      <div className="mt-4"><Button asChild variant="outline"><Link href={back.href}><ArrowLeft size={16} />{back.label}</Link></Button></div>
    </CardContent></Card>
  );
}

/**
 * 第二级：某个产品规格下的生产批次列表。
 *
 * 批次不能手工新建：清单由检验记录按 batch_no 实时汇总，导入产品数据后自动出现。
 * 因此只保留「清理批次」（removable）与「检验数据」下钻，没有新增 / 编辑入口；
 * 页面上的 Excel 导入走产品数据模板，导入的记录固定落在当前规格下（preset spec_id）。
 */
export function ProductBatches({ specId }: { specId: number }) {
  const { spec, error, loading } = useProductContext(specId);
  const preset = useMemo(() => ({ spec_id: specId }), [specId]);
  const back = { href: '/quality/data/products', label: '返回产品台账' };

  if (loading) return <Pending text="正在加载产品规格..." />;
  if (!spec) return <Missing text={error ?? '产品规格不存在或已被删除。'} back={back} />;

  return (
    <DataManager
      resource="batches"
      title={`${spec.name} · 生产批次`}
      description={`产品类别 ${spec.category_name} · 规格编码 ${spec.code} · 批次清单由检验记录按批次号实时汇总，不能手工新建 · 点「检验数据」进入该批次的检验记录`}
      fields={PRODUCT_IMPORT_FIELDS}
      columns={PRODUCT_BATCH_COLUMNS}
      entityLabel="生产批次"
      templateColumns={[]}
      templateNotes={PRODUCT_IMPORT_NOTES}
      templateSample={PRODUCT_IMPORT_SAMPLE}
      back={back}
      preset={preset}
      canCreate={false}
      canEdit={false}
      detail={{ label: '检验数据', href: (row) => `/quality/data/products/${specId}/${encodeURIComponent(String(row.batch_no ?? row.id ?? ''))}` }}
    />
  );
}

/**
 * 第三级：某个批次下的检验记录。
 * 明细数据只能 Excel 导入（按 record_no 幂等覆盖），所以没有新增 / 编辑 / 删除入口。
 * 列表列固定为 检验时间 / 外径 / 壁厚 / 不圆度；批次号由 preset 固定，模板里不需要填。
 */
export function ProductMeasurements({ specId, batchNo }: { specId: number; batchNo: string }) {
  const { spec, batch, error, loading } = useProductContext(specId, batchNo);
  const preset = useMemo(() => ({ batch_no: batchNo }), [batchNo]);
  const back = { href: `/quality/data/products/${specId}`, label: '返回批次列表' };

  if (loading) return <Pending text="正在加载批次信息..." />;
  if (!spec || !batch) return <Missing text={error ?? '批次不存在或不属于该规格。'} back={back} />;

  return (
    <DataManager
      resource="measurements"
      title={`${batch.batch_no} · 检验记录`}
      description={`${spec.name} · 规格编码 ${spec.code} · 本页只展示该批次下的检验记录，数据只能 Excel 导入，重导即覆盖`}
      fields={SCOPED_MEASUREMENT_FIELDS}
      columns={PRODUCT_MEASUREMENT_COLUMNS}
      entityLabel="检验记录"
      templateColumns={[]}
      templateSample={SCOPED_MEASUREMENT_SAMPLE}
      templateNotes={SCOPED_MEASUREMENT_NOTES}
      back={back}
      preset={preset}
      canCreate={false}
      canEdit={false}
      removable={false}
    />
  );
}
