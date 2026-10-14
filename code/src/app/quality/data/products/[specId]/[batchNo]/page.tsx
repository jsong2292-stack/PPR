'use client';

import { useParams } from 'next/navigation';
import { ProductMeasurements } from '@/components/quality/ProductDrilldown';

export default function ProductMeasurementsPage() {
  // batchNo 是批次号字符串（批次不落表，批次号即唯一关联键），不要 Number()。
  const { specId, batchNo } = useParams<{ specId: string; batchNo: string }>();
  return <ProductMeasurements specId={Number(specId)} batchNo={batchNo} />;
}
