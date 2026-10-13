/**
 * 质量监控（应用服务层）。
 *
 * 页面需要的数据在这里一次组装好，避免页面里散落多段查询语句：
 *   - 概览统计（筛查点数、异常事件数、待处理数）
 *   - 批次 × 抽检时间风险网格
 *   - 抽检记录详情（含触发事件、关联事件、数据核对结论）
 */
import { alertEventSummary, listAlertEvents, type AlertEventListItem } from '../repositories/alertEventRepository';
import {
  heatmapData,
  listAllBatches,
  type HeatmapCell,
} from '../repositories/batchRepository';
import { findInspection, type InspectionListItem } from '../repositories/inspectionRepository';
import { listMetrics, specLimitsForSpec, type MetricDefinition, type SpecLimitDefinition } from '../repositories/metricRepository';

export interface MonitorOverview {
  batches: Array<{ batchId: number; batchNo: string; productionGroup: string | null }>;
  times: string[];
  cells: HeatmapCell[];
  summary: {
    total: number;
    open: number;
    byRisk: Record<string, number>;
    byHandling: Record<string, number>;
    byRule: Record<string, number>;
  };
  /** 抽检点总数（去重后的记录条数） */
  inspectedCount: number;
  pendingEngineerCount: number;
  openEvents: AlertEventListItem[];
  metrics: MetricDefinition[];
  batchesAll: Awaited<ReturnType<typeof listAllBatches>>;
}

/** 监控页首屏数据 */
export async function loadMonitorOverview(options?: {
  specId?: number;
  from?: string;
  to?: string;
}): Promise<MonitorOverview> {
  const [heat, summary, metrics, batchesAll, openEvents] = await Promise.all([
    heatmapData({ specId: options?.specId, from: options?.from, to: options?.to, batchLimit: 20 }),
    alertEventSummary(),
    listMetrics(),
    listAllBatches(),
    listAlertEvents({ page: 1, pageSize: 50, openOnly: true, riskType: undefined }),
  ]);

  const inspectedCount = heat.cells.length;

  return {
    batches: heat.batches,
    times: heat.times,
    cells: heat.cells,
    summary: {
      total: summary.total,
      open: summary.open,
      byRisk: summary.byRisk,
      byHandling: summary.byHandling,
      byRule: summary.byRule,
    },
    inspectedCount,
    pendingEngineerCount: openEvents.total,
    openEvents: openEvents.rows.slice(0, 10),
    metrics,
    batchesAll,
  };
}

/** 抽检详情面板需要的数据 */
export interface InspectionDetailMetric {
  metricId: number;
  metricCode: string;
  metricName: string;
  unit: string | null;
  decimalScale: number;
  /** null 表示该指标无数据（界面与判定都按「无数据」处理，不显示 0） */
  value: number | null;
  lowerLimit: number | null;
  upperLimit: number | null;
}

export interface InspectionDetail {
  record: InspectionListItem;
  /** 指标字典顺序的测量值 + 限值对照 */
  metrics: InspectionDetailMetric[];
  /** 由该记录触发的事件 */
  events: AlertEventListItem[];
}

export async function loadInspectionDetail(
  recordId: number,
): Promise<InspectionDetail | null> {
  const record = await findInspection(recordId);
  if (!record) return null;

  const [metricDefs, limits, eventPage] = await Promise.all([
    listMetrics(),
    specLimitsForSpec(record.specId),
    listAlertEvents({ page: 1, pageSize: 100, batchNo: record.batchNo }),
  ]);

  const metrics: InspectionDetailMetric[] = metricDefs.map((definition) => {
    const limit = limits.get(definition.id);
    return {
      metricId: definition.id,
      metricCode: definition.code,
      metricName: definition.name,
      unit: definition.unit,
      decimalScale: definition.decimalScale,
      // 记录里没有该指标就返回 null —— 对应数据库「缺失 = 不写值行」
      value: record.metrics[definition.code] ?? null,
      lowerLimit: limit?.lowerLimit ?? null,
      upperLimit: limit?.upperLimit ?? null,
    };
  });

  return {
    record,
    metrics,
    events: eventPage.rows.filter((event) => event.triggerRecordId === recordId),
  };
}
