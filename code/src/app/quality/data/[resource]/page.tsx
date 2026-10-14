'use client';

import { useParams, notFound, redirect } from 'next/navigation';
import { DataManager } from '@/components/quality/DataManager';
import {
  PRODUCT_IMPORT_FIELDS,
  PRODUCT_IMPORT_NOTES,
  PRODUCT_IMPORT_SAMPLE,
  QUALITY_RESOURCE_CONFIG,
} from '@/lib/quality-resource-config';

export default function DataPage() {
  const { resource } = useParams<{ resource: string }>();
  // 旧入口已合并：
  //   「数据源管理 / 设备采集数据」→ 设备台账（设备 → 批次 → 采集项）
  //   「系统管理 / 产品规格」+「数据源管理 / 产品数据」→ 产品台账（规格 → 批次 → 检验记录）
  // 跳转放在这里而不是单独建同名静态目录：静态段与动态段同级时，实测 dev 会把静态段解析到本动态路由，
  // 放在这里两种解析结果都成立。
  if (resource === 'readings') redirect('/quality/data/equipment');
  if (resource === 'specs' || resource === 'measurements') redirect('/quality/data/products');
  const config = QUALITY_RESOURCE_CONFIG[resource];
  if (!config) return notFound();
  // 批次是只读视图（fields 为空数组）：没有可维护字段，因此不渲染新增 / 编辑入口。
  // 其它主数据（类别 / 设备类型 / 设备 / 指标）字段齐全，保持原有 CRUD。
  const isBatchLedger = resource === 'batches';
  const canWrite = config.fields.length > 0;
  return (
    <DataManager
      resource={resource}
      {...config}
      // 批次页的表单字段就是「产品数据」导入模板的列：模板字段直接取 fields，templateColumns 留空。
      fields={isBatchLedger ? PRODUCT_IMPORT_FIELDS : config.fields}
      canCreate={canWrite}
      canEdit={canWrite}
      templateColumns={[]}
      templateNotes={isBatchLedger ? PRODUCT_IMPORT_NOTES : undefined}
      templateSample={isBatchLedger ? PRODUCT_IMPORT_SAMPLE : undefined}
    />
  );
}
