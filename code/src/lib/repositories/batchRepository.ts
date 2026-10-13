/**
 * 生产批次与生产事件（repository）。
 *
 * 生产事件（production_event）记录停机、换规格、清洗等运行状态变化：
 * 没有它，趋势判断只能提示「运行状态未提供」；显式记录后 R4 才能判断「运行连续性」，
 * 而不是让工程师自己去猜某个点突变是不是因为换了规格。
 */
import { query, queryOne, type RowDataPacket } from '../db';
import type { PageResult } from '../types';

export interface BatchListItem {
  id: number;
  batchNo: string;
  specId: number;
  specName: string;
  categoryName: string | null;
  lineId: number | null;
  lineName: string | null;
  extruderId: number | null;
  extruderCode: string | null;
  haulOffId: number | null;
  haulOffCode: string | null;
  productionGroup: string | null;
  startTime: string;
  endTime: string | null;
  batchStatus: string;
  dataSourceId: number;
  dataSourceName: string | null;
  remark: string | null;
  isDeleted: number;
}

export interface ProductionEventItem {
  id: number;
  batchId: number;
  batchNo: string;
  eventType: string;
  occurTime: string;
  endTime: string | null;
  durationMinutes: number | null;
  reason: string | null;
  detail: string | null;
  source: string | null;
  operatorName: string | null;
}

interface BatchRow extends RowDataPacket {
  id: number;
  batch_no: string;
  spec_id: number;
  spec_name: string;
  category_name: string | null;
  line_id: number | null;
  line_name: string | null;
  extruder_id: number | null;
  extruder_code: string | null;
  haul_off_id: number | null;
  haul_off_code: string | null;
  production_group: string | null;
  start_time: string;
  end_time: string | null;
  batch_status: string;
  data_source_id: number;
  data_source_name: string | null;
  remark: string | null;
  is_deleted: number;
}

function mapBatch(row: BatchRow): BatchListItem {
  return {
    id: Number(row.id),
    batchNo: String(row.batch_no),
    specId: Number(row.spec_id),
    specName: String(row.spec_name ?? ''),
    categoryName: row.category_name,
    lineId: row.line_id === null ? null : Number(row.line_id),
    lineName: row.line_name,
    extruderId: row.extruder_id === null ? null : Number(row.extruder_id),
    extruderCode: row.extruder_code,
    haulOffId: row.haul_off_id === null ? null : Number(row.haul_off_id),
    haulOffCode: row.haul_off_code,
    productionGroup: row.production_group,
    startTime: String(row.start_time),
    endTime: row.end_time,
    batchStatus: String(row.batch_status ?? ''),
    dataSourceId: Number(row.data_source_id),
    dataSourceName: row.data_source_name,
    remark: row.remark,
    isDeleted: Number(row.is_deleted ?? 0),
  };
}

const BATCH_SELECT = `
  SELECT b.id, b.batch_no, b.spec_id, s.name AS spec_name, c.name AS category_name,
         b.line_id, l.name AS line_name,
         b.extruder_id, ex.code AS extruder_code,
         b.haul_off_id, ho.code AS haul_off_code,
         b.production_group, b.start_time, b.end_time, b.batch_status,
         b.data_source_id, ds.name AS data_source_name, b.remark, b.is_deleted
    FROM production_batch b
    JOIN product_spec s ON s.id = b.spec_id
    LEFT JOIN product_category c ON c.id = s.category_id
    LEFT JOIN production_line l ON l.id = b.line_id
    LEFT JOIN equipment ex ON ex.id = b.extruder_id
    LEFT JOIN equipment ho ON ho.id = b.haul_off_id
    LEFT JOIN data_source ds ON ds.id = b.data_source_id
`;

