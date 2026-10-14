'use client';

import { useParams } from 'next/navigation';
import { EquipmentReadings } from '@/components/quality/EquipmentReadings';

export default function EquipmentReadingsPage() {
  // batchNo 是批次号字符串（批次不落表，批次号即唯一关联键），不要 Number()。
  const { equipmentId, batchNo } = useParams<{ equipmentId: string; batchNo: string }>();
  return <EquipmentReadings equipmentId={Number(equipmentId)} batchNo={batchNo} />;
}
