import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTablePanel, type DataTableColumn } from '@/components/datasource/DataTablePanel';
import { requirePermission } from '@/lib/auth/session';
import { queryScalar } from '@/lib/db';
import { fmtCount } from '@/lib/format';
import { listBatches } from '@/lib/repositories/batchRepository';

export const metadata: Metadata = { title: '批次基础信息' };
export const dynamic = 'force-dynamic';

const BATCH_STATUS_LABELS: Record<string, string> = {
  planned: '计划',
  in_progress: '生产中',
  completed: '已完成',
  cancelled: '已取消',
};

const COLUMNS: DataTableColumn[] = [
  { key: 'batchNo', label: '批次编号' },
  { key: 'specName', label: '产品规格' },
  { key: 'categoryName', label: '产品类别' },
  { key: 'lineName', label: '所属产线' },
  { key: 'productionGroup', label: '生产组别' },
  { key: 'startTime', label: '生产开始时间', kind: 'datetime' },
  { key: 'endTime', label: '生产结束时间', kind: 'datetime' },
  {
    key: 'batchStatus',
    label: '批次状态',
    kind: 'tag',
    map: BATCH_STATUS_LABELS,
    tone: { planned: 'info', in_progress: 'medium', completed: 'normal', cancelled: 'high' },
  },
  { key: 'dataSourceName', label: '数据来源' },
  { key: 'remark', label: '备注' },
];

/**
 * 生产批次台账。
 *
 * 列表首屏由服务端直接查库（repository），分页 / 搜索 / 详情走 /api/datasource/batches。
 * 批次是产品数据、设备采集数据、抽检记录的关联入口，因此只允许查看与导入，
 * 不在本页做单条编辑（避免打断已建立的历史引用链）。
 */
export default async function DatasourceBatchesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    keyword?: string;
    batchStatus?: string;
  }>;
}) {
  await requirePermission('datasource:read');

  const query = await searchParams;
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 20));
  const keyword = (query.keyword ?? '').trim() || undefined;
  const batchStatus = (query.batchStatus ?? '').trim() || undefined;

  const [result, inProgressCount] = await Promise.all([
    listBatches({ page, pageSize, keyword, batchStatus }),
    queryScalar<number>(
      "SELECT COUNT(*) FROM production_batch WHERE is_deleted = 0 AND batch_status = 'in_progress'",
    ),
  ]);

  return (
    <>
      <PageHeader
        title="批次基础信息"
        description="生产批次台账。产品数据与设备采集数据按「批次号 + 生产日期」关联，抽检记录按批次号关联；批次编号是导入时的自然键，必须唯一。"
        meta={
          <>
            <span className="u-tag u-tag--info">共 {fmtCount(result.total)} 个批次</span>
            <span className="u-tag">生产中 {fmtCount(inProgressCount ?? 0)} 个</span>
          </>
        }
        actions={
          <>
            <Link className="u-btn" href="/datasource/products">
              产品数据
            </Link>
            <Link className="u-btn u-btn--primary" href="/datasource/import">
              Excel 批量导入
            </Link>
          </>
        }
      />

      <div className="u-stats">
        <div className="u-stat">
          <span className="u-stat__label">批次总数</span>
          <span className="u-stat__value">{fmtCount(result.total)}</span>
          <span className="u-stat__hint">未删除的生产批次</span>
        </div>
        <div className="u-stat">
          <span className="u-stat__label">当前生产中</span>
          <span className="u-stat__value">{fmtCount(inProgressCount ?? 0)}</span>
          <span className="u-stat__hint">batch_status = in_progress</span>
        </div>
      </div>

      <DataTablePanel
        resource="batches"
        columns={COLUMNS}
        initialRows={result.rows as unknown as Array<Record<string, unknown>>}
        initialTotal={result.total}
        initialPage={page}
        initialPageSize={pageSize}
        initialKeyword={keyword ?? ''}
        initialFilters={{ batchStatus: batchStatus ?? '' }}
        searchPlaceholder="搜索批次编号或规格名称"
        filters={[
          {
            name: 'batchStatus',
            label: '批次状态',
            options: Object.entries(BATCH_STATUS_LABELS).map(([value, label]) => ({ value, label })),
          },
        ]}
        emptyText="没有符合条件的生产批次。请先通过 Excel 批量导入批次数据。"
        detail={{
          title: '批次详情',
          fields: [
            { key: 'batchNo', label: '批次编号' },
            { key: 'specName', label: '产品规格' },
            { key: 'categoryName', label: '产品类别' },
            { key: 'lineName', label: '所属产线' },
            { key: 'extruderCode', label: '挤出设备' },
            { key: 'haulOffCode', label: '牵引设备' },
            { key: 'productionGroup', label: '生产组别' },
            { key: 'startTime', label: '生产开始时间', kind: 'datetime' },
            { key: 'endTime', label: '生产结束时间', kind: 'datetime' },
            { key: 'dataSourceName', label: '数据来源' },
            { key: 'remark', label: '备注' },
          ],
        }}
      />
    </>
  );
}