export async function listBatches(options: {
  page: number;
  pageSize: number;
  keyword?: string;
  specId?: number;
  lineId?: number;
  productionGroup?: string;
  batchStatus?: string;
}): Promise<PageResult<BatchListItem>> {
  const where: string[] = ['b.is_deleted = 0'];
  const params: unknown[] = [];

  if (options.keyword) {
    where.push('(b.batch_no LIKE ? OR s.name LIKE ?)');
    const like = `%${options.keyword}%`;
    params.push(like, like);
  }
  if (options.specId) {
    where.push('b.spec_id = ?');
    params.push(options.specId);
  }
  if (options.lineId) {
    where.push('b.line_id = ?');
    params.push(options.lineId);
  }
  if (options.productionGroup) {
    where.push('b.production_group = ?');
    params.push(options.productionGroup);
  }
  if (options.batchStatus) {
    where.push('b.batch_status = ?');
    params.push(options.batchStatus);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;

  const countRow = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS total FROM production_batch b JOIN product_spec s ON s.id = b.spec_id ${whereSql}`,
    params,
  );

  const rows = await query<BatchRow>(
    `${BATCH_SELECT} ${whereSql} ORDER BY b.start_time DESC, b.id DESC LIMIT ? OFFSET ?`,
    [...params, options.pageSize, (options.page - 1) * options.pageSize],
  );

  return {
    rows: rows.map(mapBatch),
    total: Number(countRow?.total ?? 0),
    page: options.page,
    pageSize: options.pageSize,
  };
}

/** 全部批次（下拉选择用，不翻页） */
export async function listAllBatches(): Promise<BatchListItem[]> {
  const rows = await query<BatchRow>(`${BATCH_SELECT} WHERE b.is_deleted = 0 ORDER BY b.start_time DESC`);
  return rows.map(mapBatch);
}

export async function findBatch(id: number): Promise<BatchListItem | null> {
  const row = await queryOne<BatchRow>(`${BATCH_SELECT} WHERE b.id = ?`, [id]);
  return row ? mapBatch(row) : null;
}

export async function findBatchByNo(batchNo: string): Promise<BatchListItem | null> {
  const row = await queryOne<BatchRow>(`${BATCH_SELECT} WHERE b.batch_no = ?`, [batchNo]);
  return row ? mapBatch(row) : null;
}

/** 某批次的生产事件 */
export async function listProductionEventsForBatch(batchId: number): Promise<ProductionEventItem[]> {
  const rows = await query<RowDataPacket>(
    `SELECT e.id, e.batch_id, b.batch_no, e.event_type, e.occur_time, e.end_time,
            e.duration_minutes, e.reason, e.detail, e.source, u.display_name AS operator_name
       FROM production_event e
       JOIN production_batch b ON b.id = e.batch_id
       LEFT JOIN sys_user u ON u.id = e.operator_user_id
      WHERE e.batch_id = ?
      ORDER BY e.occur_time ASC`,
    [batchId],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    batchId: Number(row.batch_id),
    batchNo: String(row.batch_no),
    eventType: String(row.event_type),
    occurTime: String(row.occur_time),
    endTime: row.end_time,
    durationMinutes: row.duration_minutes === null ? null : Number(row.duration_minutes),
    reason: row.reason,
    detail: row.detail,
    source: row.source,
    operatorName: row.operator_name,
  }));
}

export async function listProductionEvents(options: {
  page: number;
  pageSize: number;
  keyword?: string;
  batchId?: number;
  eventType?: string;
}): Promise<PageResult<ProductionEventItem>> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (options.keyword) {
    where.push('(b.batch_no LIKE ? OR e.reason LIKE ? OR e.detail LIKE ?)');
    const like = `%${options.keyword}%`;
    params.push(like, like, like);
  }
  if (options.batchId) {
    where.push('e.batch_id = ?');
    params.push(options.batchId);
  }
  if (options.eventType) {
    where.push('e.event_type = ?');
    params.push(options.eventType);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countRow = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS total FROM production_event e JOIN production_batch b ON b.id = e.batch_id ${whereSql}`,
    params,
  );

  const rows = await query<RowDataPacket>(
    `SELECT e.id, e.batch_id, b.batch_no, e.event_type, e.occur_time, e.end_time,
            e.duration_minutes, e.reason, e.detail, e.source, u.display_name AS operator_name
       FROM production_event e
       JOIN production_batch b ON b.id = e.batch_id
       LEFT JOIN sys_user u ON u.id = e.operator_user_id
      ${whereSql}
      ORDER BY e.occur_time DESC, e.id DESC
      LIMIT ? OFFSET ?`,
    [...params, options.pageSize, (options.page - 1) * options.pageSize],
  );

  return {
    rows: rows.map((row) => ({
      id: Number(row.id),
      batchId: Number(row.batch_id),
      batchNo: String(row.batch_no),
      eventType: String(row.event_type),
      occurTime: String(row.occur_time),
      endTime: row.end_time,
      durationMinutes: row.duration_minutes === null ? null : Number(row.duration_minutes),
      reason: row.reason,
      detail: row.detail,
      source: row.source,
      operatorName: row.operator_name,
    })),
    total: Number(countRow?.total ?? 0),
    page: options.page,
    pageSize: options.pageSize,
  };
}

