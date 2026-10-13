/**
 * 主数据资源定义。
 *
 * 基础主数据（产品类别 / 产品规格 / 设备类型 / 设备台账 / 产线 / 质量指标 / 规格限值，
 * 共 7 类）的增删改查结构高度相似，差异只在字段清单与校验规则。
 * 这里把差异集中在配置里，让 API 与页面复用同一套通用实现：
 *   - 新增一个主数据表 = 在这里加一份配置 + 建一个 route 文件；
 *   - 页面使用通用 DataTable 组件渲染，字段由配置驱动。
 *
 * 为什么不使用 ORM：项目只需处理这几张结构稳定的主数据表，
 * 手写 SQL + 配置驱动比引入 ORM 更透明，也更容易让接手的人读懂真实执行的语句。
 */
import { z } from 'zod';
import { optionalNumber, optionalText, requiredNumber, requiredText } from '../validation';

export interface MasterColumn {
  key: string;
  label: string;
  /** 列宽提示（px），仅影响表格展示 */
  width?: number;
  /** 是否在列表中默认隐藏（详情/编辑仍可见） */
  hidden?: boolean;
  align?: 'left' | 'right';
}

export interface MasterFieldOption {
  value: string | number;
  label: string;
}

export interface MasterField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'boolean' | 'readonly';
  required?: boolean;
  hint?: string;
  /** select 的静态选项 */
  options?: MasterFieldOption[];
  /** select 的选项来自其他资源（引用型字段） */
  reference?: 'categories' | 'equipmentTypes' | 'equipment' | 'lines' | 'metrics' | 'specs';
  /** 数值字段的小数位 */
  digits?: number;
}

export interface MasterResource<TRow = Record<string, unknown>> {
  /** URL 片段，如 'categories' */
  key: string;
  /** 中文单数名，用于按钮与提示 */
  singular: string;
  /** 中文复数名，用于列表标题 */
  plural: string;
  /** 数据库表名 */
  table: string;
  /** 业务编码列（列表与导入时作为自然键） */
  codeColumn: string;
  /** 业务编码前缀（自动生成时使用） */
  codePrefix: string;
  /** 是否支持软删除（表中是否有 is_deleted） */
  softDelete: boolean;
  /** 表中是否有 created_by 列（写入时记录创建人） */
  hasCreatedBy?: boolean;
  /** 列表默认排序列 */
  defaultOrder: string;
  /** 列表展示列 */
  columns: MasterColumn[];
  /** 可编辑字段 */
  fields: MasterField[];
  /** 表单校验 schema */
  /** 表单校验 schema：必须是 ZodObject，编辑时才能用 .partial() 做局部更新 */
  schema: z.ZodObject<z.ZodRawShape>;
  /** 列表行映射 SQL 片段（SELECT ... FROM ... JOIN） */
  listSql: string;
  /** 关键字搜索涉及的列 */
  searchColumns: string[];
  /** 唯一性检查涉及的列 */
  uniqueColumns: Array<{ column: string; label: string }>;
  /** 删除前检查引用关系（返回提示文案或 null） */
  referenceCheck?: {
    sql: string;
    label: string;
  }[];
  /** 该资源对应的权限动作 */
  permissions: { read: 'masterdata:read'; write: 'masterdata:write'; remove: 'masterdata:delete' };
}

const statusOptions: MasterFieldOption[] = [
  { value: 'enabled', label: '启用' },
  { value: 'disabled', label: '停用' },
];

export const productCategories: MasterResource = {
  key: 'categories',
  singular: '产品类别',
  plural: '产品类别',
  table: 'product_category',
  codeColumn: 'code',
  codePrefix: 'CAT',
  softDelete: true,
  hasCreatedBy: true,
  defaultOrder: 'id ASC',
  columns: [
    { key: 'code', label: '类别编码' },
    { key: 'name', label: '类别名称' },
    { key: 'specCount', label: '关联规格数', align: 'right' },
    { key: 'description', label: '说明' },
    { key: 'status', label: '状态' },
    { key: 'updatedAt', label: '更新时间' },
  ],
  fields: [
    { key: 'code', label: '类别编码', type: 'text', required: true, hint: '例如 CAT-PPR，全库唯一' },
    { key: 'name', label: '类别名称', type: 'text', required: true },
    { key: 'description', label: '说明', type: 'textarea' },
    { key: 'status', label: '状态', type: 'select', options: statusOptions, required: true },
  ],
  schema: z.object({
    code: requiredText('类别编码', 64),
    name: requiredText('类别名称', 64),
    description: optionalText(255),
    status: z.enum(['enabled', 'disabled']).default('enabled'),
  }),
  listSql: `
    SELECT c.id, c.code, c.name, c.description, c.status, c.updated_at AS updatedAt,
           (SELECT COUNT(*) FROM product_spec s WHERE s.category_id = c.id AND s.is_deleted = 0) AS specCount
      FROM product_category c
  `,
  searchColumns: ['c.code', 'c.name', 'c.description'],
  uniqueColumns: [{ column: 'code', label: '类别编码' }],
  referenceCheck: [
    { sql: 'SELECT COUNT(*) AS total FROM product_spec WHERE category_id = ? AND is_deleted = 0', label: '产品规格' },
  ],
  permissions: { read: 'masterdata:read', write: 'masterdata:write', remove: 'masterdata:delete' },
};

