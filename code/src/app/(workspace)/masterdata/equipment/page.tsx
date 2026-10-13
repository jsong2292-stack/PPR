import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/PageHeader';
import { MasterDataTable } from '@/components/masterdata/MasterDataTable';
import { can, requirePermission } from '@/lib/auth/session';
import { equipmentList } from '@/lib/masterdata/resources';

export const metadata: Metadata = { title: '设备台账' };
export const dynamic = 'force-dynamic';

/**
 * 设备台账（服务端页面）。
 *
 * 表单含两个引用型下拉：设备类型（equipmentTypes → /api/masterdata/equipment-types）
 * 与所属产线（lines → /api/masterdata/lines），均由 MasterDataForm 按 field.reference 自动加载。
 * 权限由服务端计算后以 props 传入（见 categories 页说明）。
 */
export default async function MasterDataEquipmentPage() {
  const user = await requirePermission('masterdata:read');
  const resource = equipmentList;

  return (
    <>
      <PageHeader
        title={resource.plural}
        description="设备编码需与设备采集数据中的设备编号一致，否则工艺数据无法与设备关联。已产生采集数据或参与过生产批次的设备不能删除，请停用后保留历史引用。"
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
