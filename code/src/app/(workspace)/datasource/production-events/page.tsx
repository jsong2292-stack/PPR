import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTablePanel, type DataTableColumn } from '@/components/datasource/DataTablePanel';
import { requirePermission } from '@/lib/auth/session';
import { queryScalar } from '@/lib/db';
import { fmtCount } from '@/lib/format';
import { listProductionEvents } from '@/lib/repositories/batchRepository';

export const metadata: Metadata = { title: '生产事件记录' };
export const dynamic = 'force-dynamic';

const EVENT_TYPE_LABELS: Record<string, string> = {
  start: '开机',
  stop: '停机',
  restart: '重启',
  spec_changeover: '换规格',
  adjustment: '调机',
  material_change: '换料',
  other: '其他',
};

const COLUMNS: DataTableColumn[] = [
  { key: 'batchNo', label: '批次编号' },
  {
    key: 'eventType',
    label: '事件类型',
    kind: 'tag',
    map: EVENT_TYPE_LABELS,
    tone: { stop: 'high', spec_changeover: 'medium', adjustment: 'medium', start: 'normal' },
  },
  { key: 'occurTime', label: '发生时间', kind: 'datetime' },
  { key: 'endTime', label: '结束时间', kind: 'datetime' },
  { key: 'durationMinutes', label: '持续 (分钟)', kind: 'number', digits: 0, align: 'right' },
  { key: 'reason', label: '原因' },
  { key: 'detail', label: '明细' },
  { key: 'source', label: '记录来源' },
  { key: 'operatorName', label: '记录人' },
];

/**
 * 生产事件记录。
 *
 * 这类事件是判断「运行连续性」的依据：趋势规则需要知道窗口内是否发生过停机、换规格或调机，
 * 否则只能提示「未提供停机/换规格信息」。事件只追加，不在本页修改，保证追溯链完整。
 */
export default async function DatasourceProductionEventsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    keyword?: string;
    eventType?: string;
  }>;
}) {
  await requirePermission('datasource:read');

  const query = await searchParams;
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 20));
  const keyword = (query.keyword ?? '').trim() || undefined;
  const eventType = (query.eventType ?? '').trim() || undefined;

  const [result, stopCount] = await Promise.all([
    listProductionEvents({ page, pageSize, keyword, eventType }),
    queryScalar<number>("SELECT COUNT(*) FROM production_event WHERE event_type = 'stop'"),
  ]);

  return (
    <>
      <PageHeader
        title="生产事件记录"
        description="停机、换规格与调机记录，用于判断趋势变化期间的运行连续性。事件由 MES 或现场记录导入，只追加不修改。"
        meta={
          <>
            <span className="u-tag u-tag--info">共 {fmtCount(result.total)} 条事件</span>
            <span className="u-tag u-tag--medium">停机 {fmtCount(stopCount ?? 0)} 次</span>
          </>
        }
        actions={
          <>
            <Link className="u-btn" href="/datasource/batches">
              批次基础信息
            </Link>
            <Link className="u-btn u-btn--primary" href="/datasource/import">
              Excel 批量导入
            </Link>
          </>
        }
      />

      <div className="u-stats">
        <div className="u-stat">
          <span className="u-stat__label">事件总数</span>
          <span className="u-stat__value">{fmtCount(result.total)}</span>
          <span className="u-stat__hint">production_event 记录数</span>
        </div>
        <div className="u-stat">
          <span className="u-stat__label">停机事件</span>
          <span className="u-stat__value">{fmtCount(stopCount ?? 0)}</span>
          <span className="u-stat__hint">event_type = stop</span>
        </div>
      </div>

      <DataTablePanel
        resource="production-events"
        columns={COLUMNS}
        initialRows={result.rows as unknown as Array<Record<string, unknown>>}
        initialTotal={result.total}
        initialPage={page}
        initialPageSize={pageSize}
        initialKeyword={keyword ?? ''}
        initialFilters={{ eventType: eventType ?? '' }}
        searchPlaceholder="搜索批次编号、原因或明细"
        filters={[
          {
            name: 'eventType',
            label: '事件类型',
            options: Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => ({ value, label })),
          },
        ]}
        emptyText="没有符合条件的生产事件。"
        detail={{
          title: '生产事件详情',
          fields: [
            { key: 'batchNo', label: '批次编号' },
            {
              key: 'eventType',
              label: '事件类型',
              kind: 'tag',
              map: EVENT_TYPE_LABELS,
            },
            { key: 'occurTime', label: '发生时间', kind: 'datetime' },
            { key: 'endTime', label: '结束时间', kind: 'datetime' },
            { key: 'durationMinutes', label: '持续 (分钟)', kind: 'number', digits: 0 },
            { key: 'reason', label: '原因' },
            { key: 'detail', label: '明细' },
            { key: 'source', label: '记录来源' },
            { key: 'operatorName', label: '记录人' },
          ],
        }}
      />
    </>
  );
}