export const productSpecs: MasterResource = {
  key: 'specs',
  singular: '产品规格',
  plural: '产品规格',
  table: 'product_spec',
  codeColumn: 'code',
  codePrefix: 'SPEC',
  softDelete: true,
  hasCreatedBy: true,
  defaultOrder: 'nominalOuterDiameterMm ASC, id ASC',
  columns: [
    { key: 'code', label: '规格编码' },
    { key: 'name', label: '规格名称' },
    { key: 'categoryName', label: '产品类别' },
    { key: 'nominalOuterDiameterMm', label: '公称外径 (mm)', align: 'right' },
    { key: 'nominalWallThicknessMm', label: '公称壁厚 (mm)', align: 'right' },
    { key: 'ovalityMaxMm', label: '不圆度上限 (mm)', align: 'right' },
    { key: 'limitCount', label: '指标限值', align: 'right' },
    { key: 'status', label: '状态' },
  ],
  fields: [
    { key: 'code', label: '规格编码', type: 'text', required: true, hint: '例如 SPEC-25-42，全库唯一' },
    { key: 'name', label: '规格名称', type: 'text', required: true, hint: '例如 dn25 × en4.2' },
    { key: 'categoryId', label: '产品类别', type: 'select', reference: 'categories', required: true },
    { key: 'nominalOuterDiameterMm', label: '公称外径 (mm)', type: 'number', required: true, digits: 3 },
    { key: 'nominalWallThicknessMm', label: '公称壁厚 (mm)', type: 'number', required: true, digits: 3 },
    { key: 'ovalityMaxMm', label: '不圆度上限 (mm)', type: 'number', digits: 3 },
    { key: 'status', label: '状态', type: 'select', options: statusOptions, required: true },
  ],
  schema: z.object({
    code: requiredText('规格编码', 64),
    name: requiredText('规格名称', 64),
    categoryId: requiredNumber('产品类别'),
    nominalOuterDiameterMm: requiredNumber('公称外径').refine((value) => value > 0, {
      message: '公称外径必须大于 0',
    }),
    nominalWallThicknessMm: requiredNumber('公称壁厚').refine((value) => value > 0, {
      message: '公称壁厚必须大于 0',
    }),
    ovalityMaxMm: optionalNumber('不圆度上限'),
    status: z.enum(['enabled', 'disabled']).default('enabled'),
  }),
  listSql: `
    SELECT s.id, s.code, s.name, s.category_id AS categoryId, c.name AS categoryName,
           s.nominal_outer_diameter_mm AS nominalOuterDiameterMm,
           s.nominal_wall_thickness_mm AS nominalWallThicknessMm,
           s.ovality_max_mm AS ovalityMaxMm, s.status, s.updated_at AS updatedAt,
           (SELECT COUNT(*) FROM metric_spec_limit l WHERE l.spec_id = s.id) AS limitCount
      FROM product_spec s
      LEFT JOIN product_category c ON c.id = s.category_id
  `,
  searchColumns: ['s.code', 's.name', 'c.name'],
  uniqueColumns: [{ column: 'code', label: '规格编码' }],
  referenceCheck: [
    { sql: 'SELECT COUNT(*) AS total FROM production_batch WHERE spec_id = ? AND is_deleted = 0', label: '生产批次' },
    { sql: 'SELECT COUNT(*) AS total FROM inspection_record WHERE spec_id = ?', label: '抽检记录' },
  ],
  permissions: { read: 'masterdata:read', write: 'masterdata:write', remove: 'masterdata:delete' },
};

