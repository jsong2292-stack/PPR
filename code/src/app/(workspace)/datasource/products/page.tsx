import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTablePanel, type DataTableColumn } from '@/components/datasource/DataTablePanel';
import { requirePermission } from '@/lib/auth/session';
import { queryScalar } from '@/lib/db';
import { fmtCount } from '@/lib/format';
import { listProductData } from '@/lib/repositories/diagnosisRepository';

export const metadata: Metadata = { title: '产品数据' };
export const dynamic = 'force-dynamic';

const COLUMNS: DataTableColumn[] = [
  { key: 'code', label: '产品数据编号' },
  { key: 'batchNo', label: '批次编号' },
  { key: 'productionDate', label: '生产日期', kind: 'date' },
  { key: 'dataSourceName', label: '数据来源' },
  { key: 'outerDiameterMm', label: '外径 (mm)', kind: 'number', digits: 3, align: 'right' },
  { key: 'minWallThicknessMm', label: '最小壁厚 (mm)', kind: 'number', digits: 3, align: 'right' },
  { key: 'maxWallThicknessMm', label: '最大壁厚 (mm)', kind: 'number', digits: 3, align: 'right' },
  { key: 'ovalityMm', label: '不圆度 (mm)', kind: 'number', digits: 3, align: 'right' },
  {
    key: 'ovalityEffectiveMm',
    label: '有效不圆度 (mm)',
    kind: 'number',
    digits: 3,
    align: 'right',
  },
];

/**
 * 产品数据（在线测量台账）。
 *
 * 数据模型：product_data（批次 + 生产日期唯一）+ product_data_value（长表，一个指标一行）。
 * 缺失指标没有值行 → 视图 v_product_data_wide 返回 NULL → 界面显示「无数据」，绝不显示 0。
 * 默认视图（第 1 页且无关键字）由服务端直接取宽表视图；筛选与翻页走接口。
 */
export default async function DatasourceProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; keyword?: string }>;
}) {
  await requirePermission('datasource:read');

  const query = await searchParams;
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 20));
  const keyword = (query.keyword ?? '').trim() || undefined;

  const serverRows = page === 1 && !keyword;
  const [rows, total, batchCount] = await Promise.all([
    serverRows ? listProductData({ limit: pageSize }) : Promise.resolve([]),
    queryScalar<number>('SELECT COUNT(*) FROM product_data'),
    queryScalar<number>('SELECT COUNT(DISTINCT batch_id) FROM product_data'),
  ]);

  return (
    <>
      <PageHeader
        title="产品数据"
        description="按生产日期记录的产品尺寸数据。同一「批次 + 生产日期」只有一份，一个指标一行；没有值行的指标按「无数据」处理，不参与任何以 0 为默认值的判断。"
        meta={
          <>
            <span className="u-tag u-tag--info">共 {fmtCount(total ?? 0)} 条</span>
            <span className="u-tag">覆盖批次 {fmtCount(batchCount ?? 0)} 个</span>
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
          <span className="u-stat__label">产品数据条数</span>
          <span className="u-stat__value">{fmtCount(total ?? 0)}</span>
          <span className="u-stat__hint">product_data 表头记录数</span>
        </div>
        <div className="u-stat">
          <span className="u-stat__label">覆盖批次</span>
          <span className="u-stat__value">{fmtCount(batchCount ?? 0)}</span>
          <span className="u-stat__hint">按 batch_id 去重</span>
        </div>
      </div>

      <DataTablePanel
        resource="products"
        columns={COLUMNS}
        initialRows={rows as unknown as Array<Record<string, unknown>>}
        initialTotal={total ?? 0}
        initialPage={page}
        initialPageSize={pageSize}
        initialKeyword={keyword ?? ''}
        searchPlaceholder="搜索产品数据编号或批次编号"
        emptyText="没有符合条件的产品数据。"
        detail={{
          title: '产品数据详情',
          fields: [
            { key: 'code', label: '产品数据编号' },
            { key: 'batchNo', label: '批次编号' },
            { key: 'productionDate', label: '生产日期', kind: 'date' },
            { key: 'dataSourceName', label: '数据来源' },
            { key: 'outerDiameterMm', label: '外径 (mm)', kind: 'number', digits: 3 },
            { key: 'minWallThicknessMm', label: '最小壁厚 (mm)', kind: 'number', digits: 3 },
            { key: 'maxWallThicknessMm', label: '最大壁厚 (mm)', kind: 'number', digits: 3 },
            { key: 'ovalityMm', label: '不圆度 (mm)', kind: 'number', digits: 3 },
            { key: 'ovalityEffectiveMm', label: '有效不圆度 (mm)', kind: 'number', digits: 3 },
          ],
        }}
      />
    </>
  );
}
