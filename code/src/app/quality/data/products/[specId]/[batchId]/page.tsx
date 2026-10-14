'use client';

import { useParams } from 'next/navigation';
import { ProductMeasurements } from '@/components/quality/ProductDrilldown';

export default function ProductMeasurementsPage() {
  const { specId, batchId } = useParams<{ specId: string; batchId: string }>();
  return <ProductMeasurements specId={Number(specId)} batchId={Number(batchId)} />;
}