export const equipmentTypes: MasterResource = {
  key: 'equipment-types',
  singular: '设备类型',
  plural: '设备类型',
  table: 'equipment_type',
  codeColumn: 'code',
  codePrefix: 'ETYPE',
  softDelete: true,
  defaultOrder: 'id ASC',
  columns: [
    { key: 'code', label: '类型编码' },
    { key: 'name', label: '类型名称' },
    { key: 'equipmentCount', label: '设备数量', align: 'right' },
    { key: 'description', label: '说明' },
  ],
  fields: [
    { key: 'code', label: '类型编码', type: 'text', required: true },
    { key: 'name', label: '类型名称', type: 'text', required: true },
    { key: 'description', label: '说明', type: 'textarea' },
  ],
  schema: z.object({
    code: requiredText('类型编码', 64),
    name: requiredText('类型名称', 64),
    description: optionalText(255),
  }),
  listSql: `
    SELECT t.id, t.code, t.name, t.description, t.updated_at AS updatedAt,
           (SELECT COUNT(*) FROM equipment e WHERE e.type_id = t.id AND e.is_deleted = 0) AS equipmentCount
      FROM equipment_type t
  `,
  searchColumns: ['t.code', 't.name', 't.description'],
  uniqueColumns: [{ column: 'code', label: '类型编码' }],
  referenceCheck: [
    { sql: 'SELECT COUNT(*) AS total FROM equipment WHERE type_id = ? AND is_deleted = 0', label: '设备台账' },
  ],
  permissions: { read: 'masterdata:read', write: 'masterdata:write', remove: 'masterdata:delete' },
};

export const equipmentList: MasterResource = {
  key: 'equipment',
  singular: '设备',
  plural: '设备台账',
  table: 'equipment',
  codeColumn: 'code',
  codePrefix: 'EQ',
  softDelete: true,
  hasCreatedBy: true,
  defaultOrder: 'e.code ASC',
  columns: [
    { key: 'code', label: '设备编码' },
    { key: 'name', label: '设备名称' },
    { key: 'typeName', label: '设备类型' },
    { key: 'lineName', label: '所属产线' },
    { key: 'status', label: '状态' },
    { key: 'description', label: '说明' },
  ],
  fields: [
    { key: 'code', label: '设备编码', type: 'text', required: true, hint: '与设备采集数据中的设备编号一致' },
    { key: 'name', label: '设备名称', type: 'text', required: true },
    { key: 'typeId', label: '设备类型', type: 'select', reference: 'equipmentTypes', required: true },
    { key: 'lineId', label: '所属产线', type: 'select', reference: 'lines' },
    { key: 'status', label: '状态', type: 'select', options: statusOptions, required: true },
    { key: 'description', label: '说明', type: 'textarea' },
  ],
  schema: z.object({
    code: requiredText('设备编码', 64),
    name: requiredText('设备名称', 64),
    typeId: requiredNumber('设备类型'),
    lineId: optionalNumber('所属产线'),
    status: z.enum(['enabled', 'disabled']).default('enabled'),
    description: optionalText(255),
  }),
  listSql: `
    SELECT e.id, e.code, e.name, e.type_id AS typeId, t.name AS typeName,
           e.line_id AS lineId, l.name AS lineName, e.status, e.description,
           e.updated_at AS updatedAt
      FROM equipment e
      LEFT JOIN equipment_type t ON t.id = e.type_id
      LEFT JOIN production_line l ON l.id = e.line_id
  `,
  searchColumns: ['e.code', 'e.name', 't.name', 'l.name'],
  uniqueColumns: [{ column: 'code', label: '设备编码' }],
  referenceCheck: [
    { sql: 'SELECT COUNT(*) AS total FROM equipment_reading WHERE equipment_id = ?', label: '设备采集数据' },
    { sql: 'SELECT COUNT(*) AS total FROM production_batch WHERE extruder_id = ? AND is_deleted = 0', label: '生产批次（作为挤出设备）' },
    { sql: 'SELECT COUNT(*) AS total FROM production_batch WHERE haul_off_id = ? AND is_deleted = 0', label: '生产批次（作为牵引设备）' },
  ],
  permissions: { read: 'masterdata:read', write: 'masterdata:write', remove: 'masterdata:delete' },
};

