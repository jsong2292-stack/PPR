import * as dbClient from '@/storage/database/mysql-client';

export type MasterResource =
  | 'categories'
  | 'specs'
  | 'equipment-types'
  | 'equipment'
  | 'batches'
  | 'metrics'
  | 'measurements';

export interface ResourceConfig {
  table: string;
  columns: string[];
  required: string[];
  orderBy: string;
  listSql: string;
  /**
   * 下钻页面的收窄维度：查询参数名，顺序对应 scopedListSql 里的 `?` 占位符。
   * 只有这些参数全部传齐时才会走 scopedListSql，避免下钻页面误拿到全量数据。
   */
  scopeParams?: string[];
  /** 带 WHERE 占位符的列表 SQL，供「规格 → 批次 → 检验记录」这类下钻页面使用。 */
  scopedListSql?: string;
}

/**
 * 数据源管理白名单。
 * 表名、列名只从该配置读取，用户输入只能作为值参数传入，避免动态 SQL 注入。
 */
export const RESOURCE_CONFIG: Record<MasterResource, ResourceConfig> = {
  categories: {
    table: 'ppr_product_category',
    columns: ['code', 'name', 'description', 'status'],
    required: ['code', 'name'],
    orderBy: 'id DESC',
    listSql: 'SELECT * FROM ppr_product_category ORDER BY id DESC',
  },
  specs: {
    table: 'ppr_product_spec',
    columns: ['code', 'name', 'category_id', 'outer_upper_mm', 'outer_lower_mm', 'wall_upper_mm', 'wall_lower_mm', 'ovality_upper_mm', 'status'],
    required: ['code', 'name', 'category_id', 'outer_upper_mm', 'outer_lower_mm', 'wall_upper_mm', 'wall_lower_mm', 'ovality_upper_mm'],
    orderBy: 's.id DESC',
    listSql: `SELECT s.*, c.name AS category_name FROM ppr_product_spec s
      JOIN ppr_product_category c ON c.id=s.category_id ORDER BY s.id DESC`,
  },
  'equipment-types': {
    table: 'ppr_equipment_type',
    columns: ['code', 'name', 'description', 'status'],
    required: ['code', 'name'],
    orderBy: 'id DESC',
    listSql: 'SELECT * FROM ppr_equipment_type ORDER BY id DESC',
  },
  equipment: {
    table: 'ppr_equipment',
    columns: ['code', 'name', 'type_id', 'line_name', 'status', 'description'],
    required: ['code', 'name', 'type_id', 'line_name'],
    orderBy: 'e.id DESC',
    listSql: `SELECT e.*, t.name AS type_name FROM ppr_equipment e
      JOIN ppr_equipment_type t ON t.id=e.type_id ORDER BY e.id DESC`,
  },
  batches: {
    table: 'ppr_batch',
    columns: ['batch_no', 'spec_id', 'extruder_id', 'haul_off_id', 'production_group', 'start_time', 'end_time', 'status', 'data_source'],
    required: ['batch_no', 'spec_id', 'production_group', 'start_time'],
    orderBy: 'b.id DESC',
    listSql: `SELECT b.*, s.name AS spec_name, ex.name AS extruder_name, ha.name AS haul_off_name
      FROM ppr_batch b JOIN ppr_product_spec s ON s.id=b.spec_id
      LEFT JOIN ppr_equipment ex ON ex.id=b.extruder_id
      LEFT JOIN ppr_equipment ha ON ha.id=b.haul_off_id ORDER BY b.id DESC`,
    // 产品台账下钻：某个规格下的批次，额外带出检验条数与最近检验时间。
    scopeParams: ['spec_id'],
    scopedListSql: `SELECT b.*, s.name AS spec_name, ex.name AS extruder_name, ha.name AS haul_off_name,
        (SELECT COUNT(*) FROM ppr_product_measurement m WHERE m.batch_id=b.id) AS measurement_count,
        (SELECT MAX(m.inspect_time) FROM ppr_product_measurement m WHERE m.batch_id=b.id) AS last_inspect_time
      FROM ppr_batch b JOIN ppr_product_spec s ON s.id=b.spec_id
      LEFT JOIN ppr_equipment ex ON ex.id=b.extruder_id
      LEFT JOIN ppr_equipment ha ON ha.id=b.haul_off_id
      WHERE b.spec_id=? ORDER BY b.start_time DESC`,
  },
  metrics: {
    table: 'ppr_metric',
    columns: ['code', 'name', 'unit', 'influences', 'description', 'status'],
    required: ['code', 'name', 'unit'],
    orderBy: 'id DESC',
    listSql: 'SELECT id, code, name, unit, influences, description, status FROM ppr_metric ORDER BY id DESC',
  },
  measurements: {
    table: 'ppr_product_measurement',
    columns: ['record_no', 'sample_no', 'batch_id', 'inspect_time', 'outer_diameter_mm', 'min_wall_thickness_mm', 'max_wall_thickness_mm', 'max_outer_diameter_mm', 'min_outer_diameter_mm', 'ovality_mm', 'data_source', 'quality_flag', 'remark'],
    // batch_id 不在这里：Excel 导入可以用 batch_no 代替，由 resolveMeasurementBatch 统一解析。
    required: ['record_no', 'sample_no', 'inspect_time'],
    orderBy: 'm.inspect_time DESC',
    // 列表额外带出产品名称（规格名）与产品类别（规格所属类别），二者都来自批次关联的规格，不是本表字段。
    listSql: `SELECT m.*, b.batch_no, s.name AS spec_name, c.name AS category_name FROM ppr_product_measurement m
      JOIN ppr_batch b ON b.id=m.batch_id JOIN ppr_product_spec s ON s.id=b.spec_id
      JOIN ppr_product_category c ON c.id=s.category_id
      ORDER BY m.inspect_time DESC`,
    // 产品台账下钻：某个批次下的全部检验记录。
    scopeParams: ['batch_id'],
    scopedListSql: `SELECT m.*, b.batch_no, s.name AS spec_name, c.name AS category_name FROM ppr_product_measurement m
      JOIN ppr_batch b ON b.id=m.batch_id JOIN ppr_product_spec s ON s.id=b.spec_id
      JOIN ppr_product_category c ON c.id=s.category_id
      WHERE m.batch_id=? ORDER BY m.inspect_time DESC`,
  },
};

export function isMasterResource(value: string): value is MasterResource {
  return Object.prototype.hasOwnProperty.call(RESOURCE_CONFIG, value);
}

export function normalizeValue(value: unknown): unknown {
  if (value === '') return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    return value.replace('T', ' ') + (value.length === 16 ? ':00' : '');
  }
  return value;
}

export function makeBusinessNo(prefix: string): string {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `${prefix}-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export { dbClient };
