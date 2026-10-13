'use client';

import { useParams, notFound } from 'next/navigation';
import { DataManager } from '@/components/quality/DataManager';
import { QUALITY_RESOURCE_CONFIG, RESOURCE_TEMPLATE_EXTRAS } from '@/lib/quality-resource-config';

export default function DataPage() {
  const { resource } = useParams<{ resource: string }>();
  const config = QUALITY_RESOURCE_CONFIG[resource];
  if (!config) return notFound();
  return <DataManager resource={resource} {...config} {...(RESOURCE_TEMPLATE_EXTRAS[resource] ?? {})} />;
}
