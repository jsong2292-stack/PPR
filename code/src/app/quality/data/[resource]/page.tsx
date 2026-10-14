'use client';

import { useParams, notFound, redirect } from 'next/navigation';
import { DataManager } from '@/components/quality/DataManager';
import { QUALITY_RESOURCE_CONFIG } from '@/lib/quality-resource-config';

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
  return <DataManager resource={resource} {...config} />;
}
