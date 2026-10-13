import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTablePanel, type DataTableColumn } from '@/components/datasource/DataTablePanel';
import { requirePermission } from '@/lib/auth/session';
import { queryScalar } from '@/lib/db';
import { fmtCount } from '@/lib/format';

export const metadata: Metadata = { title: '工艺过程记录' };
export const dynamic = 'force-dynamic';

const TIME_MATCH_LABELS: Record<string, string> = {
  confirmed: '已确认',
  pending: '待确认',
  mismatch: '不匹配',
};

const COLUMNS: DataTableColumn[] = [
  { key: 'code', label: '记录编号' },
  { key: 'batchNo', label: '批次编号' },
  { key: 'equipmentName', label: '设备' },
  { key: 'recordTime', label: '记录时间', kind: 'datetime' },
  {
    key: 'timeMatchStatus',
    label: '时间匹配状态',
    kind: 'tag',
    map: TIME_MATCH_LABELS,
    tone: { confirmed: 'normal', pending: 'medium', mismatch: 'high' },
  },
  {
    key: 'haulOffFeedbackMpm',
    label: '牵引反馈速度 (m/min)',
    kind: 'number',
    digits: 2,
    align: 'right',
  },
  {
    key: 'pipeLineSpeedMpm',
    label: '管材线速度 (m/min)',
    kind: 'number',
    digits: 2,
    align: 'right',
  },
  { key: 'massOutputKgh', label: '质量产出率 (kg/h)', kind: 'number', digits: 2, align: 'right' },
  { key: 'zoneCount', label: '温区数', kind: 'number', digits: 0, align: 'right' },
];

/**
 * 工艺过程记录。
 *
 * 牵引反馈速度与管材线速度是两个独立量（前者不是后者的换算结果），因此分列保存、分列展示。
 * 温区设定 / 反馈存在 process_zone_value 长表中，偏差列由数据库生成列计算（反馈 − 设定）。
 */
export default async function DatasourceProcessPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; keyword?: string }>;
}) {
  await requirePermission('datasource:read');

  const query = await searchParams;
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 20));
  const keyword = (query.keyword ?? '').trim() || undefined;

  const [total, zoneValueCount] = await Promise.all([
    queryScalar<number>('SELECT COUNT(*) FROM process_record'),
    queryScalar<number>('SELECT COUNT(*) FROM process_zone_value'),
  ]);

  return (
    <>
      <PageHeader
        title="工艺过程记录"
        description="温区设定与反馈、牵引速度与产出记录。温区值单独成行保存，缺少反馈温度的温区显示「无数据」，偏差不参与计算。"
        meta={
          <>
            <span className="u-tag u-tag--info">共 {fmtCount(total ?? 0)} 条工艺记录</span>
            <span className="u-tag">温区取值 {fmtCount(zoneValueCount ?? 0)} 条</span>
          </>
        }
        actions={
          <>
            <Link className="u-btn" href="/datasource/readings">
              设备采集数据
            </Link>
            <Link className="u-btn u-btn--primary" href="/datasource/import">
              Excel 批量导入
            </Link>
          </>
        }
      />

      <div className="u-stats">
        <div className="u-stat">
          <span className="u-stat__label">工艺记录数</span>
          <span className="u-stat__value">{fmtCount(total ?? 0)}</span>
          <span className="u-stat__hint">process_record 记录数</span>
        </div>
        <div className="u-stat">
          <span className="u-stat__label">温区取值条数</span>
          <span className="u-stat__value">{fmtCount(zoneValueCount ?? 0)}</span>
          <span className="u-stat__hint">process_zone_value 记录数（设定 / 反馈）</span>
        </div>
      </div>

      <DataTablePanel
        resource="process"
        columns={COLUMNS}
        initialRows={[]}
        initialTotal={total ?? 0}
        initialPage={page}
        initialPageSize={pageSize}
        initialKeyword={keyword ?? ''}
        searchPlaceholder="搜索记录编号、批次编号或设备名称"
        emptyText="没有符合条件的工艺过程记录。"
        detail={{
          title: '工艺记录详情',
          fields: [
            { key: 'code', label: '记录编号' },
            { key: 'batchNo', label: '批次编号' },
            { key: 'equipmentCode', label: '设备编码' },
            { key: 'equipmentName', label: '设备名称' },
            { key: 'recordTime', label: '记录时间', kind: 'datetime' },
            {
              key: 'timeMatchStatus',
              label: '时间匹配状态',
              kind: 'tag',
              map: TIME_MATCH_LABELS,
            },
            { key: 'haulOffFeedbackMpm', label: '牵引反馈速度 (m/min)', kind: 'number', digits: 2 },
            { key: 'pipeLineSpeedMpm', label: '管材线速度 (m/min)', kind: 'number', digits: 2 },
            { key: 'massOutputKgh', label: '质量产出率 (kg/h)', kind: 'number', digits: 2 },
            { key: 'dataSourceName', label: '数据来源' },
            { key: 'remark', label: '备注' },
          ],
          list: {
            key: 'zones',
            title: '温区设定与反馈',
            emptyText: '该工艺记录没有温区取值行，全部按「无数据」处理。',
            columns: [
              { key: 'zoneCode', label: '温区编码' },
              { key: 'zoneName', label: '温区名称' },
              { key: 'setpointC', label: '设定温度 (°C)', kind: 'number', digits: 2 },
              { key: 'feedbackC', label: '反馈温度 (°C)', kind: 'number', digits: 2 },
              { key: 'deviationC', label: '偏差 (°C)', kind: 'number', digits: 2 },
            ],
          },
        }}
      />
    </>
  );
}
