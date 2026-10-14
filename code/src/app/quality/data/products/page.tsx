'use client';

import { DataManager } from '@/components/quality/DataManager';
import { QUALITY_RESOURCE_CONFIG } from '@/lib/quality-resource-config';

/**
 * 产品台账（产品列表）。
 *
 * 原来的「产品规格」和「产品数据」两页已合并到这里：
 * 点某一行的「产品数据」进入该规格的生产批次列表，再点批次进入该批次的检验记录
 * （见 app/quality/data/products/[specId]/**）。
 */
export default function ProductLedgerPage() {
  const config = QUALITY_RESOURCE_CONFIG.specs;
  return (
    <DataManager
      resource="specs"
      {...config}
      detail={{ label: '产品数据', href: (row) => `/quality/data/products/${row.id}` }}
    />
  );
}
