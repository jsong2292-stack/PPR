import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/PageHeader';
import { MasterDataTable } from '@/components/masterdata/MasterDataTable';
import { can, requirePermission } from '@/lib/auth/session';
import { productSpecs } from '@/lib/masterdata/resources';

export const metadata: Metadata = { title: '产品规格' };
export const dynamic = 'force-dynamic';

/**
 * 产品规格（服务端页面）。
 *
 * 「产品类别」是引用型字段：表单里由 MasterDataForm 请求
 * `/api/masterdata/categories?options=1` 取下拉选项，不在本页硬编码选项。
 * 权限同样由服务端计算后以 props 传入（见 categories 页说明）。
 */
export default async function MasterDataSpecsPage() {
  const user = await requirePermission('masterdata:read');
  const resource = productSpecs;

  return (
    <>
      <PageHeader
        title={resource.plural}
        description="产品规格维护公称外径、公称壁厚与不圆度上限；生产批次、抽检记录与规格限值均按规格引用，因此规格编码一旦被引用就不应再改。"
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
