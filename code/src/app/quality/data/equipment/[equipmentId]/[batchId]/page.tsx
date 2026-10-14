'use client';

import { useParams } from 'next/navigation';
import { EquipmentReadings } from '@/components/quality/EquipmentReadings';

export default function EquipmentReadingsPage() {
  const { equipmentId, batchId } = useParams<{ equipmentId: string; batchId: string }>();
  return <EquipmentReadings equipmentId={Number(equipmentId)} batchId={Number(batchId)} />;
}
