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
    title: '批次总览', description: '批次不是单独维护的主数据：批次号是产品数据与设备数据之间唯一的关联键，批次清单由两者按批次号实时关联出来。导入产品数据文件（含 batch_no / spec_code / record_no / inspect_time）后，对应批次会自动出现在这里；采集数据按批次号挂上来后会显示「关联设备」。',
    // 批次是只读视图：没有表单字段，也没有新增 / 编辑入口。
    fields: [],
    columns: [
      { key: 'batch_no', label: '批次号' },
      { key: 'spec_name', label: '产品规格' },
      { key: 'production_group', label: '组别' },
      { key: 'start_time', label: '开始时间' },
      { key: 'measurement_count', label: '检验条数', render: (row) => `${Number(row.measurement_count ?? 0)} 条` },
      { key: 'reading_count', label: '采集条数', render: (row) => `${Number(row.reading_count ?? 0)} 条` },
      { key: 'equipments', label: '关联设备', render: (row) => {
        const names = [row.extruder_name, row.haul_off_name].filter(Boolean).map(String);
        return names.length ? names.join(' / ') : '—';
      } },
      { key: 'last_inspect_time', label: '最近检验时间' },
    ],
  },
  metrics: {
    title: '质量指标与影响因素', description: '维护指标口径、影响因素和排查方向；判定限值统一取产品规格，本页不再维护限值。',
    excel: false,
    fields: [{key:'code',label:'指标编码',required:true},{key:'name',label:'指标名称',required:true},{key:'unit',label:'单位',required:true},{key:'influences',label:'影响因素',type:'textarea'},{key:'description',label:'指标说明',type:'textarea'},{key:'status',label:'状态',type:'select',options:statusOptions}],
    columns: [{key:'code',label:'指标编码'},{key:'name',label:'名称'},{key:'unit',label:'单位'},{key:'influences',label:'影响因素'},{key:'status',label:'状态'}],
  },
  measurements: {
    title: '检验记录', description: '产品检验记录只从 Excel 导入（数据完全跟着文件走），导入后系统按产品规格的标准区间自动重算预警事件。批次号与规格落在每条检验记录上，所以不需要先建批次。',
    // 只用于生成导入模板：batch_no / spec_id 分别来自文件与页面上下文，由 resolveMeasurementBatch 解析后补进请求体。
    fields: [{key:'record_no',label:'记录编号',required:true},{key:'sample_no',label:'样管编号',required:true},{key:'inspect_time',label:'检验时间',type:'datetime',required:true},{key:'outer_diameter_mm',label:'外径 mm',type:'number'},{key:'min_wall_thickness_mm',label:'壁厚 mm',type:'number'},{key:'max_wall_thickness_mm',label:'最大壁厚 mm',type:'number'},{key:'max_outer_diameter_mm',label:'同截面最大外径 mm',type:'number'},{key:'min_outer_diameter_mm',label:'同截面最小外径 mm',type:'number'},{key:'ovality_mm',label:'不圆度 mm',type:'number'},{key:'data_source',label:'数据来源'},{key:'quality_flag',label:'质量标记',type:'select',options:qualityFlags},{key:'remark',label:'备注',type:'textarea'}],
    columns: [{key:'record_no',label:'记录编号'},{key:'batch_no',label:'批次号'},{key:'spec_name',label:'产品名称'},{key:'category_name',label:'产品类别'},{key:'inspect_time',label:'检验时间'},{key:'outer_diameter_mm',label:'外径 mm'},{key:'min_wall_thickness_mm',label:'壁厚 mm'},{key:'ovality_mm',label:'不圆度 mm'}],
  },
};

/**
 * 产品台账下钻专用列。
 * 产品台账 → 规格 → 生产批次 → 检验记录（检验时间 / 外径 / 壁厚 / 不圆度）。
 * 批次不再有状态、结束时间这些人工维护字段，改为展示实时算出来的检验/采集条数。
 */
export const PRODUCT_BATCH_COLUMNS: Column[] = [
  { key: 'batch_no', label: '批次号' },
  { key: 'production_group', label: '生产组别' },
  { key: 'start_time', label: '批次开始时间' },
  { key: 'measurement_count', label: '检验条数', render: (row) => `${Number(row.measurement_count ?? 0)} 条` },
  { key: 'reading_count', label: '采集条数', render: (row) => `${Number(row.reading_count ?? 0)} 条` },
  { key: 'equipments', label: '关联设备', render: (row) => {
    const names = [row.extruder_name, row.haul_off_name].filter(Boolean).map(String);
    return names.length ? names.join(' / ') : '—';
  } },
  { key: 'last_inspect_time', label: '最近检验时间' },
];

export const PRODUCT_MEASUREMENT_COLUMNS: Column[] = [
  { key: 'inspect_time', label: '检验时间' },
  { key: 'outer_diameter_mm', label: '外径 mm' },
  { key: 'min_wall_thickness_mm', label: '壁厚 mm' },
  { key: 'ovality_mm', label: '不圆度 mm' },
];

