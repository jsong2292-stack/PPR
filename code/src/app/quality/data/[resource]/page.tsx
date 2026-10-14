'use client';

import { useParams, notFound, redirect } from 'next/navigation';
import { DataManager } from '@/components/quality/DataManager';
import { QUALITY_RESOURCE_CONFIG, RESOURCE_TEMPLATE_EXTRAS } from '@/lib/quality-resource-config';

export default function DataPage() {
  const { resource } = useParams<{ resource: string }>();
  // 旧的「数据源管理 / 设备采集数据」已合并进设备台账（设备 → 批次 → 采集项）。
  // 跳转放在这里而不是单独建 app/quality/data/readings/page.tsx：静态段与动态段同级时，
  // 实测 dev 会把 /quality/data/readings 解析到本动态路由，放在这里两种解析结果都成立。
  if (resource === 'readings') redirect('/quality/data/equipment');
  const config = QUALITY_RESOURCE_CONFIG[resource];
  if (!config) return notFound();
  return <DataManager resource={resource} {...config} {...(RESOURCE_TEMPLATE_EXTRAS[resource] ?? {})} />;
}
