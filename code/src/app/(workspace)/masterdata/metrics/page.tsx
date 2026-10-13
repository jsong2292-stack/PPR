import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/PageHeader';
import { MasterDataTable } from '@/components/masterdata/MasterDataTable';
import { can, requirePermission } from '@/lib/auth/session';
import { qualityMetrics } from '@/lib/masterdata/resources';

export const metadata: Metadata = { title: '质量指标与影响因素' };
export const dynamic = 'force-dynamic';

/**
 * 质量指标与影响因素（服务端页面）。
 *
 * 指标编码（code）是抽检值、限值与预警事件的外键语义，改动会影响历史数据解释；
 * 指标角色（primary / raw / derived）决定其是否参与合格判定。
 * 列 / 字段全部来自 `MASTER_RESOURCES.metrics` 配置；权限由服务端计算后以 props 传入。
 */
export default async function MasterDataMetricsPage() {
  const user = await requirePermission('masterdata:read');
  const resource = qualityMetrics;

  return (
    <>
      <PageHeader
        title={resource.plural}
        description="指标字典维护单位、展示小数位、指标角色与核查方向提示。核查方向提示只表示排查方向，不等于已验证根因；指标编码需为小写字母开头，仅含小写字母、数字与下划线。"
      />

      <div className="u-notice u-notice--warning u-mb">
        指标的规格上下限在「规格限值配置」中按 规格 × 指标 维护，当前限值取自额定参数，
        标定状态为「阈值待现场标定」，尚未用现场数据验证；因此由限值触发的结论只用于提示复核，
        不作为产品合格判定依据。标定完成后再更新限值并把标定状态改为「已标定」。
      </div>

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
