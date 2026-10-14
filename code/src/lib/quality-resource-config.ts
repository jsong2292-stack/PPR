/**
 * 数据源管理 / 系统管理各资源页面的字段与列配置。
 *
 * 从 `app/quality/data/[resource]/page.tsx` 抽出来是因为它同时被两处使用：
 *   1. 页面渲染（DataManager 的表格与表单）；
 *   2. Excel 模板生成（src/lib/quality-template.ts 按这份配置拼表头）。
 * 放在纯数据模块里，模板就能用真实配置做自动化校验，不必依赖页面运行时。
 */

export type Field = {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'datetime' | 'textarea' | 'select';
  required?: boolean;
  options?: { label: string; value: string }[];
  optionResource?: string;
  optionLabel?: string;
};
export type Column = { key: string; label: string; render?: (row: Record<string, unknown>) => React.ReactNode };

export interface ResourcePageConfig {
  title: string;
  description: string;
  fields: Field[];
  columns: Column[];
  /** 系统管理下的基础主数据只允许页面 CRUD，不提供 Excel 模板与导入（excel: false）。 */
  excel?: boolean;
}

const statusOptions = [{ label: '启用', value: 'enabled' }, { label: '停用', value: 'disabled' }];
const batchStatus = [{ label: '生产中', value: 'running' }, { label: '已完成', value: 'completed' }, { label: '暂停', value: 'paused' }];
const qualityFlags = [{ label: '正常', value: 'normal' }, { label: '中风险', value: 'medium' }, { label: '高风险', value: 'high' }, { label: '数据错误', value: 'error' }];