export const productionLines: MasterResource = {
  key: 'lines',
  singular: '产线',
  plural: '产线与工段',
  table: 'production_line',
  codeColumn: 'code',
  codePrefix: 'LINE',
  softDelete: true,
  defaultOrder: 'id ASC',
  columns: [
    { key: 'code', label: '产线编码' },
    { key: 'name', label: '产线名称' },
    { key: 'workshop', label: '车间 / 工段' },
    { key: 'equipmentCount', label: '设备数量', align: 'right' },
    { key: 'batchCount', label: '批次数', align: 'right' },
    { key: 'status', label: '状态' },
  ],
  fields: [
    { key: 'code', label: '产线编码', type: 'text', required: true },
    { key: 'name', label: '产线名称', type: 'text', required: true },
    { key: 'workshop', label: '车间 / 工段', type: 'text' },
    { key: 'status', label: '状态', type: 'select', options: statusOptions, required: true },
    { key: 'description', label: '说明', type: 'textarea' },
  ],
  schema: z.object({
    code: requiredText('产线编码', 64),
    name: requiredText('产线名称', 64),
    workshop: optionalText(64),
    status: z.enum(['enabled', 'disabled']).default('enabled'),
    description: optionalText(255),
  }),
  listSql: `
    SELECT l.id, l.code, l.name, l.workshop, l.status, l.description, l.updated_at AS updatedAt,
           (SELECT COUNT(*) FROM equipment e WHERE e.line_id = l.id AND e.is_deleted = 0) AS equipmentCount,
           (SELECT COUNT(*) FROM production_batch b WHERE b.line_id = l.id AND b.is_deleted = 0) AS batchCount
      FROM production_line l
  `,
  searchColumns: ['l.code', 'l.name', 'l.workshop'],
  uniqueColumns: [{ column: 'code', label: '产线编码' }],
  referenceCheck: [
    { sql: 'SELECT COUNT(*) AS total FROM production_batch WHERE line_id = ? AND is_deleted = 0', label: '生产批次' },
  ],
  permissions: { read: 'masterdata:read', write: 'masterdata:write', remove: 'masterdata:delete' },
};

export const qualityMetrics: MasterResource = {
  key: 'metrics',
  singular: '质量指标',
  plural: '质量指标与影响因素',
  table: 'quality_metric',
  codeColumn: 'code',
  codePrefix: 'METRIC',
  softDelete: true,
  defaultOrder: 'sortNo ASC, id ASC',
  columns: [
    { key: 'code', label: '指标编码' },
    { key: 'name', label: '指标名称' },
    { key: 'unit', label: '单位' },
    { key: 'metricRole', label: '指标角色' },
    { key: 'decimalScale', label: '小数位', align: 'right' },
    { key: 'limitCount', label: '限值条数', align: 'right' },
    { key: 'influenceCount', label: '关联过程参数', align: 'right' },
    { key: 'checkDirectionHint', label: '核查方向提示' },
  ],
  fields: [
    { key: 'code', label: '指标编码', type: 'text', required: true, hint: '英文小写加下划线，例如 outer_diameter' },
    { key: 'name', label: '指标名称', type: 'text', required: true },
    { key: 'unit', label: '单位', type: 'text', required: true },
    { key: 'decimalScale', label: '展示小数位', type: 'number', required: true, hint: '0–6 之间的整数' },
    {
      key: 'metricRole',
      label: '指标角色',
      type: 'select',
      required: true,
      options: [
        { value: 'primary', label: 'primary（参与判定）' },
        { value: 'raw', label: 'raw（原始测点）' },
        { value: 'derived', label: 'derived（计算指标）' },
      ],
    },
    { key: 'derivedExpr', label: '计算表达式', type: 'text', hint: '仅 derived 指标填写，例如 max_outer_diameter - min_outer_diameter' },
    { key: 'checkDirectionHint', label: '核查方向提示', type: 'textarea', hint: '会展示给工程师，请写明「排查方向不等于已验证根因」' },
    { key: 'status', label: '状态', type: 'select', options: statusOptions, required: true },
  ],
  schema: z.object({
    code: requiredText('指标编码', 64).refine((value) => /^[a-z][a-z0-9_]*$/.test(value), {
      message: '指标编码需为小写字母开头，仅含小写字母、数字与下划线',
    }),
    name: requiredText('指标名称', 64),
    unit: requiredText('单位', 16),
    decimalScale: requiredNumber('展示小数位').refine((value) => Number.isInteger(value) && value >= 0 && value <= 6, {
      message: '展示小数位需为 0–6 之间的整数',
    }),
    metricRole: z.enum(['primary', 'raw', 'derived']),
    derivedExpr: optionalText(255),
    checkDirectionHint: optionalText(500),
    status: z.enum(['enabled', 'disabled']).default('enabled'),
  }),
  listSql: `
    SELECT m.id, m.code, m.name, m.unit, m.decimal_scale AS decimalScale,
           m.metric_role AS metricRole, m.derived_expr AS derivedExpr,
           m.check_direction_hint AS checkDirectionHint, m.status, m.sort_no AS sortNo,
           m.updated_at AS updatedAt,
           (SELECT COUNT(*) FROM metric_spec_limit l WHERE l.metric_id = m.id) AS limitCount,
           (SELECT COUNT(*) FROM metric_influence i WHERE i.metric_id = m.id) AS influenceCount
      FROM quality_metric m
  `,
  searchColumns: ['m.code', 'm.name', 'm.check_direction_hint'],
  uniqueColumns: [{ column: 'code', label: '指标编码' }],
  referenceCheck: [
    { sql: 'SELECT COUNT(*) AS total FROM inspection_value WHERE metric_id = ?', label: '抽检指标值' },
    { sql: 'SELECT COUNT(*) AS total FROM alert_event WHERE metric_id = ?', label: '预警事件' },
  ],
  permissions: { read: 'masterdata:read', write: 'masterdata:write', remove: 'masterdata:delete' },
};

