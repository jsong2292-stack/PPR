/**
 * 数据源管理列表 / 详情接口。
 *
 * 路径：/api/datasource/:resource
 *   GET ?keyword=&page=&pageSize=            列表（分页 + 关键字，单页最多 200 条）
 *   GET ?id=123                              详情（含长表指标值 / 温区值）
 *
 * resource 取值：
 *   batches | products | readings | inspections | process | production-events
 *
 * 说明：
 *   - 抽检记录复用 inspectionRepository，缺失指标在 metrics 里返回 null，
 *     由界面统一显示「无数据」（绝不显示 0）。
 *   - 产品数据 / 设备采集数据 / 工艺记录需要「跨批次分页」，repository 里的
 *     既有方法要么按批次取、要么不限量，因此这里直接查宽表视图（同样手写 SQL）。
 *   - 权限：读取需要 datasource:read。
 */
import { z } from 'zod';
import { withApi, ok } from '@/lib/api';
import { AppError } from '@/lib/errors';
import { paginationSchema } from '@/lib/validation';
import { query, queryOne, type RowDataPacket } from '@/lib/db';
import { flattenZod } from '@/lib/route-helpers';
import { findBatch, listBatches, listProductionEvents } from '@/lib/repositories/batchRepository';
import { findInspection, listInspections } from '@/lib/repositories/inspectionRepository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RESOURCE_KEYS = [
  'batches',
  'products',
  'readings',
  'inspections',
  'process',
  'production-events',
] as const;

type ResourceKey = (typeof RESOURCE_KEYS)[number];

const RESOURCE_LABELS: Record<ResourceKey, string> = {
  batches: '生产批次',
  products: '产品数据',
  readings: '设备采集数据',
  inspections: '样管抽检记录',
  process: '工艺过程记录',
  'production-events': '生产事件记录',
};

function requireResource(value: string): ResourceKey {
  if ((RESOURCE_KEYS as readonly string[]).includes(value)) return value as ResourceKey;
  throw AppError.notFound(
    `未知的数据源资源：${value}（可选：${RESOURCE_KEYS.join(' / ')}）。`,
  );
}

const listQuerySchema = paginationSchema.extend({
  keyword: z.string().trim().max(64).optional(),
  id: z.coerce.number().int().positive().optional(),
  batchStatus: z.string().trim().max(32).optional(),
  eventType: z.string().trim().max(32).optional(),
  qualityFlag: z.string().trim().max(32).optional(),
  recordStatus: z.enum(['valid', 'void']).optional(),
});

type ListQuery = z.infer<typeof listQuerySchema>;

interface PageRows {
  rows: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
}

/** 关键字 LIKE 的通用参数 */
function likeOf(keyword: string): string {
  return `%${keyword}%`;
}

/** 产品数据：批次 + 生产日期唯一，日期内一个指标一行 */
async function listProducts(queryInput: ListQuery): Promise<PageRows> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (queryInput.keyword) {
    where.push('(code LIKE ? OR batch_no LIKE ?)');
    params.push(likeOf(queryInput.keyword), likeOf(queryInput.keyword));
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countRow = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS total FROM v_product_data_wide ${whereSql}`,
    params,
  );

  const rows = await query<RowDataPacket>(
    `SELECT id, code, batch_no AS batchNo, production_date AS productionDate,
            data_source_name AS dataSourceName,
            outer_diameter_mm AS outerDiameterMm,
            min_wall_thickness_mm AS minWallThicknessMm,
            max_wall_thickness_mm AS maxWallThicknessMm,
            ovality_mm AS ovalityMm,
            ovality_effective_mm AS ovalityEffectiveMm
       FROM v_product_data_wide
       ${whereSql}
       ORDER BY production_date DESC, id DESC
       LIMIT ? OFFSET ?`,
    [...params, queryInput.pageSize, (queryInput.page - 1) * queryInput.pageSize],
  );

  return {
    rows: rows as unknown as Array<Record<string, unknown>>,
    total: Number(countRow?.total ?? 0),
    page: queryInput.page,
    pageSize: queryInput.pageSize,
  };
}

/** 设备采集数据：设备 + 生产日期 + 采集时间逐小时一条 */
async function listReadings(queryInput: ListQuery): Promise<PageRows> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (queryInput.keyword) {
    where.push('(code LIKE ? OR batch_no LIKE ? OR equipment_code LIKE ?)');
    const like = likeOf(queryInput.keyword);
    params.push(like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countRow = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS total FROM v_equipment_reading_wide ${whereSql}`,
    params,
  );

  const rows = await query<RowDataPacket>(
    `SELECT id, code, batch_no AS batchNo, production_date AS productionDate,
            equipment_code AS equipmentCode, equipment_name AS equipmentName,
            collect_time AS collectTime, temperature_c AS temperatureC,
            pressure_mpa AS pressureMpa, haul_off_speed_mpm AS haulOffSpeedMpm,
            data_source_name AS dataSourceName
       FROM v_equipment_reading_wide
       ${whereSql}
       ORDER BY production_date DESC, collect_time DESC, id DESC
       LIMIT ? OFFSET ?`,
    [...params, queryInput.pageSize, (queryInput.page - 1) * queryInput.pageSize],
  );

  return {
    rows: rows as unknown as Array<Record<string, unknown>>,
    total: Number(countRow?.total ?? 0),
    page: queryInput.page,
    pageSize: queryInput.pageSize,
  };
}