/**
 * 下钻页面里「当前批次」已经固定，模板里不需要再填批次号：
 * 批次号由页面 preset 自动补上，规格找不到时退回该批次已有记录上的规格（见 lib/quality-import.ts）。
 */
export const SCOPED_MEASUREMENT_FIELDS: Field[] = QUALITY_RESOURCE_CONFIG.measurements.fields;

/** 批次页的导入模板只填检验值，批次号与规格由页面决定。 */
export const SCOPED_MEASUREMENT_SAMPLE: Record<string, string | number> = {
  record_no: 'IR-示例-0001', sample_no: 'S-示例', inspect_time: '2026-11-10 08:20:00',
  outer_diameter_mm: 25.23, min_wall_thickness_mm: 4.4, max_wall_thickness_mm: 4.51,
  max_outer_diameter_mm: 25.31, min_outer_diameter_mm: 25.12, ovality_mm: 0.19,
  data_source: 'MES_IMPORT', quality_flag: 'normal', remark: '示例行：导入前请删除或覆盖本行',
};

export const SCOPED_MEASUREMENT_NOTES: string[] = [
  '本页导入的检验记录全部归入当前批次号，模板里不需要批次号；规格取该批次已有记录上的规格。',
  '第一行是列名，不要修改或删除；第二行是示例行，导入前请删除或覆盖成真实数据。',
  'inspect_time 必须是文本格式 YYYY-MM-DD HH:mm:ss，不要用 Excel 的日期单元格，否则会变成序列号导入失败。',
  'data_source、quality_flag 可以留空，留空时分别取默认值 QMS / normal，不会报错。',
  'quality_flag（质量标记）由预警判定引擎在保存后自动回写 normal / medium / high，通常不需要手工填。',
  '留空的可选测量值不会参与判定：没有实测值的指标不会产生预警事件。',
  '同一个 record_no 重复导入会覆盖原有数值（幂等），因此没有新增 / 编辑 / 删除按钮，导错就重导一次。',
  '',
  '判定限值取「数据源管理 / 产品台账」里该规格的最大/最小外径、最大/最小壁厚与不圆度上限；改规格后会自动重算该规格下全部批次。',
  '判定规则：超出标准区间 → 高风险；连续 3 点进入接近带（区间宽度 × 15%）→ 中风险；其余 → 正常。',
];

/**
 * 「产品数据」导入模板（批次总览页 / 规格下钻页共用）。
 * 设备台账的批次页导的是「采集数据」（列只有采集时间 + 该设备类型的采集项），不用这份模板。
 *
 * 比检验记录页的模板多了三列批次维度：batch_no / spec_code / production_group / batch_start_time。
 * 批次不落表，批次号与规格直接写在检验记录行上，所以导入后批次会自动出现在批次总览里。
 */
export const PRODUCT_IMPORT_FIELDS: Field[] = [
  { key: 'batch_no', label: '批次号', required: true },
  { key: 'spec_code', label: '规格编码' },
  { key: 'production_group', label: '生产组别' },
  { key: 'batch_start_time', label: '批次开始时间', type: 'datetime' },
  ...QUALITY_RESOURCE_CONFIG.measurements.fields,
];

export const PRODUCT_IMPORT_SAMPLE: Record<string, string | number> = {
  batch_no: '12121D0060', spec_code: 'SPEC-25X4.2', production_group: '甲班', batch_start_time: '2026-11-20 06:00:00',
  ...SCOPED_MEASUREMENT_SAMPLE,
};

export const PRODUCT_IMPORT_NOTES: string[] = [
  '本页导入的是产品数据（检验记录）。批次不需要先建：批次号与规格直接写在每条检验记录上，导完这一批，批次总览里就会出现这个批次号。',
  'batch_no 必填，同一个文件里填同一个批次号；spec_code 填产品台账里的规格编码（也可以换成 spec_name 规格名称）。',
  '从某个规格的生产批次页导入时，规格由页面固定，文件里的 spec_code 不生效；批次页导入时规格退回该批次已有记录上的规格。',
  '第一行是列名，不要修改或删除；第二行是示例行，导入前请删除或覆盖成真实数据。',
  'batch_start_time 与 inspect_time 必须是文本格式 YYYY-MM-DD HH:mm:ss，不要用 Excel 日期单元格，否则会变成序列号导入失败。',
  'production_group（生产组别）与 batch_start_time（批次开始时间）落在检验记录上，批次清单里的组别和开始时间就是从这里聚合出来的。',
  '同一个 record_no 重复导入会覆盖原有数值（幂等），导错重导一次即可；明细数据没有新增 / 编辑 / 删除入口。',
  'quality_flag（质量标记）由预警判定引擎在保存后自动回写 normal / medium / high，通常不需要手工填。',
  '留空的可选测量值不会参与判定：没有实测值的指标不会产生预警事件。',
  '',
  '判定限值取「数据源管理 / 产品台账」里该规格的最大/最小外径、最大/最小壁厚与不圆度上限；改规格后会自动重算该规格下全部批次。',
  '判定规则：超出标准区间 → 高风险；连续 3 点进入接近带（区间宽度 × 15%）→ 中风险；其余 → 正常。',
];

