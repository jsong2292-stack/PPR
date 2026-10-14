'use client';

import { DataManager } from '@/components/quality/DataManager';
import { QUALITY_RESOURCE_CONFIG } from '@/lib/quality-resource-config';

/**
 * 设备台账（设备列表）。
 *
 * 「设备采集数据」已合并到本页：点某一行的「采集数据」进入该设备的生产批次列表，
 * 再点批次进入该批次的采集项列表（见 app/quality/data/equipment/[equipmentId]/**）。
 *
 * 台账最外层（设备）是设备档案，删除会影响批次关联与采集数据，
 * 因此本页不提供删除入口（removable={false}）：删除只开放给批次及批次下钻的明细数据。
 */
export default function EquipmentLedgerPage() {
  const config = QUALITY_RESOURCE_CONFIG.equipment;
  return (
    <DataManager
      resource="equipment"
      {...config}
      removable={false}
      detail={{ label: '采集数据', href: (row) => `/quality/data/equipment/${row.id}` }}
    />
  );
}