/** 工艺过程记录（含批次与设备） */
async function listProcess(queryInput: ListQuery): Promise<PageRows> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (queryInput.keyword) {
    where.push('(p.code LIKE ? OR b.batch_no LIKE ? OR e.name LIKE ?)');
    const like = likeOf(queryInput.keyword);
    params.push(like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countRow = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS total
       FROM process_record p
       JOIN production_batch b ON b.id = p.batch_id
       LEFT JOIN equipment e ON e.id = p.equipment_id
       ${whereSql}`,
    params,
  );

  const rows = await query<RowDataPacket>(
    `SELECT p.id, p.code, p.batch_id AS batchId, b.batch_no AS batchNo,
            e.code AS equipmentCode, e.name AS equipmentName,
            p.record_time AS recordTime, p.time_match_status AS timeMatchStatus,
            p.haul_off_feedback_mpm AS haulOffFeedbackMpm,
            p.pipe_line_speed_mpm AS pipeLineSpeedMpm,
            p.mass_output_kgh AS massOutputKgh,
            p.data_source_id AS dataSourceId,
            ds.name AS dataSourceName,
            (SELECT COUNT(*) FROM process_zone_value z WHERE z.process_record_id = p.id) AS zoneCount
       FROM process_record p
       JOIN production_batch b ON b.id = p.batch_id
       LEFT JOIN equipment e ON e.id = p.equipment_id
       LEFT JOIN data_source ds ON ds.id = p.data_source_id
       ${whereSql}
       ORDER BY p.record_time DESC, p.id DESC
       LIMIT ? OFFSET ?`,
    [...params, queryInput.pageSize, (queryInput.page - 1) * queryInput.pageSize],
  );

  return {
    rows: rows as unknown as Array<Record<string, unknown>>,
    total: Number(countRow?.total ?? 0),
    page: queryInput.page,
    pageSize: queryInput.pageSize,
  };
}

async function listResource(resource: ResourceKey, q: ListQuery): Promise<PageRows> {
  switch (resource) {
    case 'batches': {
      const result = await listBatches({
        page: q.page,
        pageSize: q.pageSize,
        keyword: q.keyword,
        batchStatus: q.batchStatus,
      });
      return result as unknown as PageRows;
    }
    case 'production-events': {
      const result = await listProductionEvents({
        page: q.page,
        pageSize: q.pageSize,
        keyword: q.keyword,
        eventType: q.eventType,
      });
      return result as unknown as PageRows;
    }
    case 'inspections': {
      const result = await listInspections({
        page: q.page,
        pageSize: q.pageSize,
        keyword: q.keyword,
        qualityFlag: q.qualityFlag,
        recordStatus: q.recordStatus,
      });
      return result as unknown as PageRows;
    }
    case 'products':
      return listProducts(q);
    case 'readings':
      return listReadings(q);
    case 'process':
      return listProcess(q);
    default: {
      const exhaustive: never = resource;
      throw AppError.badRequest(`未实现的数据源资源：${String(exhaustive)}`);
    }
  }
}

/** 单条详情；不存在时抛 404（走统一错误体） */
async function findResourceRow(
  resource: ResourceKey,
  id: number,
): Promise<Record<string, unknown>> {
  let row: Record<string, unknown> | null = null;

  switch (resource) {
    case 'batches':
      row = (await findBatch(id)) as unknown as Record<string, unknown> | null;
      break;
    case 'inspections':
      row = (await findInspection(id)) as unknown as Record<string, unknown> | null;
      break;
    case 'products':
      row = (await queryOne<RowDataPacket>(
        `SELECT id, code, batch_no AS batchNo, production_date AS productionDate,
                data_source_name AS dataSourceName,
                outer_diameter_mm AS outerDiameterMm,
                min_wall_thickness_mm AS minWallThicknessMm,
                max_wall_thickness_mm AS maxWallThicknessMm,
                ovality_mm AS ovalityMm,
                ovality_effective_mm AS ovalityEffectiveMm
           FROM v_product_data_wide WHERE id = ?`,
        [id],
      )) as unknown as Record<string, unknown> | null;
      break;
    case 'readings':
      row = (await queryOne<RowDataPacket>(
        `SELECT id, code, batch_no AS batchNo, production_date AS productionDate,
                equipment_code AS equipmentCode, equipment_name AS equipmentName,
                collect_time AS collectTime, temperature_c AS temperatureC,
                pressure_mpa AS pressureMpa, haul_off_speed_mpm AS haulOffSpeedMpm,
                data_source_name AS dataSourceName
           FROM v_equipment_reading_wide WHERE id = ?`,
        [id],
      )) as unknown as Record<string, unknown> | null;
      break;
    case 'process': {
      const record = (await queryOne<RowDataPacket>(
        `SELECT p.id, p.code, p.batch_id AS batchId, b.batch_no AS batchNo,
                e.code AS equipmentCode, e.name AS equipmentName,
                p.record_time AS recordTime, p.time_match_status AS timeMatchStatus,
                p.haul_off_feedback_mpm AS haulOffFeedbackMpm,
                p.pipe_line_speed_mpm AS pipeLineSpeedMpm,
                p.mass_output_kgh AS massOutputKgh,
                p.production_group AS productionGroup,
                p.data_source_id AS dataSourceId, ds.name AS dataSourceName, p.remark
           FROM process_record p
           JOIN production_batch b ON b.id = p.batch_id
           LEFT JOIN equipment e ON e.id = p.equipment_id
           LEFT JOIN data_source ds ON ds.id = p.data_source_id
          WHERE p.id = ?`,
        [id],
      )) as unknown as Record<string, unknown> | null;
      if (!record) break;
      const zones = await query<RowDataPacket>(
        `SELECT z.id, t.code AS zoneCode, t.name AS zoneName,
                z.setpoint_c AS setpointC, z.feedback_c AS feedbackC,
                z.deviation_c AS deviationC
           FROM process_zone_value z
           JOIN temp_zone t ON t.id = z.zone_id
          WHERE z.process_record_id = ?
          ORDER BY t.sort_no, t.id`,
        [id],
      );
      row = { ...record, zones };
      break;
    }
    case 'production-events':
      row = (await queryOne<RowDataPacket>(
        `SELECT e.id, e.batch_id AS batchId, b.batch_no AS batchNo, e.event_type AS eventType,
                e.occur_time AS occurTime, e.end_time AS endTime,
                e.duration_minutes AS durationMinutes, e.reason, e.detail, e.source,
                u.display_name AS operatorName
           FROM production_event e
           JOIN production_batch b ON b.id = e.batch_id
           LEFT JOIN sys_user u ON u.id = e.operator_user_id
          WHERE e.id = ?`,
        [id],
      )) as unknown as Record<string, unknown> | null;
      break;
    default: {
      const exhaustive: never = resource;
      throw AppError.badRequest(`未实现的数据源资源：${String(exhaustive)}`);
    }
  }

  if (!row) throw AppError.notFound(`${RESOURCE_LABELS[resource]}不存在（id=${id}）。`);
  return row;
}

/**
 * GET 列表 / 详情。
 * 传 id 返回单条详情，否则返回分页列表。
 */
export const GET = withApi<{ resource: string }>(
  { name: 'GET /api/datasource/:resource', permission: 'datasource:read' },
  async ({ request, params }) => {
    const resource = requireResource(params.resource);
    const url = new URL(request.url);
    const parsed = listQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      throw AppError.validation('查询参数校验未通过。', flattenZod(parsed.error));
    }
    const q = parsed.data;

    if (q.id) {
      const row = await findResourceRow(resource, q.id);
      return ok({ resource, label: RESOURCE_LABELS[resource], row });
    }

    const result = await listResource(resource, q);
    return ok({
      resource,
      label: RESOURCE_LABELS[resource],
      rows: result.rows,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    });
  },
);
