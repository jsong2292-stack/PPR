import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/PageHeader';
import { MasterDataTable } from '@/components/masterdata/MasterDataTable';
import { can, requirePermission } from '@/lib/auth/session';
import { equipmentTypes } from '@/lib/masterdata/resources';

export const metadata: Metadata = { title: '设备类型' };
export const dynamic = 'force-dynamic';

/**
 * 设备类型（服务端页面）。
 *
 * 列 / 字段全部来自 `MASTER_RESOURCES['equipment-types']` 配置，页面本身不定义字段。
 * 权限由服务端计算后以 props 传入（见 categories 页说明）。
 */
export default async function MasterDataEquipmentTypesPage() {
  const user = await requirePermission('masterdata:read');
  const resource = equipmentTypes;

  return (
    <>
      <PageHeader
        title={resource.plural}
        description="设备类型用于设备台账归类，并作为分析时判断设备性质的口径。删除类型前会检查是否仍有设备引用，被引用的类型请改为「停用」而不是删除。"
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
