/**
 * Excel 导入模板生成。
 *
 * 为什么单独抽一个模块：模板的列名必须和接口字段严格一致，一旦写错，用户导入时只会看到
 * 一行行失败而不知道原因。抽出来之后可以用真实导入链路验证（见 scripts 里的用法），
 * 而不是只能靠肉眼看页面。
 *
 * 结构约定：
 *   第一个工作表 = 数据表，导入逻辑只读 SheetNames[0]（见 DataManager.importFile），
 *   表头用数据库列名；第二个工作表 = 「填写说明」，放中文含义、必填、示例值，不参与导入。
 */
import * as XLSX from 'xlsx';

export interface ImportTemplateField {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
}

export interface ImportTemplateExtra {
  key: string;
  label: string;
  note?: string;
  required?: boolean;
  /** 该列替代的表单字段（下钻页面固定下来的维度列），被替代字段不进模板。 */
  replaces?: string;
}

export interface ImportTemplateSpec {
  resource: string;
  /** 数据表的工作表名，通常用页面标题。 */
  sheetName: string;
  fields: ImportTemplateField[];
  templateColumns?: ImportTemplateExtra[];
  /** 顶部注意事项。 */
  notes?: string[];
  /** 示例值，键为列名。既用于数据表的示例行，也用于说明表的「示例值」列。 */
  sample?: Record<string, string | number>;
}

/** Excel 工作表名不能超过 31 字符，也不能含 : \ / ? * [ ] */
function safeSheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, ' ').trim();
  return (cleaned || '数据').slice(0, 31);
}

function describe(field: ImportTemplateField): string {
  if (field.type === 'datetime') return '文本格式 YYYY-MM-DD HH:mm:ss；不要用 Excel 日期单元格，否则会变成数字序列号';
  if (field.type === 'number') return '数字，可留空；留空的指标不参与预警判定';
  if (field.type === 'select') return `可选值：${(field.options ?? []).map((option) => option.value).join(' / ') || '见页面下拉框'}`;
  if (field.type === 'textarea') return '文本，可留空';
  return '文本';
}

export interface BuiltTemplate {
  headers: string[];
  workbook: XLSX.WorkBook;
}

export function buildImportTemplate(spec: ImportTemplateSpec): BuiltTemplate {
  const extras = spec.templateColumns ?? [];
  const replaced = new Set(extras.map((column) => column.replaces).filter(Boolean) as string[]);
  const fields = spec.fields.filter((field) => !replaced.has(field.key));
  const headers = [...fields.map((field) => field.key), ...extras.map((column) => column.key)];

  const workbook = XLSX.utils.book_new();
  const sampleRow = headers.map((header) => spec.sample?.[header] ?? '');
  const sheet = XLSX.utils.aoa_to_sheet(spec.sample ? [headers, sampleRow] : [headers]);
  sheet['!cols'] = headers.map((header) => ({ wch: header === 'remark' ? 40 : Math.max(12, header.length + 2) }));
  XLSX.utils.book_append_sheet(workbook, sheet, safeSheetName(spec.sheetName));

  const guide: (string | number)[][] = [
    ['列名', '中文含义', '是否必填', '示例值', '填写说明'],
    ...fields.map((field) => [
      field.key,
      field.label,
      field.required ? '必填' : '选填',
      spec.sample?.[field.key] ?? '',
      describe(field),
    ]),
    ...extras.map((column) => [
      column.key,
      column.label,
      column.required ? '必填' : '选填',
      spec.sample?.[column.key] ?? '',
      column.note ?? '',
    ]),
    ...spec.fields.filter((field) => replaced.has(field.key)).map((field) => [
      field.key,
      field.label,
      '不用填',
      '',
      `导入模板里改用 ${extras.find((column) => column.replaces === field.key)?.key}，不需要知道数据库自增ID`,
    ]),
    [],
    ['注意事项'],
    ...(spec.notes ?? []).map((note) => [note]),
  ];
  const guideSheet = XLSX.utils.aoa_to_sheet(guide);
  guideSheet['!cols'] = [{ wch: 24 }, { wch: 16 }, { wch: 10 }, { wch: 26 }, { wch: 72 }];
  XLSX.utils.book_append_sheet(workbook, guideSheet, '填写说明');

  return { headers, workbook };
}

export function writeImportTemplate(spec: ImportTemplateSpec): ArrayBuffer {
  return XLSX.write(buildImportTemplate(spec).workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}