export const metricSpecLimits: MasterResource = {
  key: 'spec-limits',
  singular: '规格限值',
  plural: '规格限值配置',
  table: 'metric_spec_limit',
  codeColumn: 'id',
  codePrefix: '',
  softDelete: false,
  hasCreatedBy: false,
  defaultOrder: 'specId ASC, metricName ASC',
  columns: [
    { key: 'specName', label: '产品规格' },
    { key: 'metricName', label: '质量指标' },
    { key: 'lowerLimit', label: '下限', align: 'right' },
    { key: 'upperLimit', label: '上限', align: 'right' },
    { key: 'limitType', label: '限值类型' },
    { key: 'calibrationStatus', label: '标定状态' },
    { key: 'standardRef', label: '对照依据' },
  ],
  fields: [
    { key: 'specId', label: '产品规格', type: 'select', reference: 'specs', required: true },
    { key: 'metricId', label: '质量指标', type: 'select', reference: 'metrics', required: true },
    { key: 'lowerLimit', label: '下限', type: 'number', digits: 4 },
    { key: 'upperLimit', label: '上限', type: 'number', digits: 4 },
    {
      key: 'limitType',
      label: '限值类型',
      type: 'select',
      required: true,
      options: [
        { value: 'demo', label: 'demo（额定参数试运行）' },
        { value: 'internal', label: 'internal（企业内控标准）' },
        { value: 'standard', label: 'standard（国家/行业标准）' },
      ],
    },
    {
      key: 'calibrationStatus',
      label: '标定状态',
      type: 'select',
      required: true,
      options: [
        { value: 'demo', label: '阈值待现场标定' },
        { value: 'pending_field_validation', label: '待现场验证' },
        { value: 'validated', label: '已标定' },
      ],
    },
    { key: 'standardRef', label: '对照依据', type: 'text', hint: '已标定时填写标准编号或文件名称' },
    { key: 'remark', label: '备注', type: 'textarea' },
  ],
  schema: z.object({
    specId: requiredNumber('产品规格'),
    metricId: requiredNumber('质量指标'),
    lowerLimit: optionalNumber('下限'),
    upperLimit: optionalNumber('上限'),
    limitType: z.enum(['demo', 'internal', 'standard']).default('demo'),
    calibrationStatus: z.enum(['demo', 'pending_field_validation', 'validated']).default('demo'),
    standardRef: optionalText(128),
    remark: optionalText(255),
  }),
  listSql: `
    SELECT l.id, l.spec_id AS specId, s.name AS specName, l.metric_id AS metricId,
           m.name AS metricName, l.lower_limit AS lowerLimit, l.upper_limit AS upperLimit,
           l.limit_type AS limitType, l.calibration_status AS calibrationStatus,
           l.standard_ref AS standardRef, l.remark, l.updated_at AS updatedAt
      FROM metric_spec_limit l
      JOIN product_spec s ON s.id = l.spec_id
      JOIN quality_metric m ON m.id = l.metric_id
  `,
  searchColumns: ['s.name', 's.code', 'm.name', 'm.code'],
  uniqueColumns: [
    { column: 'spec_id', label: '产品规格' },
    { column: 'metric_id', label: '质量指标' },
  ],
  permissions: { read: 'masterdata:read', write: 'masterdata:write', remove: 'masterdata:delete' },
};

/** 全部主数据资源（API 与页面共用） */
export const MASTER_RESOURCES: Record<string, MasterResource> = {
  categories: productCategories,
  specs: productSpecs,
  'equipment-types': equipmentTypes,
  equipment: equipmentList,
  lines: productionLines,
  metrics: qualityMetrics,
  'spec-limits': metricSpecLimits,
};

export function findMasterResource(key: string): MasterResource | undefined {
  return MASTER_RESOURCES[key];
}
