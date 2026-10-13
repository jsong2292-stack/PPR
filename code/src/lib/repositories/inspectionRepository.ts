/**
 * 抽检记录（repository）。
 *
 * 数据形态说明（这是本系统最重要的一个约定）：
 *   测量值存在「长表」中：inspection_record（表头）+ inspection_value（指标值行）。
 *   **某指标没有数据 = 不写值行**，因此这里把值聚合成数组后，
 *   调用方拿到的就是「有哪些指标、值分别是多少」，缺失指标天然不在数组里。
 *   接口层再把缺失指标返回为 null，界面统一显示「无数据」——绝不显示 0。
 *
 * 宽表视图 v_inspection_record_wide 用于列表展示；判定使用长表聚合，
 * 因为长表能覆盖任何新增指标，而宽表需要为每个指标扩列。
 */
import { query, queryOne, type RowDataPacket } from '../db';
import type { PageResult } from '../types';

export interface InspectionListItem {
  id: number;
  code: string;
  sampleNo: string;
  batchNo: string;
  batchId: number;
  specId: number;
  specName: string;
  productionGroup: string | null;
  inspectTime: string;
  productionTime: string | null;
  inspectionDelayMinutes: number | null;
  measurementStage: string;
  inspectionMethod: string | null;
  instrumentInfo: string | null;
  qualityFlag: string;
  qualityNote: string | null;
  dataSourceName: string | null;
  recordStatus: 'valid' | 'void';
  remark: string | null;
  /** 指标值，键为指标 code，缺失的指标键为 null */
  metrics: Record<string, number | null>;
}

export interface InspectionListQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  batchNo?: string;
  specId?: number;
  qualityFlag?: string;
  recordStatus?: string;
  from?: string;
  to?: string;
}

interface InspectionRow extends RowDataPacket {
  id: number;
  code: string;
  sample_no: string;
  batch_id: number;
  batch_no: string;
  spec_id: number;
  spec_name: string;
  production_group: string | null;
  inspect_time: string;
  production_time: string | null;
  inspection_delay_minutes: number | null;
  measurement_stage: string;
  inspection_method: string | null;
  instrument_info: string | null;
  quality_flag: string;
  quality_note: string | null;
  data_source_name: string | null;
  record_status: 'valid' | 'void';
  remark: string | null;
  metric_values: string | null;
}

/**
 * 把 GROUP_CONCAT 出来的 "code:value,code:value" 解析成对象
 */
function parseMetricValues(raw: string | null): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  if (!raw) return result;
  for (const chunk of raw.split(',')) {
    const separator = chunk.indexOf(':');
    if (separator === -1) continue;
    const code = chunk.slice(0, separator);
    const value = Number(chunk.slice(separator + 1));
    result[code] = Number.isFinite(value) ? value : null;
  }
  return result;
}

/**
 * 补齐派生指标。
 *
 * 不圆度是派生指标（derived）：正式口径为「同一样管同一截面的最大外径 − 最小外径」。
 * 数据库里可能存有三种状态：
 *   1) 只有最大/最小外径 → 这里计算出不圆度（与视图 v_inspection_record_wide 口径一致）
 *   2) 直接存了 ovality 值（历史台账只有不圆度、没有分项外径）→ 保留该值
 *   3) 两者都没有 → 不写该键，界面与判定都按「无数据」处理
 *
 * 这样上层（界面、规则引擎）不需要知道不圆度到底是存的还是算的。
 */
function applyDerivedMetrics(metrics: Record<string, number | null>): Record<string, number | null> {
  const maxOuter = metrics.max_outer_diameter;
  const minOuter = metrics.min_outer_diameter;
  if (
    metrics.ovality === undefined &&
    typeof maxOuter === 'number' &&
    typeof minOuter === 'number'
  ) {
    return { ...metrics, ovality: Number((maxOuter - minOuter).toFixed(4)) };
  }
  return metrics;
}

function mapRow(row: InspectionRow): InspectionListItem {
  return {
    id: Number(row.id),
    code: String(row.code),
    sampleNo: String(row.sample_no),
    batchId: Number(row.batch_id),
    batchNo: String(row.batch_no),
    specId: Number(row.spec_id),
    specName: String(row.spec_name ?? ''),
    productionGroup: row.production_group,
    inspectTime: String(row.inspect_time),
    productionTime: row.production_time,
    inspectionDelayMinutes:
      row.inspection_delay_minutes === null ? null : Number(row.inspection_delay_minutes),
    measurementStage: String(row.measurement_stage ?? ''),
    inspectionMethod: row.inspection_method,
    instrumentInfo: row.instrument_info,
    qualityFlag: String(row.quality_flag ?? 'none'),
    qualityNote: row.quality_note,
    dataSourceName: row.data_source_name,
    recordStatus: row.record_status,
    remark: row.remark,
    metrics: applyDerivedMetrics(parseMetricValues(row.metric_values)),
  };
}