/** 批次 × 抽检时间网格（质量监控首页） */
export interface HeatmapCell {
  recordId: number | null;
  batchId: number;
  batchNo: string;
  batchGroup: string | null;
  inspectTime: string;
  riskType: 'normal' | 'medium' | 'high' | 'error';
  ruleCode: string | null;
  eventId: number | null;
  eventCode: string | null;
  metricName: string | null;
}

export async function heatmapData(options: {
  specId?: number;
  from?: string;
  to?: string;
  batchLimit?: number;
}): Promise<{ batches: Array<{ batchId: number; batchNo: string; productionGroup: string | null }>; times: string[]; cells: HeatmapCell[] }> {
  const where: string[] = ["r.record_status = 'valid'"];
  const params: unknown[] = [];
  if (options.specId) {
    where.push('r.spec_id = ?');
    params.push(options.specId);
  }
  if (options.from) {
    where.push('r.inspect_time >= ?');
    params.push(options.from);
  }
  if (options.to) {
    where.push('r.inspect_time <= ?');
    params.push(options.to);
  }

  const rows = await query<RowDataPacket>(
    `SELECT r.id AS record_id, r.batch_id, b.batch_no, r.production_group,
            r.inspect_time,
            e.id AS event_id, e.code AS event_code, e.risk_type, e.rule_code,
            m.name AS metric_name
       FROM inspection_record r
       JOIN production_batch b ON b.id = r.batch_id
       LEFT JOIN alert_event e ON e.trigger_record_id = r.id
       LEFT JOIN quality_metric m ON m.id = e.metric_id
      WHERE ${where.join(' AND ')}
      ORDER BY r.inspect_time ASC, b.batch_no ASC`,
    params,
  );

  const batchMap = new Map<number, { batchId: number; batchNo: string; productionGroup: string | null }>();
  const timeSet = new Set<string>();
  const cells: HeatmapCell[] = [];

  for (const row of rows) {
    const batchId = Number(row.batch_id);
    if (!batchMap.has(batchId)) {
      batchMap.set(batchId, {
        batchId,
        batchNo: String(row.batch_no),
        productionGroup: row.production_group,
      });
    }
    const inspectTime = String(row.inspect_time);
    timeSet.add(inspectTime);

    const riskType = (row.risk_type as HeatmapCell['riskType']) ?? 'normal';
    cells.push({
      recordId: Number(row.record_id),
      batchId,
      batchNo: String(row.batch_no),
      batchGroup: row.production_group,
      inspectTime,
      riskType,
      ruleCode: row.rule_code,
      eventId: row.event_id === null ? null : Number(row.event_id),
      eventCode: row.event_code,
      metricName: row.metric_name,
    });
  }

  const batches = [...batchMap.values()].slice(0, options.batchLimit ?? 20);

  return {
    batches,
    times: [...timeSet].sort(),
    cells,
  };
}
