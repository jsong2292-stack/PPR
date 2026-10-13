import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTablePanel, type DataTableColumn } from '@/components/datasource/DataTablePanel';
import { requirePermission } from '@/lib/auth/session';
import { queryOne, queryScalar, type RowDataPacket } from '@/lib/db';
import { fmtCount } from '@/lib/format';

export const metadata: Metadata = { title: '设备采集数据' };
export const dynamic = 'force-dynamic';

const COLUMNS: DataTableColumn[] = [
  { key: 'code', label: '记录编号' },
  { key: 'batchNo', label: '批次编号' },
  { key: 'productionDate', label: '生产日期', kind: 'date' },
  { key: 'equipmentCode', label: '设备编码' },
  { key: 'equipmentName', label: '设备名称' },
  { key: 'collectTime', label: '采集时间', kind: 'time' },
  { key: 'temperatureC', label: '温度 (°C)', kind: 'number', digits: 2, align: 'right' },
  { key: 'pressureMpa', label: '压力 (MPa)', kind: 'number', digits: 3, align: 'right' },
  { key: 'haulOffSpeedMpm', label: '牵引速度 (m/min)', kind: 'number', digits: 2, align: 'right' },
  { key: 'dataSourceName', label: '数据来源' },
];

/**
 * 设备采集数据。
 *
 * 数据模型：equipment_reading（设备 + 生产日期 + 采集时间逐小时唯一）+ equipment_reading_value（长表）。
 * 挤出机行没有牵引速度值行 → 视图返回 NULL → 显示「无数据」，与「速度 = 0」严格区分。
 *
 * 列表数据按当前查询参数由客户端调用 /api/datasource/readings 获取（该资源需要跨批次分页，
 * 服务端首屏只提供统计量），保证地址栏里的分页 / 搜索参数始终与表格内容一致。
 */
export default async function DatasourceReadingsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; keyword?: string }>;
}) {
  await requirePermission('datasource:read');

  const query = await searchParams;
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 20));
  const keyword = (query.keyword ?? '').trim() || undefined;

  const [total, equipmentCount, span] = await Promise.all([
    queryScalar<number>('SELECT COUNT(*) FROM equipment_reading'),
    queryScalar<number>('SELECT COUNT(DISTINCT equipment_id) FROM equipment_reading'),
    queryOne<RowDataPacket & { minDate: string | null; maxDate: string | null }>(
      'SELECT MIN(production_date) AS minDate, MAX(production_date) AS maxDate FROM equipment_reading',
    ),
  ]);

  return (
    <>
      <PageHeader
        title="设备采集数据"
        description="按「设备 + 生产日期 + 采集时间」逐小时记录的温度、压力与牵引速度。没有采集到的参数不写值行，界面统一显示「无数据」，不参与以 0 为默认值的计算。"
        meta={
          <>
            <span className="u-tag u-tag--info">共 {fmtCount(total ?? 0)} 条</span>
            <span className="u-tag">涉及设备 {fmtCount(equipmentCount ?? 0)} 台</span>
            <span className="u-tag">
              采集日期 {span?.minDate ?? '无数据'} ~ {span?.maxDate ?? '无数据'}
            </span>
          </>
        }
        actions={
          <>
            <Link className="u-btn" href="/datasource/process">
              工艺过程记录
            </Link>
            <Link className="u-btn u-btn--primary" href="/datasource/import">
              Excel 批量导入
            </Link>
          </>
        }
      />

      <div className="u-stats">
        <div className="u-stat">
          <span className="u-stat__label">采集记录数</span>
          <span className="u-stat__value">{fmtCount(total ?? 0)}</span>
          <span className="u-stat__hint">equipment_reading 表头记录数</span>
        </div>
        <div className="u-stat">
          <span className="u-stat__label">涉及设备</span>
          <span className="u-stat__value">{fmtCount(equipmentCount ?? 0)}</span>
          <span className="u-stat__hint">按 equipment_id 去重</span>
        </div>
        <div className="u-stat">
          <span className="u-stat__label">采集日期跨度</span>
          <span className="u-stat__value" style={{ fontSize: 16 }}>
            {span?.minDate ?? '无数据'} ~ {span?.maxDate ?? '无数据'}
          </span>
          <span className="u-stat__hint">生产日期最小 / 最大值</span>
        </div>
      </div>

      <DataTablePanel
        resource="readings"
        columns={COLUMNS}
        initialRows={[]}
        initialTotal={total ?? 0}
        initialPage={page}
        initialPageSize={pageSize}
        initialKeyword={keyword ?? ''}
        searchPlaceholder="搜索记录编号、批次编号或设备编码"
        emptyText="没有符合条件的设备采集数据。"
        detail={{
          title: '采集记录详情',
          fields: [
            { key: 'code', label: '记录编号' },
            { key: 'batchNo', label: '批次编号' },
            { key: 'productionDate', label: '生产日期', kind: 'date' },
            { key: 'equipmentCode', label: '设备编码' },
            { key: 'equipmentName', label: '设备名称' },
            { key: 'collectTime', label: '采集时间', kind: 'time' },
            { key: 'temperatureC', label: '温度 (°C)', kind: 'number', digits: 2 },
            { key: 'pressureMpa', label: '压力 (MPa)', kind: 'number', digits: 3 },
            { key: 'haulOffSpeedMpm', label: '牵引速度 (m/min)', kind: 'number', digits: 2 },
            { key: 'dataSourceName', label: '数据来源' },
          ],
        }}
      />
    </>
  );
}