const BASE_SELECT = `
  SELECT r.id, r.code, r.sample_no, r.batch_id, b.batch_no, r.spec_id, s.name AS spec_name,
         r.production_group, r.inspect_time, r.production_time, r.inspection_delay_minutes,
         r.measurement_stage, r.inspection_method, r.instrument_info,
         r.quality_flag, r.quality_note, r.record_status, r.remark,
         ds.name AS data_source_name,
         GROUP_CONCAT(CONCAT(m.code, ':', v.metric_value) ORDER BY m.sort_no) AS metric_values
    FROM inspection_record r
    JOIN production_batch b ON b.id = r.batch_id
    LEFT JOIN product_spec s ON s.id = r.spec_id
    LEFT JOIN data_source ds ON ds.id = r.data_source_id
    LEFT JOIN inspection_value v ON v.record_id = r.id
    LEFT JOIN quality_metric m ON m.id = v.metric_id
`;

/** 分页查询抽检记录（用于数据源管理列表） */
export async function listInspections(
  options: InspectionListQuery,
): Promise<PageResult<InspectionListItem>> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (options.keyword) {
    where.push('(r.code LIKE ? OR r.sample_no LIKE ? OR b.batch_no LIKE ?)');
    const like = `%${options.keyword}%`;
    params.push(like, like, like);
  }
  if (options.batchNo) {
    where.push('b.batch_no = ?');
    params.push(options.batchNo);
  }
  if (options.specId) {
    where.push('r.spec_id = ?');
    params.push(options.specId);
  }
  if (options.qualityFlag) {
    where.push('r.quality_flag = ?');
    params.push(options.qualityFlag);
  }
  if (options.recordStatus) {
    where.push('r.record_status = ?');
    params.push(options.recordStatus);
  }
  if (options.from) {
    where.push('r.inspect_time >= ?');
    params.push(options.from);
  }
  if (options.to) {
    where.push('r.inspect_time <= ?');
    params.push(options.to);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countRow = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS total
       FROM inspection_record r
       JOIN production_batch b ON b.id = r.batch_id
      ${whereSql}`,
    params,
  );
  const total = Number(countRow?.total ?? 0);

  const rows = await query<InspectionRow>(
    `${BASE_SELECT}
     ${whereSql}
     GROUP BY r.id
     ORDER BY r.inspect_time DESC, r.id DESC
     LIMIT ? OFFSET ?`,
    [...params, options.pageSize, (options.page - 1) * options.pageSize],
  );

  return { rows: rows.map(mapRow), total, page: options.page, pageSize: options.pageSize };
}

/** 单条记录详情 */
export async function findInspection(id: number): Promise<InspectionListItem | null> {
  const row = await queryOne<InspectionRow>(
    `${BASE_SELECT} WHERE r.id = ? GROUP BY r.id`,
    [id],
  );
  return row ? mapRow(row) : null;
}

/** 某批次 + 规格的全部有效记录（判定时使用，按抽检时间升序） */
export async function listBatchInspections(
  batchId: number,
  specId: number,
  limit = 200,
): Promise<InspectionListItem[]> {
  const rows = await query<InspectionRow>(
    `${BASE_SELECT}
      WHERE r.batch_id = ? AND r.spec_id = ?
      GROUP BY r.id
      ORDER BY r.inspect_time ASC
      LIMIT ?`,
    [batchId, specId, limit],
  );
  return rows.map(mapRow);
}

/** 待判定的记录：按时间窗口筛选，用于规则引擎批量扫描 */
export async function listInspectionsForScan(
  options: { from?: string; to?: string; onlyUnprocessed?: boolean; limit: number },
): Promise<InspectionListItem[]> {
  const where: string[] = ["r.record_status = 'valid'"];
  const params: unknown[] = [];

  if (options.from) {
    where.push('r.inspect_time >= ?');
    params.push(options.from);
  }
  if (options.to) {
    where.push('r.inspect_time <= ?');
    params.push(options.to);
  }

  const rows = await query<InspectionRow>(
    `${BASE_SELECT}
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     GROUP BY r.id
     ORDER BY r.inspect_time ASC
     LIMIT ?`,
    [...params, options.limit],
  );
  return rows.map(mapRow);
}
