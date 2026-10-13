import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/PageHeader';
import { MasterDataTable } from '@/components/masterdata/MasterDataTable';
import { can, requirePermission } from '@/lib/auth/session';
import { productionLines } from '@/lib/masterdata/resources';

export const metadata: Metadata = { title: '产线与工段' };
export const dynamic = 'force-dynamic';

/**
 * 产线与工段（服务端页面）。
 *
 * 产线用于判断参考批次的同产线可比性，因此产线编码是分析口径的一部分。
 * 列 / 字段全部来自 `MASTER_RESOURCES.lines` 配置；权限由服务端计算后以 props 传入。
 */
export default async function MasterDataLinesPage() {
  const user = await requirePermission('masterdata:read');
  const resource = productionLines;

  return (
    <>
      <PageHeader
        title={resource.plural}
        description="产线 / 工段台账，用于判断参考批次是否同产线可比。已关联生产批次的产线不能删除，请改为「停用」，历史批次的产线归属需要保留。"
      />
      <MasterDataTable
        resourceKey={resource.key}
        singular={resource.singular}
        plural={resource.plural}
        columns={resource.columns}
        fields={resource.fields}
        canWrite={can(user, resource.permissions.write)}
        canDelete={can(user, resource.permissions.remove)}
      />
    </>
  );
}