export const QUALITY_RESOURCE_CONFIG: Record<string, ResourcePageConfig> = {
  categories: {
    title: '产品类别', description: '维护产品分类，为规格和质量数据提供统一主数据编码。',
    excel: false,
    fields: [{ key:'code',label:'类别编码',required:true },{ key:'name',label:'类别名称',required:true },{ key:'description',label:'说明',type:'textarea' },{ key:'status',label:'状态',type:'select',options:statusOptions }],
    columns: [{key:'code',label:'编码'},{key:'name',label:'名称'},{key:'description',label:'说明'},{key:'status',label:'状态'}],
  },
  specs: {
    title: '产品台账', description: '维护产品规格与其判定限值（最大/最小外径、最大/最小壁厚、不圆度上限）；点「产品数据」进入该规格的生产批次与检验记录。',
    excel: false,
    fields: [{key:'code',label:'规格编码',required:true},{key:'name',label:'规格名称',required:true},{key:'category_id',label:'产品类别',type:'select',optionResource:'categories',required:true},{key:'outer_upper_mm',label:'最大外径 mm',type:'number',required:true},{key:'outer_lower_mm',label:'最小外径 mm',type:'number',required:true},{key:'wall_upper_mm',label:'最大壁厚 mm',type:'number',required:true},{key:'wall_lower_mm',label:'最小壁厚 mm',type:'number',required:true},{key:'ovality_upper_mm',label:'不圆度上限 mm',type:'number',required:true},{key:'status',label:'状态',type:'select',options:statusOptions}],
    columns: [{key:'code',label:'编码'},{key:'name',label:'名称'},{key:'category_name',label:'产品类别'},{key:'outer_upper_mm',label:'最大外径 mm'},{key:'outer_lower_mm',label:'最小外径 mm'},{key:'wall_upper_mm',label:'最大壁厚 mm'},{key:'wall_lower_mm',label:'最小壁厚 mm'},{key:'ovality_upper_mm',label:'不圆度上限 mm'},{key:'status',label:'状态'}],
  },
  'equipment-types': {
    title: '设备类型', description: '维护挤出机、牵引机等设备分类；采集项随设备类型变化。',
    excel: false,
    fields: [{key:'code',label:'类型编码',required:true},{key:'name',label:'类型名称',required:true},{key:'description',label:'说明',type:'textarea'},{key:'status',label:'状态',type:'select',options:statusOptions}],
    columns: [{key:'code',label:'编码'},{key:'name',label:'名称'},{key:'description',label:'说明'},{key:'status',label:'状态'}],
  },
  equipment: {
    title: '设备台账', description: '维护生产设备、类型和所属产线；点「采集数据」进入该设备的生产批次与采集项。',
    excel: false,
    fields: [{key:'code',label:'设备编码',required:true},{key:'name',label:'设备名称',required:true},{key:'type_id',label:'设备类型',type:'select',optionResource:'equipment-types',required:true},{key:'line_name',label:'产线/工段',required:true},{key:'status',label:'状态',type:'select',options:[...statusOptions,{label:'检修',value:'maintenance'}]},{key:'description',label:'说明',type:'textarea'}],
    columns: [{key:'code',label:'设备编码'},{key:'name',label:'设备名称'},{key:'type_name',label:'设备类型'},{key:'line_name',label:'产线/工段'},{key:'status',label:'状态'}],
  },
  batches: {
    title: '批次基础信息', description: '批次是产品检验、设备采集、预警分析之间的数据关联主线。',
    fields: [{key:'batch_no',label:'批次号',required:true},{key:'spec_id',label:'产品规格',type:'select',optionResource:'specs',required:true},{key:'extruder_id',label:'挤出机',type:'select',optionResource:'equipment'},{key:'haul_off_id',label:'牵引机',type:'select',optionResource:'equipment'},{key:'production_group',label:'生产组别',required:true},{key:'start_time',label:'生产开始时间',type:'datetime',required:true},{key:'end_time',label:'生产结束时间',type:'datetime'},{key:'status',label:'批次状态',type:'select',options:batchStatus},{key:'data_source',label:'数据来源'}],
    columns: [{key:'batch_no',label:'批次号'},{key:'spec_name',label:'产品规格'},{key:'production_group',label:'组别'},{key:'start_time',label:'开始时间'},{key:'extruder_name',label:'挤出机'},{key:'haul_off_name',label:'牵引机'},{key:'status',label:'状态'}],
  },
  metrics: {
    title: '质量指标与影响因素', description: '维护指标口径、影响因素和排查方向；判定限值统一取产品规格，本页不再维护限值。',
    excel: false,
    fields: [{key:'code',label:'指标编码',required:true},{key:'name',label:'指标名称',required:true},{key:'unit',label:'单位',required:true},{key:'influences',label:'影响因素',type:'textarea'},{key:'description',label:'指标说明',type:'textarea'},{key:'status',label:'状态',type:'select',options:statusOptions}],
    columns: [{key:'code',label:'指标编码'},{key:'name',label:'名称'},{key:'unit',label:'单位'},{key:'influences',label:'影响因素'},{key:'status',label:'状态'}],
  },
  measurements: {
    title: '产品数据', description: '维护QMS/检验产品记录；保存后系统自动按产品规格的标准区间重算预警事件，无需手工扫描。',
    fields: [{key:'record_no',label:'记录编号',required:true},{key:'sample_no',label:'样管编号',required:true},{key:'batch_id',label:'生产批次',type:'select',optionResource:'batches',required:true},{key:'inspect_time',label:'检验时间',type:'datetime',required:true},{key:'outer_diameter_mm',label:'外径 mm',type:'number'},{key:'min_wall_thickness_mm',label:'壁厚 mm',type:'number'},{key:'max_wall_thickness_mm',label:'最大壁厚 mm',type:'number'},{key:'max_outer_diameter_mm',label:'同截面最大外径 mm',type:'number'},{key:'min_outer_diameter_mm',label:'同截面最小外径 mm',type:'number'},{key:'ovality_mm',label:'不圆度 mm',type:'number'},{key:'data_source',label:'数据来源'},{key:'quality_flag',label:'质量标记',type:'select',options:qualityFlags},{key:'remark',label:'备注',type:'textarea'}],
    columns: [{key:'batch_no',label:'批次号'},{key:'spec_name',label:'产品名称'},{key:'category_name',label:'产品类别'},{key:'inspect_time',label:'检验时间'},{key:'outer_diameter_mm',label:'外径 mm'},{key:'min_wall_thickness_mm',label:'壁厚 mm'},{key:'ovality_mm',label:'不圆度 mm'}],
  },
};

