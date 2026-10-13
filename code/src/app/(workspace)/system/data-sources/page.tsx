import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataSourceTable } from '@/components/system/DataSourceTable';
import { requirePermission } from '@/lib/auth/session';
import { listDataSources } from '@/lib/services/systemService';

export const metadata: Metadata = { title: '数据来源字典' };
export const dynamic = 'force-dynamic';

/**
 * 数据来源字典（服务端页面）。
 *
 * 只管理**生产**数据源；联调期写入的模拟来源（is_simulated = 1）不在此列，
 * 也不能通过接口修改或删除。这样现场看到的「来源清单」就等同于
 * 实际已接入的系统（MES / QMS / 设备数采 / 人工录入），不会把模拟数据
 * 误当成正式生产能力。
 */
export default async function SystemDataSourcesPage() {
  const user = await requirePermission('system:read');
  const initial = await listDataSources({ page: 1, pageSize: 20 });

  return (
    <>
      <PageHeader
        title="数据来源字典"
        description="MES / QMS / 设备数采等来源的定义与状态。来源决定数据的可信度口径，删除前会检查业务数据引用。"
        meta={
          <>
            <span className="u-tag u-tag--info">真实来源 {initial.total} 个</span>
            <span className="u-tag">仅供联调的来源标记为内部模拟来源，不在本页维护</span>
          </>
        }
      />

      <div className="u-notice u-notice--info u-mb">
        本页只管理生产数据源（is_simulated = 0）。标记为模拟来源的记录不会出现在列表中，
        也不能在这里修改或删除；已被业务数据引用的来源不能删除，请改为「停用」。
      </div>

      <DataSourceTable
        initial={initial}
        canWrite={user.permissions.includes('system:write')}
      />
    </>
  );
}
