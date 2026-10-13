import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTablePanel, type DataTableColumn } from '@/components/datasource/DataTablePanel';
import { requirePermission } from '@/lib/auth/session';
import { queryScalar } from '@/lib/db';
import { fmtCount } from '@/lib/format';
import { listInspections } from '@/lib/repositories/inspectionRepository';

export const metadata: Metadata = { title: '样管抽检记录' };
export const dynamic = 'force-dynamic';

const MEASUREMENT_STAGE_LABELS: Record<string, string> = {
  initial: '初测',
  retest: '复测',
  unconfirmed: '初测/复测待确认',
};

const QUALITY_FLAG_LABELS: Record<string, string> = {
  none: '无数据质量问题',
  qms_mes_mismatch: 'QMS/MES 记录差异',
  measurement_error: '测量数据错误',
  spec_mismatch: '规格匹配待核对',
  insufficient: '数据不足',
};

const RECORD_STATUS_LABELS: Record<string, string> = {
  valid: '有效',
  void: '已作废',
};

/** 指标编码 → 中文名（与 quality_metric.code 对应） */
const METRIC_LABELS: Record<string, string> = {
  outer_diameter: '外径 (mm)',
  min_wall_thickness: '最小壁厚 (mm)',
  max_wall_thickness: '最大壁厚 (mm)',
  max_outer_diameter: '最大外径 (mm)',
  min_outer_diameter: '最小外径 (mm)',
  ovality: '不圆度 (mm)',
};

const COLUMNS: DataTableColumn[] = [
  { key: 'code', label: '记录编号' },
  { key: 'sampleNo', label: '样管编号' },
  { key: 'batchNo', label: '批次编号' },
  { key: 'inspectTime', label: '抽检时间', kind: 'datetime' },
  {
    key: 'measurementStage',
    label: '测量阶段',
    kind: 'tag',
    map: MEASUREMENT_STAGE_LABELS,
  },
  {
    key: 'qualityFlag',
    label: '数据质量',
    kind: 'tag',
    map: QUALITY_FLAG_LABELS,
    tone: {
      none: 'normal',
      qms_mes_mismatch: 'medium',
      measurement_error: 'high',
      spec_mismatch: 'medium',
      insufficient: 'error',
    },
  },
  { key: 'metrics.outer_diameter', label: '外径 (mm)', kind: 'number', digits: 3, align: 'right' },
  {
    key: 'metrics.min_wall_thickness',
    label: '最小壁厚 (mm)',
    kind: 'number',
    digits: 3,
    align: 'right',
  },
  {
    key: 'metrics.max_wall_thickness',
    label: '最大壁厚 (mm)',
    kind: 'number',
    digits: 3,
    align: 'right',
  },
  { key: 'metrics.ovality', label: '不圆度 (mm)', kind: 'number', digits: 3, align: 'right' },
  {
    key: 'recordStatus',
    label: '记录状态',
    kind: 'tag',
    map: RECORD_STATUS_LABELS,
    tone: { valid: 'normal', void: 'high' },
  },
];

/**
 * 样管抽检记录。
 *
 * 关键约定（本系统最重要的一条）：指标值存在长表 inspection_value 中，
 * **某指标没有数据 = 不写值行**，repository 聚合后该指标不在 metrics 里，
 * 界面统一显示「无数据」——绝不显示 0。点开「明细」可看到全部指标的逐项状态。
 */
export default async function DatasourceInspectionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    keyword?: string;
    qualityFlag?: string;
    recordStatus?: string;
  }>;
}) {
  await requirePermission('datasource:read');

  const query = await searchParams;
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 20));
  const keyword = (query.keyword ?? '').trim() || undefined;
  const qualityFlag = (query.qualityFlag ?? '').trim() || undefined;
  const recordStatus = query.recordStatus === 'valid' || query.recordStatus === 'void'
    ? query.recordStatus
    : undefined;

  const [result, voidCount] = await Promise.all([
    listInspections({ page, pageSize, keyword, qualityFlag, recordStatus }),
    queryScalar<number>("SELECT COUNT(*) FROM inspection_record WHERE record_status = 'void'"),
  ]);

  return (
    <>
      <PageHeader
        title="样管抽检记录"
        description="样管抽检台账：尺寸测量值、检验方法、量具与数据质量标记。指标值按「记录 × 指标」长表保存，缺失指标显示「无数据」而不是 0。"
        meta={
          <>
            <span className="u-tag u-tag--info">共 {fmtCount(result.total)} 条记录</span>
            <span className="u-tag">已作废 {fmtCount(voidCount ?? 0)} 条</span>
          </>
        }
        actions={
          <>
            <Link className="u-btn" href="/monitor">
              质量监控
            </Link>
            <Link className="u-btn u-btn--primary" href="/datasource/import">
              Excel 批量导入
            </Link>
          </>
        }
      />

      <div className="u-stats">
        <div className="u-stat">
          <span className="u-stat__label">抽检记录总数</span>
          <span className="u-stat__value">{fmtCount(result.total)}</span>
          <span className="u-stat__hint">inspection_record 记录数</span>
        </div>
        <div className="u-stat">
          <span className="u-stat__label">已作废</span>
          <span className="u-stat__value">{fmtCount(voidCount ?? 0)}</span>
          <span className="u-stat__hint">record_status = void（不物理删除）</span>
        </div>
      </div>

      <DataTablePanel
        resource="inspections"
        columns={COLUMNS}
        initialRows={result.rows as unknown as Array<Record<string, unknown>>}
        initialTotal={result.total}
        initialPage={page}
        initialPageSize={pageSize}
        initialKeyword={keyword ?? ''}
        initialFilters={{ qualityFlag: qualityFlag ?? '', recordStatus: recordStatus ?? '' }}
        searchPlaceholder="搜索记录编号、样管编号或批次编号"
        filters={[
          {
            name: 'qualityFlag',
            label: '数据质量',
            options: Object.entries(QUALITY_FLAG_LABELS).map(([value, label]) => ({ value, label })),
          },
          {
            name: 'recordStatus',
            label: '记录状态',
            options: [
              { value: 'valid', label: '有效' },
              { value: 'void', label: '已作废' },
            ],
          },
        ]}
        emptyText="没有符合条件的抽检记录。"
        detail={{
          title: '抽检记录明细',
          fields: [
            { key: 'code', label: '记录编号' },
            { key: 'sampleNo', label: '样管编号' },
            { key: 'batchNo', label: '批次编号' },
            { key: 'specName', label: '产品规格' },
            { key: 'productionGroup', label: '生产组别' },
            { key: 'inspectTime', label: '抽检时间', kind: 'datetime' },
            { key: 'productionTime', label: '生产时间', kind: 'datetime' },
            { key: 'inspectionMethod', label: '检验方法' },
            { key: 'instrumentInfo', label: '量具 / 仪器' },
            { key: 'dataSourceName', label: '数据来源' },
          ],
          metrics: {
            key: 'metrics',
            unit: 'mm',
            digits: 3,
            labels: METRIC_LABELS,
          },
        }}
      />

      <p className="u-xs u-faint u-mt">
        「无数据」表示该记录没有对应的指标值行（不是 0）；判定与统计时必须按缺失处理，
        不能用 0 参与计算。
      </p>
    </>
  );
}
