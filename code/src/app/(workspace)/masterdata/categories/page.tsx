import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/PageHeader';
import { MasterDataTable } from '@/components/masterdata/MasterDataTable';
import { can, requirePermission } from '@/lib/auth/session';
import { productCategories } from '@/lib/masterdata/resources';

export const metadata: Metadata = { title: '产品类别' };
export const dynamic = 'force-dynamic';

/**
 * 产品类别（服务端页面）。
 *
 * 本页不手写任何字段：列与表单字段都取自 `MASTER_RESOURCES.categories` 的配置，
 * 客户端组件只负责交互（搜索 / 分页 / 增删改）。
 *
 * 权限传递方式：服务端 `requirePermission('masterdata:read')` 拿到会话用户后，
 * 用 `can()` 算出写入 / 删除权限并作为 props 传给客户端组件（因此不在前端再请求
 * `/api/auth/session`，避免按钮渲染抖动）。接口侧仍各自声明权限，前端隐藏只是体验优化。
 */
export default async function MasterDataCategoriesPage() {
  const user = await requirePermission('masterdata:read');
  const resource = productCategories;

  return (
    <>
      <PageHeader
        title={resource.plural}
        description="产品类别是规格、批次与指标限值配置的归类基础。类别编码全库唯一；删除时若仍有产品规格引用，服务端会拒绝并说明引用来源，此时建议改为「停用」。"
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
