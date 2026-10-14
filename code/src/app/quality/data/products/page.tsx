'use client';

import { DataManager } from '@/components/quality/DataManager';
import { QUALITY_RESOURCE_CONFIG } from '@/lib/quality-resource-config';

/**
 * 产品台账（产品列表）。
 *
 * 原来的「产品规格」和「产品数据」两页已合并到这里：
 * 点某一行的「产品数据」进入该规格的生产批次列表，再点批次进入该批次的检验记录
 * （见 app/quality/data/products/[specId]/**）。
 *
 * 台账最外层（规格）是判定限值的来源，删除会波及该规格下全部批次与检验数据，
 * 因此本页不提供删除入口（removable={false}）：删除只开放给批次及批次下钻的明细数据。
 */
export default function ProductLedgerPage() {
  const config = QUALITY_RESOURCE_CONFIG.specs;
  return (
    <DataManager
      resource="specs"
      {...config}
      removable={false}
      detail={{ label: '产品数据', href: (row) => `/quality/data/products/${row.id}` }}
    />
  );
}
