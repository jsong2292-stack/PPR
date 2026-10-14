'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DataManager } from './DataManager';
import {
  PRODUCT_BATCH_COLUMNS,
  PRODUCT_MEASUREMENT_COLUMNS,
  SCOPED_BATCH_FIELDS,
  SCOPED_MEASUREMENT_FIELDS,
  SCOPED_MEASUREMENT_NOTES,
  SCOPED_MEASUREMENT_SAMPLE,
} from '@/lib/quality-resource-config';

interface SpecContext { id: number; code: string; name: string; category_name: string }
interface BatchContext { id: number; batch_no: string; production_group: string; start_time: string; end_time: string | null; status: string }

/**
 * 产品台账下钻链路：产品台账（规格）→ 该规格的生产批次 → 该批次的检验记录。
 *
 * 列表与增删改仍然复用 DataManager + /api/quality/master/*，这里只做两件事：
 *   1. 取回中文上下文（规格名 / 批次号）拼页面标题与面包屑；
 *   2. 通过 preset 把当前规格 / 批次固定住——列表按它收窄，新增与导入自动归属，表单里也不再出现该字段。
 */
function useProductContext(specId: number, batchId?: number) {
  const [spec, setSpec] = useState<SpecContext | null>(null);
  const [batch, setBatch] = useState<BatchContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/quality/products/${specId}${batchId ? `?batch_id=${batchId}` : ''}`)
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
  }, [specId, batchId]);

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

/** 第二级：某个产品规格下的生产批次列表。 */
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
      description={`产品类别 ${spec.category_name} · 规格编码 ${spec.code} · 点「检验数据」进入该批次的检验记录`}
      fields={SCOPED_BATCH_FIELDS}
      columns={PRODUCT_BATCH_COLUMNS}
      entityLabel="生产批次"
      back={back}
      preset={preset}
      detail={{ label: '检验数据', href: (row) => `/quality/data/products/${specId}/${row.id}` }}
    />
  );
}

/**
 * 第三级：某个批次下的检验记录。
 * 列表列按需求固定为 检验时间 / 外径 / 壁厚 / 不圆度，其余测量字段只在新增编辑弹窗里出现。
 */
export function ProductMeasurements({ specId, batchId }: { specId: number; batchId: number }) {
  const { spec, batch, error, loading } = useProductContext(specId, batchId);
  const preset = useMemo(() => ({ batch_id: batchId }), [batchId]);
  const back = { href: `/quality/data/products/${specId}`, label: '返回批次列表' };

  if (loading) return <Pending text="正在加载批次信息..." />;
  if (!spec || !batch) return <Missing text={error ?? '批次不存在或不属于该规格。'} back={back} />;

  return (
    <DataManager
      resource="measurements"
      title={`${batch.batch_no} · 检验记录`}
      description={`${spec.name} · 规格编码 ${spec.code} · 本页只展示该批次下的检验记录，保存后自动重算预警事件`}
      fields={SCOPED_MEASUREMENT_FIELDS}
      columns={PRODUCT_MEASUREMENT_COLUMNS}
      entityLabel="检验记录"
      templateSample={SCOPED_MEASUREMENT_SAMPLE}
      templateNotes={SCOPED_MEASUREMENT_NOTES}
      back={back}
      preset={preset}
    />
  );
}
