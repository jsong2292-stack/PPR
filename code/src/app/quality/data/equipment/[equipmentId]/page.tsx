'use client';

import { useParams } from 'next/navigation';
import { EquipmentBatches } from '@/components/quality/EquipmentBatches';

export default function EquipmentBatchesPage() {
  const { equipmentId } = useParams<{ equipmentId: string }>();
  return <EquipmentBatches equipmentId={Number(equipmentId)} />;
}
