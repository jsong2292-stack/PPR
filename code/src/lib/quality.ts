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
   * 只读资源：批次已经不是表，而是按批次号实时聚合的视图（见 scripts/init-db.sql），
   * 没有可写字段，也不允许手工新建 / 编辑 / 删除（删除请走批次清理接口）。
   */
  readOnly?: boolean;
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
    // 批次号是产品检验数据与设备采集数据之间唯一的关联键：批次不落表，这里查的是按 batch_no 聚合的视图。
    // 所以没有可写字段（readOnly），批次清单完全由「产品数据 + 设备数据」实时算出来。
    table: 'ppr_batch',
    columns: [],
    required: [],
    readOnly: true,
    orderBy: 'b.start_time DESC',
    listSql: `SELECT b.*, s.code AS spec_code, s.name AS spec_name
      FROM ppr_batch b LEFT JOIN ppr_product_spec s ON s.id=b.spec_id
      ORDER BY b.start_time DESC`,
    // 产品台账下钻：某个规格下的批次（规格取该批次检验记录上的 spec_id）。
    scopeParams: ['spec_id'],
    scopedListSql: `SELECT b.*, s.code AS spec_code, s.name AS spec_name
      FROM ppr_batch b LEFT JOIN ppr_product_spec s ON s.id=b.spec_id
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
    // batch_no / spec_id 直接落在检验记录上：批次号负责与设备采集数据关联，spec_id 决定判定限值。
    columns: ['record_no', 'sample_no', 'batch_no', 'spec_id', 'production_group', 'batch_start_time', 'inspect_time', 'outer_diameter_mm', 'min_wall_thickness_mm', 'max_wall_thickness_mm', 'max_outer_diameter_mm', 'min_outer_diameter_mm', 'ovality_mm', 'data_source', 'quality_flag', 'remark'],
    // batch_no / spec_id 不在这里：由 resolveMeasurementBatch 从页面上下文或文件里的 spec_code 解析后补进来。
    required: ['record_no', 'sample_no', 'inspect_time'],
    orderBy: 'm.inspect_time DESC',
    // 产品名称（规格名）与产品类别都来自检验记录自己的 spec_id，不再经过批次表。
    listSql: `SELECT m.*, s.code AS spec_code, s.name AS spec_name, c.name AS category_name FROM ppr_product_measurement m
      JOIN ppr_product_spec s ON s.id=m.spec_id
      JOIN ppr_product_category c ON c.id=s.category_id
      ORDER BY m.inspect_time DESC`,
    // 产品台账下钻：某个批次号下的全部检验记录。
    scopeParams: ['batch_no'],
    scopedListSql: `SELECT m.*, s.code AS spec_code, s.name AS spec_name, c.name AS category_name FROM ppr_product_measurement m
      JOIN ppr_product_spec s ON s.id=m.spec_id
      JOIN ppr_product_category c ON c.id=s.category_id
      WHERE m.batch_no=? ORDER BY m.inspect_time DESC`,
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
