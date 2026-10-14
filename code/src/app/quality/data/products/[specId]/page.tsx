'use client';

import { useParams } from 'next/navigation';
import { ProductBatches } from '@/components/quality/ProductDrilldown';

export default function ProductBatchesPage() {
  const { specId } = useParams<{ specId: string }>();
  return <ProductBatches specId={Number(specId)} />;
}