/**
 * 产品台账下钻专用列。
 * 产品台账 → 规格 → 生产批次 → 检验记录（检验时间 / 外径 / 壁厚 / 不圆度）。
 * 批次维度比「批次基础信息」页少了设备、多了检验条数，因为这里看的是产品数据而不是产线。
 */
const scopedBatchStatus: Record<string, string> = { running: '生产中', completed: '已完成', paused: '暂停' };

export const PRODUCT_BATCH_COLUMNS: Column[] = [
  { key: 'batch_no', label: '批次号' },
  { key: 'production_group', label: '生产组别' },
  { key: 'start_time', label: '开始时间' },
  { key: 'end_time', label: '结束时间' },
  { key: 'status', label: '状态', render: (row) => scopedBatchStatus[String(row.status)] ?? String(row.status ?? '—') },
  { key: 'measurement_count', label: '检验条数', render: (row) => `${Number(row.measurement_count ?? 0)} 条` },
  { key: 'last_inspect_time', label: '最近检验时间' },
];

export const PRODUCT_MEASUREMENT_COLUMNS: Column[] = [
  { key: 'inspect_time', label: '检验时间' },
  { key: 'outer_diameter_mm', label: '外径 mm' },
  { key: 'min_wall_thickness_mm', label: '壁厚 mm' },
  { key: 'ovality_mm', label: '不圆度 mm' },
];

/**
 * 下钻页面里「当前规格 / 当前批次」已经固定，表单与导入模板都不该再出现该字段：
 * 规格页给批次固定 spec_id，批次页给检验记录固定 batch_id（保存与导入时由 preset 自动补上）。
 */
export const SCOPED_BATCH_FIELDS: Field[] = QUALITY_RESOURCE_CONFIG.batches.fields.filter((field) => field.key !== 'spec_id');
export const SCOPED_MEASUREMENT_FIELDS: Field[] = QUALITY_RESOURCE_CONFIG.measurements.fields.filter((field) => field.key !== 'batch_id');

/** 批次页的导入模板只填检验值，批次由页面决定。 */
export const SCOPED_MEASUREMENT_SAMPLE: Record<string, string | number> = {
  record_no: 'IR-示例-0001', sample_no: 'S-示例', inspect_time: '2026-11-10 08:20:00',
  outer_diameter_mm: 25.23, min_wall_thickness_mm: 4.4, max_wall_thickness_mm: 4.51,
  max_outer_diameter_mm: 25.31, min_outer_diameter_mm: 25.12, ovality_mm: 0.19,
  data_source: 'MES_IMPORT', quality_flag: 'normal', remark: '示例行：导入前请删除或覆盖本行',
};

export const SCOPED_MEASUREMENT_NOTES: string[] = [
  '本页导入的检验记录全部归入当前批次，模板里不需要批次号，也不需要规格编码。',
  '第一行是列名，不要修改或删除；第二行是示例行，导入前请删除或覆盖成真实数据。',
  'inspect_time 必须是文本格式 YYYY-MM-DD HH:mm:ss，不要用 Excel 的日期单元格，否则会变成序列号导入失败。',
  'data_source、quality_flag 可以留空，留空时分别取默认值 QMS / normal，不会报错。',
  'quality_flag（质量标记）由预警判定引擎在保存后自动回写 normal / medium / high，通常不需要手工填。',
  '留空的可选测量值不会参与判定：没有实测值的指标不会产生预警事件。',
  '',
  '判定限值取「数据源管理 / 产品台账」里该规格的最大/最小外径、最大/最小壁厚与不圆度上限；改规格后会自动重算该规格下全部批次。',
  '判定规则：超出标准区间 → 高风险；连续 3 点进入接近带（区间宽度 × 15%）→ 中风险；其余 → 正常。',
];
