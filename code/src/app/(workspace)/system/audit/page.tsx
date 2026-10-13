import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/PageHeader';
import { AuditTable } from '@/components/system/AuditTable';
import { requirePermission } from '@/lib/auth/session';
import { listAuditFacets, listOperationLogs } from '@/lib/services/systemService';
import { fmtCount } from '@/lib/format';

export const metadata: Metadata = { title: '操作日志' };
export const dynamic = 'force-dynamic';

/**
 * 操作日志（服务端页面，只读）。
 *
 * 审计回答的是「谁在什么时候对哪条数据做了什么」：登录、主数据增删改、
 * 结论确认、报告定稿、归档、通知与系统管理改动都会写入 operation_log。
 * 本页只提供查询，不提供任何编辑与删除入口 —— 审计记录不允许人工修改。
 */
export default async function SystemAuditPage() {
  await requirePermission('system:read');
  const [initial, facets] = await Promise.all([
    listOperationLogs({ page: 1, pageSize: 20 }),
    listAuditFacets(),
  ]);

  return (
    <>
      <PageHeader
        title="操作日志"
        description="登录、数据变更、结论确认、报告定稿与系统管理操作的审计追踪。只读，不支持修改或删除。"
        meta={
          <>
            <span className="u-tag u-tag--info">日志 {fmtCount(initial.total)} 条</span>
            <span className="u-tag">只读</span>
          </>
        }
      />

      <AuditTable initial={initial} facets={facets} />
    </>
  );
}
