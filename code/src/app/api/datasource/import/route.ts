/**
 * Excel 批量导入（校验 → 落 import_job → 整批写入）。
 *
 * 路径：POST /api/datasource/import
 *   Content-Type: multipart/form-data
 *   file  = xlsx/xls 文件（必填）
 *   type  = batches|products|readings|inspections|process|production-events
 *           （也可用查询参数 ?type=…；缺省时按工作表名自动识别）
 *
 * 处理顺序（贯穿全项目的一条规则：先整批校验，发现错误不写入任何数据）：
 *   1) 限制扩展名与大小（config.upload.maxMb）
 *   2) 解析工作簿，定位中文表头行（模板第 1 行说明、第 2 行表头、第 3 行示例）
 *   3) **服务端逐行校验**：必填列缺失、批次/规格/设备/指标/参数/温区/来源编码不存在、
 *      数值非法、时间格式非法、文件内重复行、数据库内已存在的自然键
 *   4) 把校验结果写入 import_job（total_rows / success_rows / error_rows / status / error_summary）
 *   5) 只要有一行出错 → status=failed，整批拒绝并返回逐行错误；全部通过 → 事务内写入业务表，
 *      import_job 置为 committed
 *   6) 写审计日志（module=datasource，action=import）
 *
 * 模板列名与 /api/datasource/import/template 保持一致：两边各持一份中文表头定义，
 * 由「下载模板 → 原样回传」的回归测试保证不漂移。
 */
import * as XLSX from 'xlsx';
import { withApi, ok } from '@/lib/api';
import { AppError } from '@/lib/errors';
import { config } from '@/lib/config';
import { formatLocal } from '@/lib/format';
import {
  execute,
  query,
  withTransaction,
  type PoolConnection,
  type RowDataPacket,
} from '@/lib/db';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ERRORS = 500;

// ── 模板定义（与 template/route.ts 一致） ─────────────────────────────

interface TypeDef {
  type: string;
  label: string;
  sheetName: string;
  group: 'product_master' | 'equipment' | 'production_data';
  table: string;
  columns: string[];
}

const TYPE_DEFS: TypeDef[] = [
  {
    type: 'batches',
    label: '生产批次',
    sheetName: '生产批次',
    group: 'production_data',
    table: 'production_batch',
    columns: [
      '批次编号*', '规格编码*', '生产开始时间*', '生产结束时间', '批次状态', '生产组别',
      '产线编码', '挤出设备编码', '牵引设备编码', '数据来源编码', '备注',
    ],
  },
  {
    type: 'products',
    label: '产品数据',
    sheetName: '产品数据',
    group: 'production_data',
    table: 'product_data',
    columns: ['产品数据编号*', '批次编号*', '生产日期*', '指标编码*', '指标值*', '数据来源编码', '备注'],
  },
  {
    type: 'readings',
    label: '设备采集数据',
    sheetName: '设备采集数据',
    group: 'equipment',
    table: 'equipment_reading',
    columns: [
      '记录编号*', '批次编号*', '生产日期*', '设备编码*', '采集时间*', '参数编码*', '参数值*',
      '数据来源编码', '备注',
    ],
  },
  {
    type: 'inspections',
    label: '样管抽检记录',
    sheetName: '样管抽检记录',
    group: 'production_data',
    table: 'inspection_record',
    columns: [
      '记录编号*', '样管编号*', '批次编号*', '抽检时间*', '指标编码*', '指标值*', '生产时间',
      '测量阶段', '检验方法', '量具仪器', '数据质量标记', '备注',
    ],
  },
  {
    type: 'process',
    label: '工艺过程记录',
    sheetName: '工艺过程记录',
    group: 'production_data',
    table: 'process_record',
    columns: [
      '记录编号*', '批次编号*', '记录时间*', '设备编码', '温区编码*', '设定温度', '反馈温度',
      '牵引反馈速度', '管材线速度', '质量产出率', '时间匹配状态', '备注',
    ],
  },
  {
    type: 'production-events',
    label: '生产事件记录',
    sheetName: '生产事件记录',
    group: 'production_data',
    table: 'production_event',
    columns: ['批次编号*', '事件类型*', '发生时间*', '结束时间', '持续分钟', '原因', '明细', '来源'],
  },
];

function findTypeDef(type: string): TypeDef {
  const def = TYPE_DEFS.find((item) => item.type === type);
  if (!def) {
    throw AppError.badRequest(
      `未知的导入类别：${type}（可选：${TYPE_DEFS.map((item) => item.type).join(' / ')}）。`,
    );
  }
  return def;
}

// ── 错误收集 ────────────────────────────────────────────────────────

interface ImportError {
  sheet: string;
  table: string;
  row: number;
  column: string | null;
  message: string;
  rawValue: string | null;
}

interface RowCtx {
  sheet: string;
  table: string;
  errors: ImportError[];
  errorRows: Set<number>;
}

function addError(
  ctx: RowCtx,
  row: number,
  column: string | null,
  message: string,
  rawValue?: unknown,
): void {
  ctx.errorRows.add(row);
  if (ctx.errors.length >= MAX_ERRORS) return;
  ctx.errors.push({
    sheet: ctx.sheet,
    table: ctx.table,
    row,
    column,
    message,
    rawValue:
      rawValue === null || rawValue === undefined ? null : String(rawValue).slice(0, 120),
  });
}

// ── 单元格解析 ──────────────────────────────────────────────────────

const DATETIME_RE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/;
const TIME_RE = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/;

function pad(value: string | number): string {
  return String(Number(value)).padStart(2, '0');
}

/** 单元格 → 去空白文本；Date 单元格按数据库口径格式化 */
function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return formatLocal(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value).trim();
}

/** 必填文本 */
function textCell(
  value: unknown,
  label: string,
  ctx: RowCtx,
  row: number,
  required: boolean,
): string | null {
  const text = toText(value);
  if (!text) {
    if (required) addError(ctx, row, label, `必填列「${label}」不能为空。`, value);
    return null;
  }
  return text;
}

/** 数值：非法时给出原始值，便于用户定位 */
function numberCell(
  value: unknown,
  label: string,
  ctx: RowCtx,
  row: number,
  required: boolean,
): number | null {
  const text = toText(value).replace(/,/g, '');
  if (!text) {
    if (required) addError(ctx, row, label, `必填列「${label}」不能为空。`, value);
    return null;
  }
  const num = Number(text);
  if (!Number.isFinite(num)) {
    addError(ctx, row, label, `数值非法：「${text}」不是有效数字。`, value);
    return null;
  }
  return num;
}

/** DATE / DATETIME → 'YYYY-MM-DD HH:mm:ss' */
function dateTimeCell(
  value: unknown,
  label: string,
  ctx: RowCtx,
  row: number,
  required: boolean,
): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      addError(ctx, row, label, `时间格式非法：「${toText(value)}」不是有效日期。`, value);
      return null;
    }
    return formatLocal(value);
  }
  const text = toText(value);
  if (!text) {
    if (required) addError(ctx, row, label, `必填列「${label}」不能为空。`, value);
    return null;
  }
  const match = text.match(DATETIME_RE);
  if (!match) {
    addError(ctx, row, label, `时间格式非法：「${text}」（应为 YYYY-MM-DD HH:mm:ss）。`, value);
    return null;
  }
  const [, y, mo, d, h = '0', mi = '0', s = '0'] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s);
  // 格式正确但取值越界（如 2026/13/45 99:99、2 月 30 日）同样必须拒绝，
  // 否则非法时间会被写进 DATETIME 列，变成 0000-00-00 或静默截断
  if (
    month < 1 || month > 12 || day < 1 || day > 31 ||
    hour > 23 || minute > 59 || second > 59
  ) {
    addError(ctx, row, label, `时间格式非法：「${text}」超出有效日期时间范围。`, value);
    return null;
  }
  const probe = new Date(year, month - 1, day, hour, minute, second);
  if (
    probe.getFullYear() !== year ||
    probe.getMonth() !== month - 1 ||
    probe.getDate() !== day
  ) {
    addError(ctx, row, label, `时间格式非法：「${text}」不是有效日历日期。`, value);
    return null;
  }
  return `${y}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

/** DATE → 'YYYY-MM-DD' */
function dateCell(
  value: unknown,
  label: string,
  ctx: RowCtx,
  row: number,
  required: boolean,
): string | null {
  const full = dateTimeCell(value, label, ctx, row, required);
  return full ? full.slice(0, 10) : null;
}

/** TIME → 'HH:mm:ss'（接受 8:00 / 08:00 / 08:00:00 与 Excel 时间单元格） */
function timeCell(
  value: unknown,
  label: string,
  ctx: RowCtx,
  row: number,
  required: boolean,
): string | null {
  let text = toText(value);
  if (value instanceof Date) text = text.slice(11);
  if (!text) {
    if (required) addError(ctx, row, label, `必填列「${label}」不能为空。`, value);
    return null;
  }
  const match = text.match(TIME_RE);
  if (!match) {
    addError(ctx, row, label, `时间格式非法：「${text}」（应为 HH:mm）。`, value);
    return null;
  }
  const [, h, mi, s = '0'] = match;
  if (Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) {
    addError(ctx, row, label, `时间格式非法：「${text}」超出 00:00–23:59 范围。`, value);
    return null;
  }
  return `${pad(h)}:${pad(mi)}:${pad(s)}`;
}

/** 枚举：同时接受中文标签与数据库取值 */
function enumCell(
  value: unknown,
  label: string,
  mapping: Record<string, string>,
  allowed: string[],
  ctx: RowCtx,
  row: number,
  required: boolean,
  fallback: string,
): string {
  const text = toText(value);
  if (!text) {
    if (required) addError(ctx, row, label, `必填列「${label}」不能为空。`, value);
    return fallback;
  }
  const code = mapping[text] ?? text;
  if (!allowed.includes(code)) {
    addError(
      ctx,
      row,
      label,
      `取值非法：「${text}」（可选：${allowed.join(' / ')} 或对应中文）。`,
      value,
    );
    return fallback;
  }
  return code;
}

// ── 字典 ────────────────────────────────────────────────────────────

interface Dictionaries {
  /** code / name（小写） → id */
  metrics: Map<string, number>;
  parameters: Map<string, number>;
  zones: Map<string, number>;
  specs: Map<string, number>;
  equipment: Map<string, number>;
  lines: Map<string, number>;
  sources: Map<string, number>;
  batches: Map<string, number>;
  batchSpec: Map<string, number>;
  batchGroup: Map<string, string | null>;
  /** 已存在的自然键：用于在写库前给出可读的「已存在」提示，而不是抛唯一键冲突 */
  productKeys: Set<string>;
  readingKeys: Set<string>;
  inspectionKeys: Set<string>;
  processCodes: Set<string>;
  defaultSourceId: number;
}

/** 批次编号归一化：大小写不敏感 */
function batchKey(batchNo: string): string {
  return batchNo.trim().toLowerCase();
}

function put(map: Map<string, number>, key: unknown, id: number): void {
  if (key === null || key === undefined) return;
  const text = String(key).trim().toLowerCase();
  if (text && !map.has(text)) map.set(text, id);
}

async function loadDictionaries(): Promise<Dictionaries> {
  const [
    metricRows, parameterRows, zoneRows, specRows, equipmentRows, lineRows, sourceRows, batchRows,
    productKeyRows, readingKeyRows, inspectionKeyRows, processCodeRows,
  ] = await Promise.all([
    query<RowDataPacket>('SELECT id, code, name FROM quality_metric ORDER BY sort_no, id'),
    query<RowDataPacket>('SELECT id, code, name FROM process_parameter ORDER BY sort_no, id'),
    query<RowDataPacket>('SELECT id, code, name FROM temp_zone ORDER BY sort_no, id'),
    query<RowDataPacket>('SELECT id, code, name FROM product_spec WHERE is_deleted = 0'),
    query<RowDataPacket>('SELECT id, code, name FROM equipment WHERE is_deleted = 0'),
    query<RowDataPacket>('SELECT id, code, name FROM production_line WHERE is_deleted = 0'),
    query<RowDataPacket>('SELECT id, code, name FROM data_source WHERE status = ?', ['enabled']),
    query<RowDataPacket>(
      'SELECT id, batch_no, spec_id, production_group FROM production_batch WHERE is_deleted = 0',
    ),
    query<RowDataPacket>('SELECT batch_id, production_date FROM product_data'),
    query<RowDataPacket>(
      'SELECT batch_id, production_date, equipment_id, collect_time FROM equipment_reading',
    ),
    query<RowDataPacket>('SELECT batch_id, inspect_time FROM inspection_record'),
    query<RowDataPacket>('SELECT code FROM process_record'),
  ]);

  const metrics = new Map<string, number>();
  for (const row of metricRows) {
    const id = Number(row.id);
    put(metrics, row.code, id);
    put(metrics, row.name, id);
  }

  const parameters = new Map<string, number>();
  for (const row of parameterRows) {
    put(parameters, row.code, Number(row.id));
    put(parameters, row.name, Number(row.id));
  }

  const zones = new Map<string, number>();
  for (const row of zoneRows) {
    put(zones, row.code, Number(row.id));
    put(zones, row.name, Number(row.id));
  }

  const specs = new Map<string, number>();
  for (const row of specRows) {
    put(specs, row.code, Number(row.id));
    put(specs, row.name, Number(row.id));
  }

  const equipmentMap = new Map<string, number>();
  for (const row of equipmentRows) {
    put(equipmentMap, row.code, Number(row.id));
    put(equipmentMap, row.name, Number(row.id));
  }

  const lines = new Map<string, number>();
  for (const row of lineRows) {
    put(lines, row.code, Number(row.id));
    put(lines, row.name, Number(row.id));
  }

  const sources = new Map<string, number>();
  let defaultSourceId: number | null = null;
  for (const row of sourceRows) {
    const id = Number(row.id);
    put(sources, row.code, id);
    put(sources, row.name, id);
    if (row.code === 'manual_entry') defaultSourceId = id;
    if (defaultSourceId === null) defaultSourceId = id;
  }

  const batches = new Map<string, number>();
  const batchSpec = new Map<string, number>();
  const batchGroup = new Map<string, string | null>();
  for (const row of batchRows) {
    // 批次号大小写不敏感（MES 侧大小写不统一），统一用小写键查询
    const batchNo = batchKey(String(row.batch_no));
    batches.set(batchNo, Number(row.id));
    batchSpec.set(batchNo, Number(row.spec_id));
    batchGroup.set(batchNo, row.production_group === null ? null : String(row.production_group));
  }

  const productKeys = new Set<string>();
  for (const row of productKeyRows) {
    productKeys.add(`${row.batch_id}|${String(row.production_date).slice(0, 10)}`);
  }
  const readingKeys = new Set<string>();
  for (const row of readingKeyRows) {
    readingKeys.add(
      `${row.batch_id}|${String(row.production_date).slice(0, 10)}|${row.equipment_id}|${String(
        row.collect_time,
      ).slice(0, 8)}`,
    );
  }
  const inspectionKeys = new Set<string>();
  for (const row of inspectionKeyRows) {
    inspectionKeys.add(`${row.batch_id}|${row.inspect_time}`);
  }
  const processCodes = new Set<string>();
  for (const row of processCodeRows) processCodes.add(String(row.code));

  if (defaultSourceId === null) {
    throw AppError.conflict('数据来源字典为空，无法确定导入数据的来源。请先在「数据来源字典」中启用至少一个来源。');
  }

  return {
    metrics,
    parameters,
    zones,
    specs,
    equipment: equipmentMap,
    lines,
    sources,
    batches,
    batchSpec,
    batchGroup,
    productKeys,
    readingKeys,
    inspectionKeys,
    processCodes,
    defaultSourceId,
  };
}

/** 从字典取 id；取不到时记录错误并返回 null */
function dictId(
  map: Map<string, number>,
  value: string | null,
  label: string,
  ctx: RowCtx,
  row: number,
  raw: unknown,
): number | null {
  if (value === null) return null;
  const id = map.get(value.toLowerCase());
  if (id === undefined) {
    addError(ctx, row, label, `${label}不存在：「${value}」，请先在主数据中登记。`, raw);
    return null;
  }
  return id;
}

// ── 表头定位 ────────────────────────────────────────────────────────

interface HeaderInfo {
  headerRowIndex: number;
  index: Map<string, number>;
}

function stripStar(header: string): string {
  return header.replace(/\*+$/, '').trim();
}

function findHeaderRow(rows: unknown[][], expected: string[]): HeaderInfo | null {
  const expectedSet = new Set(expected);
  let best: HeaderInfo | null = null;
  let bestScore = 0;
  const limit = Math.min(rows.length, 10);
  for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
    const index = new Map<string, number>();
    const row = rows[rowIndex] ?? [];
    for (let col = 0; col < row.length; col += 1) {
      const text = stripStar(toText(row[col]));
      if (text && expectedSet.has(text) && !index.has(text)) index.set(text, col);
    }
    if (index.size > bestScore) {
      bestScore = index.size;
      best = { headerRowIndex: rowIndex, index };
    }
  }
  return bestScore >= 1 ? best : null;
}

// ── 解析结果与写入动作 ──────────────────────────────────────────────

type WriteOp = (conn: PoolConnection) => Promise<unknown>;

interface ParseResult {
  def: TypeDef;
  ops: WriteOp[];
  ctx: RowCtx;
  totalRows: number;
  sheetCount: number;
}

function exec(conn: PoolConnection, sql: string, params: unknown[]): Promise<unknown> {
  return conn.execute(sql, params.map((value) => (value === undefined ? null : value)));
}

interface DataRow {
  rowNo: number;
  values: unknown[];
}

function cell(row: DataRow, header: HeaderInfo, name: string): unknown {
  const col = header.index.get(name);
  return col === undefined ? null : (row.values[col] ?? null);
}

/** 读取「说明 + 表头 + 数据」结构的工作表 */
function readSheet(
  sheet: XLSX.WorkSheet,
  def: TypeDef,
  ctx: RowCtx,
): { header: HeaderInfo | null; rows: DataRow[] } {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: true,
    raw: true,
  }) as unknown[][];

  const expected = def.columns.map(stripStar);
  const header = findHeaderRow(matrix, expected);
  if (!header) {
    addError(
      ctx,
      1,
      null,
      `未找到中文表头行。请使用系统下载的模板（第 2 行为表头），表头应包含：${def.columns.join('、')}。`,
    );
    return { header: null, rows: [] };
  }

  // 必填列缺失 → 整张表拒绝
  const missing = def.columns.filter(
    (column) => column.endsWith('*') && !header.index.has(stripStar(column)),
  );
  if (missing.length) {
    addError(
      ctx,
      header.headerRowIndex + 1,
      missing.map(stripStar).join('、'),
      `必填列缺失：${missing.join('、')}。请使用系统下载的最新模板。`,
    );
    return { header: null, rows: [] };
  }

  const rows: DataRow[] = [];
  for (let i = header.headerRowIndex + 1; i < matrix.length; i += 1) {
    const values = matrix[i] ?? [];
    const meaningful = values.some((value) => toText(value) !== '');
    if (!meaningful) continue;
    // 模板自带的示例行（备注列标注「示例行」）直接跳过，避免把示例当成真实数据导入
    if (values.some((value) => toText(value).includes('示例行'))) continue;
    rows.push({ rowNo: i + 1, values });
  }
  return { header, rows };
}

// ── 各类型解析 ──────────────────────────────────────────────────────

const BATCH_STATUS_MAP: Record<string, string> = {
  计划: 'planned',
  待生产: 'planned',
  生产中: 'in_progress',
  进行中: 'in_progress',
  已完成: 'completed',
  已完工: 'completed',
  已取消: 'cancelled',
};
const MEASUREMENT_STAGE_MAP: Record<string, string> = {
  初测: 'initial',
  复测: 'retest',
  待确认: 'unconfirmed',
};
const QUALITY_FLAG_MAP: Record<string, string> = {
  无数据质量问题: 'none',
  无: 'none',
  'QMS/MES 记录差异': 'qms_mes_mismatch',
  'QMS/MES记录差异': 'qms_mes_mismatch',
  测量数据错误: 'measurement_error',
  规格匹配待核对: 'spec_mismatch',
  数据不足: 'insufficient',
};
const TIME_MATCH_MAP: Record<string, string> = {
  已确认: 'confirmed',
  待确认: 'pending',
  不匹配: 'mismatch',
  时间匹配待确认: 'pending',
};
const EVENT_TYPE_MAP: Record<string, string> = {
  开机: 'start',
  停机: 'stop',
  重启: 'restart',
  换规格: 'spec_changeover',
  调机: 'adjustment',
  换料: 'material_change',
  其他: 'other',
};

/** 生产批次 */
function buildBatches(
  def: TypeDef,
  header: HeaderInfo,
  rows: DataRow[],
  dicts: Dictionaries,
  ctx: RowCtx,
  userId: number,
): WriteOp[] {
  const ops: WriteOp[] = [];
  const seen = new Map<string, number>();

  for (const row of rows) {
    const batchNo = textCell(cell(row, header, '批次编号'), '批次编号', ctx, row.rowNo, true);
    const specCode = textCell(cell(row, header, '规格编码'), '规格编码', ctx, row.rowNo, true);
    const startTime = dateTimeCell(
      cell(row, header, '生产开始时间'),
      '生产开始时间',
      ctx,
      row.rowNo,
      true,
    );
    const endTime = dateTimeCell(
      cell(row, header, '生产结束时间'),
      '生产结束时间',
      ctx,
      row.rowNo,
      false,
    );
    const status = enumCell(
      cell(row, header, '批次状态'),
      '批次状态',
      BATCH_STATUS_MAP,
      ['planned', 'in_progress', 'completed', 'cancelled'],
      ctx,
      row.rowNo,
      false,
      'completed',
    );
    const group = textCell(cell(row, header, '生产组别'), '生产组别', ctx, row.rowNo, false);
    const lineCode = textCell(cell(row, header, '产线编码'), '产线编码', ctx, row.rowNo, false);
    const extruderCode = textCell(
      cell(row, header, '挤出设备编码'),
      '挤出设备编码',
      ctx,
      row.rowNo,
      false,
    );
    const haulOffCode = textCell(
      cell(row, header, '牵引设备编码'),
      '牵引设备编码',
      ctx,
      row.rowNo,
      false,
    );
    const sourceCode = textCell(
      cell(row, header, '数据来源编码'),
      '数据来源编码',
      ctx,
      row.rowNo,
      false,
    );
    const remark = textCell(cell(row, header, '备注'), '备注', ctx, row.rowNo, false);

    if (batchNo) {
      const previous = seen.get(batchNo);
      if (previous !== undefined) {
        addError(ctx, row.rowNo, '批次编号', `与第 ${previous} 行重复：批次编号「${batchNo}」在文件中出现多次。`, batchNo);
      } else {
        seen.set(batchNo, row.rowNo);
      }
      if (dicts.batches.has(batchKey(batchNo))) {
        addError(ctx, row.rowNo, '批次编号', `批次编号「${batchNo}」在系统中已存在。`, batchNo);
      }
    }

    const specId = dictId(dicts.specs, specCode, '规格编码', ctx, row.rowNo, specCode);
    const lineId = lineCode ? dictId(dicts.lines, lineCode, '产线编码', ctx, row.rowNo, lineCode) : null;
    const extruderId = extruderCode
      ? dictId(dicts.equipment, extruderCode, '挤出设备编码', ctx, row.rowNo, extruderCode)
      : null;
    const haulOffId = haulOffCode
      ? dictId(dicts.equipment, haulOffCode, '牵引设备编码', ctx, row.rowNo, haulOffCode)
      : null;
    const sourceId = sourceCode
      ? dictId(dicts.sources, sourceCode, '数据来源编码', ctx, row.rowNo, sourceCode)
      : dicts.defaultSourceId;

    if (!batchNo || !specId || !startTime || !sourceId) continue;

    ops.push((conn) =>
      exec(
        conn,
        `INSERT INTO production_batch
           (batch_no, spec_id, line_id, extruder_id, haul_off_id, production_group,
            start_time, end_time, batch_status, data_source_id, remark, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [batchNo, specId, lineId, extruderId, haulOffId, group, startTime, endTime, status, sourceId, remark, userId],
      ),
    );
  }

  return ops;
}

/** 产品数据（长表：一个产品数据编号 = 表头 + 多指标行） */
function buildProducts(
  def: TypeDef,
  header: HeaderInfo,
  rows: DataRow[],
  dicts: Dictionaries,
  ctx: RowCtx,
  userId: number,
): WriteOp[] {
  interface Group {
    rows: number[];
    code: string;
    batchNo: string;
    batchId: number | null;
    productionDate: string;
    sourceId: number;
    remark: string | null;
    values: Map<number, number>;
  }

  const groups = new Map<string, Group>();
  for (const row of rows) {
    const code = textCell(cell(row, header, '产品数据编号'), '产品数据编号', ctx, row.rowNo, true);
    const batchNo = textCell(cell(row, header, '批次编号'), '批次编号', ctx, row.rowNo, true);
    const productionDate = dateCell(
      cell(row, header, '生产日期'),
      '生产日期',
      ctx,
      row.rowNo,
      true,
    );
    const metricCode = textCell(cell(row, header, '指标编码'), '指标编码', ctx, row.rowNo, true);
    const metricValue = numberCell(
      cell(row, header, '指标值'),
      '指标值',
      ctx,
      row.rowNo,
      true,
    );
    const sourceCode = textCell(
      cell(row, header, '数据来源编码'),
      '数据来源编码',
      ctx,
      row.rowNo,
      false,
    );
    const remark = textCell(cell(row, header, '备注'), '备注', ctx, row.rowNo, false);

    const batchId = batchNo
      ? dictId(dicts.batches, batchNo, '批次编号', ctx, row.rowNo, batchNo)
      : null;
    const metricId = metricCode
      ? dictId(dicts.metrics, metricCode, '指标编码', ctx, row.rowNo, metricCode)
      : null;
    const sourceId = sourceCode
      ? dictId(dicts.sources, sourceCode, '数据来源编码', ctx, row.rowNo, sourceCode)
      : dicts.defaultSourceId;

    if (!code || !batchNo || !productionDate || !metricCode || metricValue === null) continue;

    let group = groups.get(code);
    if (!group) {
      group = {
        rows: [],
        code,
        batchNo,
        batchId,
        productionDate,
        sourceId: sourceId ?? dicts.defaultSourceId,
        remark,
        values: new Map(),
      };
      groups.set(code, group);
    }
    group.rows.push(row.rowNo);
    if (group.batchNo !== batchNo) {
      addError(
        ctx,
        row.rowNo,
        '批次编号',
        `同一产品数据编号「${code}」的批次编号不一致（${group.batchNo} / ${batchNo}）。`,
        batchNo,
      );
    }
    if (group.productionDate !== productionDate) {
      addError(
        ctx,
        row.rowNo,
        '生产日期',
        `同一产品数据编号「${code}」的生产日期不一致（${group.productionDate} / ${productionDate}）。`,
        productionDate,
      );
    }
    if (metricId !== null) {
      const previous = group.values.get(metricId);
      if (previous !== undefined && previous !== metricValue) {
        addError(
          ctx,
          row.rowNo,
          '指标编码',
          `重复行：产品数据编号「${code}」的指标「${metricCode}」出现多次且取值不同。`,
          metricCode,
        );
      } else if (previous !== undefined) {
        addError(
          ctx,
          row.rowNo,
          '指标编码',
          `重复行：产品数据编号「${code}」的指标「${metricCode}」重复。`,
          metricCode,
        );
      } else {
        group.values.set(metricId, metricValue);
      }
    }
  }

  const existingKeys = new Set<string>();
  const ops: WriteOp[] = [];
  for (const group of groups.values()) {
    if (!group.batchId) continue;
    const key = `${group.batchId}|${group.productionDate}`;
    if (existingKeys.has(key)) {
      for (const rowNo of group.rows) {
        addError(ctx, rowNo, '产品数据编号', `批次 + 生产日期（${group.batchNo} / ${group.productionDate}）在文件中重复。`, group.code);
      }
    }
    if (dicts.productKeys.has(key)) {
      for (const rowNo of group.rows) {
        addError(
          ctx,
          rowNo,
          '产品数据编号',
          `批次 + 生产日期（${group.batchNo} / ${group.productionDate}）的产品数据已存在，不能重复导入。`,
          group.code,
        );
      }
    }
    existingKeys.add(key);
    ops.push(async (conn) => {
      const [result] = (await exec(
        conn,
        `INSERT INTO product_data (code, batch_id, production_date, data_source_id, remark, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [group.code, group.batchId, group.productionDate, group.sourceId, group.remark, userId],
      )) as [{ insertId: number }];
      const productDataId = Number(result.insertId);
      for (const [metricId, metricValue] of group.values) {
        await exec(
          conn,
          `INSERT INTO product_data_value (product_data_id, metric_id, metric_value, is_derived)
           VALUES (?, ?, ?, 0)`,
          [productDataId, metricId, metricValue],
        );
      }
    });
  }

  return ops;
}

/** 设备采集数据 */
function buildReadings(
  def: TypeDef,
  header: HeaderInfo,
  rows: DataRow[],
  dicts: Dictionaries,
  ctx: RowCtx,
): WriteOp[] {
  interface Group {
    rows: number[];
    code: string;
    batchId: number | null;
    batchNo: string;
    productionDate: string;
    equipmentId: number | null;
    collectTime: string;
    sourceId: number;
    remark: string | null;
    values: Map<number, number>;
  }

  const groups = new Map<string, Group>();
  for (const row of rows) {
    const code = textCell(cell(row, header, '记录编号'), '记录编号', ctx, row.rowNo, true);
    const batchNo = textCell(cell(row, header, '批次编号'), '批次编号', ctx, row.rowNo, true);
    const productionDate = dateCell(cell(row, header, '生产日期'), '生产日期', ctx, row.rowNo, true);
    const equipmentCode = textCell(cell(row, header, '设备编码'), '设备编码', ctx, row.rowNo, true);
    const collectTime = timeCell(cell(row, header, '采集时间'), '采集时间', ctx, row.rowNo, true);
    const parameterCode = textCell(cell(row, header, '参数编码'), '参数编码', ctx, row.rowNo, true);
    const parameterValue = numberCell(
      cell(row, header, '参数值'),
      '参数值',
      ctx,
      row.rowNo,
      true,
    );
    const sourceCode = textCell(
      cell(row, header, '数据来源编码'),
      '数据来源编码',
      ctx,
      row.rowNo,
      false,
    );
    const remark = textCell(cell(row, header, '备注'), '备注', ctx, row.rowNo, false);

    const batchId = batchNo
      ? dictId(dicts.batches, batchNo, '批次编号', ctx, row.rowNo, batchNo)
      : null;
    const equipmentId = equipmentCode
      ? dictId(dicts.equipment, equipmentCode, '设备编码', ctx, row.rowNo, equipmentCode)
      : null;
    const parameterId = parameterCode
      ? dictId(dicts.parameters, parameterCode, '参数编码', ctx, row.rowNo, parameterCode)
      : null;
    const sourceId = sourceCode
      ? dictId(dicts.sources, sourceCode, '数据来源编码', ctx, row.rowNo, sourceCode)
      : dicts.defaultSourceId;

    if (!code || !batchNo || !productionDate || !equipmentCode || !collectTime || !parameterCode) {
      continue;
    }

    let group = groups.get(code);
    if (!group) {
      group = {
        rows: [],
        code,
        batchId,
        batchNo,
        productionDate,
        equipmentId,
        collectTime,
        sourceId: sourceId ?? dicts.defaultSourceId,
        remark,
        values: new Map(),
      };
      groups.set(code, group);
    }
    group.rows.push(row.rowNo);
    if (
      group.batchNo !== batchNo ||
      group.productionDate !== productionDate ||
      group.equipmentId !== equipmentId ||
      group.collectTime !== collectTime
    ) {
      addError(
        ctx,
        row.rowNo,
        '记录编号',
        `同一记录编号「${code}」的批次 / 生产日期 / 设备 / 采集时间必须一致。`,
        code,
      );
    }
    if (parameterId !== null) {
      if (group.values.has(parameterId)) {
        addError(
          ctx,
          row.rowNo,
          '参数编码',
          `重复行：记录编号「${code}」的参数「${parameterCode}」重复。`,
          parameterCode,
        );
      } else if (parameterValue !== null) {
        group.values.set(parameterId, parameterValue);
      }
    }
  }

  const ops: WriteOp[] = [];
  const seenKeys = new Set<string>();
  for (const group of groups.values()) {
    if (!group.batchId || !group.equipmentId) continue;
    const key = `${group.batchId}|${group.productionDate}|${group.equipmentId}|${group.collectTime}`;
    if (seenKeys.has(key)) {
      for (const rowNo of group.rows) {
        addError(ctx, rowNo, '记录编号', `同一设备 + 生产日期 + 采集时间在文件中重复（${group.code}）。`, group.code);
      }
    }
    if (dicts.readingKeys.has(key)) {
      for (const rowNo of group.rows) {
        addError(
          ctx,
          rowNo,
          '记录编号',
          `同一设备 + 生产日期 + 采集时间的采集数据已存在（${group.code}），不能重复导入。`,
          group.code,
        );
      }
    }
    seenKeys.add(key);
    ops.push(async (conn) => {
      const [result] = (await exec(
        conn,
        `INSERT INTO equipment_reading
           (code, batch_id, production_date, equipment_id, collect_time, collected_at,
            data_source_id, remark)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          group.code,
          group.batchId,
          group.productionDate,
          group.equipmentId,
          group.collectTime,
          `${group.productionDate} ${group.collectTime}`,
          group.sourceId,
          group.remark,
        ],
      )) as [{ insertId: number }];
      const readingId = Number(result.insertId);
      for (const [parameterId, parameterValue] of group.values) {
        await exec(
          conn,
          `INSERT INTO equipment_reading_value (reading_id, parameter_id, parameter_value)
           VALUES (?, ?, ?)`,
          [readingId, parameterId, parameterValue],
        );
      }
    });
  }
  return ops;
}

/** 样管抽检记录（指标缺失不写行 → 界面显示「无数据」） */
function buildInspections(
  def: TypeDef,
  header: HeaderInfo,
  rows: DataRow[],
  dicts: Dictionaries,
  ctx: RowCtx,
  userId: number,
): WriteOp[] {
  interface Group {
    rows: number[];
    code: string;
    sampleNo: string;
    batchId: number | null;
    batchNo: string;
    inspectTime: string;
    productionTime: string | null;
    stage: string;
    method: string | null;
    instrument: string | null;
    qualityFlag: string;
    remark: string | null;
    values: Map<number, number>;
  }

  const groups = new Map<string, Group>();
  for (const row of rows) {
    const code = textCell(cell(row, header, '记录编号'), '记录编号', ctx, row.rowNo, true);
    const sampleNo = textCell(cell(row, header, '样管编号'), '样管编号', ctx, row.rowNo, true);
    const batchNo = textCell(cell(row, header, '批次编号'), '批次编号', ctx, row.rowNo, true);
    const inspectTime = dateTimeCell(cell(row, header, '抽检时间'), '抽检时间', ctx, row.rowNo, true);
    const metricCode = textCell(cell(row, header, '指标编码'), '指标编码', ctx, row.rowNo, true);
    const metricValue = numberCell(cell(row, header, '指标值'), '指标值', ctx, row.rowNo, true);
    const productionTime = dateTimeCell(
      cell(row, header, '生产时间'),
      '生产时间',
      ctx,
      row.rowNo,
      false,
    );
    const stage = enumCell(
      cell(row, header, '测量阶段'),
      '测量阶段',
      MEASUREMENT_STAGE_MAP,
      ['initial', 'retest', 'unconfirmed'],
      ctx,
      row.rowNo,
      false,
      'unconfirmed',
    );
    const method = textCell(cell(row, header, '检验方法'), '检验方法', ctx, row.rowNo, false);
    const instrument = textCell(cell(row, header, '量具仪器'), '量具仪器', ctx, row.rowNo, false);
    const qualityFlag = enumCell(
      cell(row, header, '数据质量标记'),
      '数据质量标记',
      QUALITY_FLAG_MAP,
      ['none', 'qms_mes_mismatch', 'measurement_error', 'spec_mismatch', 'insufficient'],
      ctx,
      row.rowNo,
      false,
      'none',
    );
    const remark = textCell(cell(row, header, '备注'), '备注', ctx, row.rowNo, false);

    const batchId = batchNo
      ? dictId(dicts.batches, batchNo, '批次编号', ctx, row.rowNo, batchNo)
      : null;
    const metricId = metricCode
      ? dictId(dicts.metrics, metricCode, '指标编码', ctx, row.rowNo, metricCode)
      : null;

    if (!code || !sampleNo || !batchNo || !inspectTime || !metricCode || metricValue === null) {
      continue;
    }

    let group = groups.get(code);
    if (!group) {
      group = {
        rows: [],
        code,
        sampleNo,
        batchId,
        batchNo,
        inspectTime,
        productionTime,
        stage,
        method,
        instrument,
        qualityFlag,
        remark,
        values: new Map(),
      };
      groups.set(code, group);
    }
    group.rows.push(row.rowNo);
    if (group.batchNo !== batchNo || group.inspectTime !== inspectTime) {
      addError(
        ctx,
        row.rowNo,
        '记录编号',
        `同一记录编号「${code}」的批次编号 / 抽检时间必须一致。`,
        code,
      );
    }
    if (metricId !== null) {
      if (group.values.has(metricId)) {
        addError(
          ctx,
          row.rowNo,
          '指标编码',
          `重复行：记录编号「${code}」的指标「${metricCode}」重复。`,
          metricCode,
        );
      } else {
        group.values.set(metricId, metricValue);
      }
    }
  }

  const ops: WriteOp[] = [];
  const seenKeys = new Set<string>();
  for (const group of groups.values()) {
    if (!group.batchId) continue;
    const key = `${group.batchId}|${group.inspectTime}`;
    if (seenKeys.has(key)) {
      for (const rowNo of group.rows) {
        addError(ctx, rowNo, '抽检时间', `批次 + 抽检时间在文件中重复（${group.batchNo} / ${group.inspectTime}）。`, group.code);
      }
    }
    if (dicts.inspectionKeys.has(key)) {
      for (const rowNo of group.rows) {
        addError(
          ctx,
          rowNo,
          '抽检时间',
          `批次 + 抽检时间（${group.batchNo} / ${group.inspectTime}）的抽检记录已存在，不能重复导入。`,
          group.code,
        );
      }
    }
    seenKeys.add(key);

    const specId = dicts.batchSpec.get(batchKey(group.batchNo)) ?? null;
    if (!specId) {
      for (const rowNo of group.rows) {
        addError(ctx, rowNo, '批次编号', `批次「${group.batchNo}」缺少产品规格，无法写入抽检记录。`, group.batchNo);
      }
      continue;
    }

    let delayMinutes: number | null = null;
    if (group.productionTime) {
      const from = new Date(group.productionTime.replace(' ', 'T')).getTime();
      const to = new Date(group.inspectTime.replace(' ', 'T')).getTime();
      if (Number.isFinite(from) && Number.isFinite(to) && to >= from) {
        delayMinutes = Math.round((to - from) / 60_000);
      }
    }

    ops.push(async (conn) => {
      const [result] = (await exec(
        conn,
        `INSERT INTO inspection_record
           (code, sample_no, batch_id, spec_id, production_group, inspect_time, production_time,
            inspection_delay_minutes, measurement_stage, inspection_method, instrument_info,
            quality_flag, data_source_id, record_status, remark, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'valid', ?, ?)`,
        [
          group.code,
          group.sampleNo,
          group.batchId,
          specId,
          dicts.batchGroup.get(batchKey(group.batchNo)) ?? null,
          group.inspectTime,
          group.productionTime,
          delayMinutes,
          group.stage,
          group.method,
          group.instrument,
          group.qualityFlag,
          dicts.defaultSourceId,
          group.remark,
          userId,
        ],
      )) as [{ insertId: number }];
      const recordId = Number(result.insertId);
      // 关键：某指标没有数据 = 不写值行（界面显示「无数据」，绝不显示 0）
      for (const [metricId, metricValue] of group.values) {
        await exec(
          conn,
          `INSERT INTO inspection_value (record_id, metric_id, metric_value, is_derived, is_simulated)
           VALUES (?, ?, ?, 0, 0)`,
          [recordId, metricId, metricValue],
        );
      }
    });
  }
  return ops;
}

/** 工艺过程记录（温区行） */
function buildProcess(
  def: TypeDef,
  header: HeaderInfo,
  rows: DataRow[],
  dicts: Dictionaries,
  ctx: RowCtx,
): WriteOp[] {
  interface Group {
    rows: number[];
    code: string;
    batchId: number | null;
    batchNo: string;
    recordTime: string;
    equipmentId: number | null;
    timeMatchStatus: string;
    haulOff: number | null;
    lineSpeed: number | null;
    massOutput: number | null;
    remark: string | null;
    zones: Map<number, { setpoint: number | null; feedback: number | null }>;
  }

  const groups = new Map<string, Group>();
  for (const row of rows) {
    const code = textCell(cell(row, header, '记录编号'), '记录编号', ctx, row.rowNo, true);
    const batchNo = textCell(cell(row, header, '批次编号'), '批次编号', ctx, row.rowNo, true);
    const recordTime = dateTimeCell(cell(row, header, '记录时间'), '记录时间', ctx, row.rowNo, true);
    const equipmentCode = textCell(cell(row, header, '设备编码'), '设备编码', ctx, row.rowNo, false);
    const zoneCode = textCell(cell(row, header, '温区编码'), '温区编码', ctx, row.rowNo, true);
    const setpoint = numberCell(cell(row, header, '设定温度'), '设定温度', ctx, row.rowNo, false);
    const feedback = numberCell(cell(row, header, '反馈温度'), '反馈温度', ctx, row.rowNo, false);
    const haulOff = numberCell(
      cell(row, header, '牵引反馈速度'),
      '牵引反馈速度',
      ctx,
      row.rowNo,
      false,
    );
    const lineSpeed = numberCell(cell(row, header, '管材线速度'), '管材线速度', ctx, row.rowNo, false);
    const massOutput = numberCell(cell(row, header, '质量产出率'), '质量产出率', ctx, row.rowNo, false);
    const matchStatus = enumCell(
      cell(row, header, '时间匹配状态'),
      '时间匹配状态',
      TIME_MATCH_MAP,
      ['confirmed', 'pending', 'mismatch'],
      ctx,
      row.rowNo,
      false,
      'pending',
    );
    const remark = textCell(cell(row, header, '备注'), '备注', ctx, row.rowNo, false);

    const batchId = batchNo
      ? dictId(dicts.batches, batchNo, '批次编号', ctx, row.rowNo, batchNo)
      : null;
    const equipmentId = equipmentCode
      ? dictId(dicts.equipment, equipmentCode, '设备编码', ctx, row.rowNo, equipmentCode)
      : null;
    const zoneId = zoneCode
      ? dictId(dicts.zones, zoneCode, '温区编码', ctx, row.rowNo, zoneCode)
      : null;

    if (!code || !batchNo || !recordTime || !zoneCode) continue;

    let group = groups.get(code);
    if (!group) {
      group = {
        rows: [],
        code,
        batchId,
        batchNo,
        recordTime,
        equipmentId,
        timeMatchStatus: matchStatus,
        haulOff,
        lineSpeed,
        massOutput,
        remark,
        zones: new Map(),
      };
      groups.set(code, group);
    }
    group.rows.push(row.rowNo);
    if (group.batchNo !== batchNo || group.recordTime !== recordTime) {
      addError(
        ctx,
        row.rowNo,
        '记录编号',
        `同一记录编号「${code}」的批次编号 / 记录时间必须一致。`,
        code,
      );
    }
    if (zoneId !== null) {
      if (group.zones.has(zoneId)) {
        addError(
          ctx,
          row.rowNo,
          '温区编码',
          `重复行：记录编号「${code}」的温区「${zoneCode}」重复。`,
          zoneCode,
        );
      } else {
        group.zones.set(zoneId, { setpoint, feedback });
      }
    }
  }

  const ops: WriteOp[] = [];
  for (const group of groups.values()) {
    if (!group.batchId) continue;
    if (dicts.processCodes.has(group.code)) {
      for (const rowNo of group.rows) {
        addError(ctx, rowNo, '记录编号', `工艺记录编号「${group.code}」已存在，不能重复导入。`, group.code);
      }
    }
    ops.push(async (conn) => {
      const [result] = (await exec(
        conn,
        `INSERT INTO process_record
           (code, batch_id, equipment_id, record_time, time_match_status,
            haul_off_feedback_mpm, pipe_line_speed_mpm, mass_output_kgh, remark)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          group.code,
          group.batchId,
          group.equipmentId,
          group.recordTime,
          group.timeMatchStatus,
          group.haulOff,
          group.lineSpeed,
          group.massOutput,
          group.remark,
        ],
      )) as [{ insertId: number }];
      const processRecordId = Number(result.insertId);
      for (const [zoneId, zone] of group.zones) {
        await exec(
          conn,
          `INSERT INTO process_zone_value (process_record_id, zone_id, setpoint_c, feedback_c)
           VALUES (?, ?, ?, ?)`,
          [processRecordId, zoneId, zone.setpoint, zone.feedback],
        );
      }
    });
  }
  return ops;
}

/** 生产事件 */
function buildProductionEvents(
  def: TypeDef,
  header: HeaderInfo,
  rows: DataRow[],
  dicts: Dictionaries,
  ctx: RowCtx,
  userId: number,
): WriteOp[] {
  const ops: WriteOp[] = [];
  const seen = new Map<string, number>();

  for (const row of rows) {
    const batchNo = textCell(cell(row, header, '批次编号'), '批次编号', ctx, row.rowNo, true);
    const eventType = enumCell(
      cell(row, header, '事件类型'),
      '事件类型',
      EVENT_TYPE_MAP,
      ['start', 'stop', 'restart', 'spec_changeover', 'adjustment', 'material_change', 'other'],
      ctx,
      row.rowNo,
      true,
      'other',
    );
    const occurTime = dateTimeCell(cell(row, header, '发生时间'), '发生时间', ctx, row.rowNo, true);
    const endTime = dateTimeCell(cell(row, header, '结束时间'), '结束时间', ctx, row.rowNo, false);
    const duration = numberCell(cell(row, header, '持续分钟'), '持续分钟', ctx, row.rowNo, false);
    const reason = textCell(cell(row, header, '原因'), '原因', ctx, row.rowNo, false);
    const detail = textCell(cell(row, header, '明细'), '明细', ctx, row.rowNo, false);
    const source = textCell(cell(row, header, '来源'), '来源', ctx, row.rowNo, false);

    const batchId = batchNo
      ? dictId(dicts.batches, batchNo, '批次编号', ctx, row.rowNo, batchNo)
      : null;

    if (batchNo && eventType && occurTime) {
      const key = `${batchNo}|${eventType}|${occurTime}`;
      const previous = seen.get(key);
      if (previous !== undefined) {
        addError(ctx, row.rowNo, '发生时间', `与第 ${previous} 行重复：同一批次的事件类型 + 发生时间重复。`, key);
      } else {
        seen.set(key, row.rowNo);
      }
    }

    if (!batchId || !occurTime) continue;

    let durationMinutes = duration === null ? null : Math.round(duration);
    if (durationMinutes === null && endTime) {
      const from = new Date(occurTime.replace(' ', 'T')).getTime();
      const to = new Date(endTime.replace(' ', 'T')).getTime();
      if (Number.isFinite(from) && Number.isFinite(to) && to >= from) {
        durationMinutes = Math.round((to - from) / 60_000);
      }
    }

    ops.push((conn) =>
      exec(
        conn,
        `INSERT INTO production_event
           (batch_id, event_type, occur_time, end_time, duration_minutes, reason, detail, source, operator_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [batchId, eventType, occurTime, endTime, durationMinutes, reason, detail, source, userId],
      ),
    );
  }
  return ops;
}

// ── 工作簿解析 ──────────────────────────────────────────────────────

async function parseWorkbook(
  buffer: Buffer,
  def: TypeDef,
  dicts: Dictionaries,
  userId: number,
): Promise<ParseResult> {
  let book: XLSX.WorkBook;
  try {
    book = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } catch {
    throw AppError.badRequest('无法解析该文件，请确认是有效的 .xlsx / .xls 工作簿。');
  }

  if (!book.SheetNames.length) throw AppError.badRequest('工作簿中没有工作表。');

  const errors: ImportError[] = [];
  const ctx: RowCtx = { sheet: def.sheetName, table: def.table, errors, errorRows: new Set() };

  // 优先取同名工作表，其次第一张
  const sheetName = book.SheetNames.includes(def.sheetName)
    ? def.sheetName
    : book.SheetNames[0];
  const sheet = book.Sheets[sheetName];
  const { header, rows } = readSheet(sheet, def, ctx);

  let ops: WriteOp[] = [];
  if (header) {
    switch (def.type) {
      case 'batches':
        ops = buildBatches(def, header, rows, dicts, ctx, userId);
        break;
      case 'products':
        ops = buildProducts(def, header, rows, dicts, ctx, userId);
        break;
      case 'readings':
        ops = buildReadings(def, header, rows, dicts, ctx);
        break;
      case 'inspections':
        ops = buildInspections(def, header, rows, dicts, ctx, userId);
        break;
      case 'process':
        ops = buildProcess(def, header, rows, dicts, ctx);
        break;
      case 'production-events':
        ops = buildProductionEvents(def, header, rows, dicts, ctx, userId);
        break;
      default:
        throw AppError.badRequest(`未实现的导入类别：${def.type}`);
    }
  }

  if (header && !rows.length) {
    addError(
      ctx,
      header.headerRowIndex + 2,
      null,
      '文件中没有可导入的数据行（表头下方为空）。',
    );
  }

  return { def, ops, ctx, totalRows: rows.length, sheetCount: book.SheetNames.length };
}

/** 生成导入批次号：IMP-时间戳-随机 */
function nextJobCode(): string {
  const stamp = formatLocal(new Date()).replace(/[-: ]/g, '');
  const random = String(Math.floor(Math.random() * 10_000)).padStart(4, '0');
  return `IMP-${stamp}-${random}`;
}

// ── 路由 ────────────────────────────────────────────────────────────

/**
 * POST 上传并导入。
 * 上传字段：file（必填），type（可选，也可放在查询参数中）。
 */
export const POST = withApi(
  { name: 'POST /api/datasource/import', permission: 'datasource:import' },
  async ({ request, user }) => {
    const maxBytes = Math.max(1, config.upload.maxMb) * 1024 * 1024;

    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (Number.isFinite(contentLength) && contentLength > maxBytes + 1024 * 1024) {
      throw AppError.badRequest(
        `上传内容过大（约 ${(contentLength / 1024 / 1024).toFixed(1)} MB），单次上限 ${config.upload.maxMb} MB。`,
      );
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw AppError.badRequest('请求不是合法的 multipart/form-data 表单。');
    }

    const file = form.get('file');
    if (!(file instanceof File)) {
      throw AppError.badRequest('请通过表单字段 file 上传 Excel 文件。');
    }
    if (file.size === 0) throw AppError.badRequest('上传的文件为空。');
    if (file.size > maxBytes) {
      throw AppError.badRequest(
        `文件大小 ${(file.size / 1024 / 1024).toFixed(2)} MB 超过上限 ${config.upload.maxMb} MB。`,
      );
    }

    const extension = (file.name.split('.').pop() ?? '').toLowerCase();
    if (!['xlsx', 'xls'].includes(extension)) {
      throw AppError.badRequest(
        `不支持的文件类型「.${extension}」，只接受 .xlsx 或 .xls 工作簿。`,
      );
    }

    const url = new URL(request.url);
    const typeValue =
      url.searchParams.get('type') ?? (typeof form.get('type') === 'string' ? String(form.get('type')) : '');
    if (!typeValue) {
      throw AppError.badRequest(
        `请指定导入类别 type（可选：${TYPE_DEFS.map((item) => item.type).join(' / ')}）。`,
      );
    }
    const def = findTypeDef(typeValue);

    const buffer = Buffer.from(await file.arrayBuffer());
    const dicts = await loadDictionaries();
    const parsed = await parseWorkbook(buffer, def, dicts, user!.userId);

    const errorRows = parsed.ctx.errorRows.size;
    const successRows = Math.max(0, parsed.totalRows - errorRows);
    const accepted = parsed.ctx.errors.length === 0 && parsed.totalRows > 0;
    const jobCode = nextJobCode();
    const errorSummary = parsed.ctx.errors.slice(0, MAX_ERRORS);

    // ① 先落 import_job：即使随后写入失败，校验结论也可追溯
    const jobResult = await execute(
      `INSERT INTO import_job
         (code, group_key, file_name, file_size_bytes, sheet_count, total_rows, success_rows,
          error_rows, status, error_summary, imported_by, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        jobCode,
        def.group,
        file.name.slice(0, 255),
        file.size,
        parsed.sheetCount,
        parsed.totalRows,
        successRows,
        errorRows,
        accepted ? 'validated' : 'failed',
        JSON.stringify(errorSummary),
        user!.userId,
        `导入类别：${def.type}（${def.label}）`,
      ],
    );
    const jobId = Number(jobResult.insertId);

    if (!accepted) {
      await writeAudit({
        user,
        module: 'datasource',
        action: 'import',
        targetType: 'import_job',
        targetId: jobId,
        detail: `导入被拒绝：${def.label}，文件 ${file.name}，总 ${parsed.totalRows} 行，错误 ${errorRows} 行。`,
        detailJson: { jobCode, type: def.type, errors: errorSummary.slice(0, 50) },
        request,
      });

      throw AppError.unprocessable(
        parsed.totalRows === 0
          ? `导入校验未通过：${def.label} 模板中没有可导入的数据行，整批已拒绝。`
          : `导入校验未通过：共 ${parsed.totalRows} 行，其中 ${errorRows} 行存在问题，整批已拒绝，未写入任何业务数据。`,
        {
          extra: {
            jobId,
            jobCode,
            type: def.type,
            label: def.label,
            totalRows: parsed.totalRows,
            // 通过校验的行数与 import_job.success_rows 保持一致；writtenRows 恒为 0（整批拒绝）
            successRows,
            errorRows,
            writtenRows: 0,
            errors: errorSummary,
          },
        },
      );
    }

    // ② 事务内整批写入业务表
    try {
      await withTransaction(async (conn) => {
        for (const op of parsed.ops) await op(conn);
      });
    } catch (error) {
      await execute(`UPDATE import_job SET status = 'failed', remark = ? WHERE id = ?`, [
        `写入失败：${(error as Error).message}`.slice(0, 255),
        jobId,
      ]);
      await writeAudit({
        user,
        module: 'datasource',
        action: 'import',
        targetType: 'import_job',
        targetId: jobId,
        detail: `导入写入失败：${def.label}，文件 ${file.name}。`,
        detailJson: { jobCode, type: def.type, error: (error as Error).message },
        request,
      });
      throw error;
    }

    await execute(
      `UPDATE import_job SET status = 'committed', committed_at = NOW() WHERE id = ?`,
      [jobId],
    );

    await writeAudit({
      user,
      module: 'datasource',
      action: 'import',
      targetType: 'import_job',
      targetId: jobId,
      detail: `导入成功：${def.label}，文件 ${file.name}，写入 ${parsed.totalRows} 行。`,
      detailJson: { jobCode, type: def.type, rows: parsed.totalRows },
      request,
    });

    const job = await query<RowDataPacket>(
      `SELECT id, code, group_key AS groupKey, file_name AS fileName, file_size_bytes AS fileSizeBytes,
              sheet_count AS sheetCount, total_rows AS totalRows, success_rows AS successRows,
              error_rows AS errorRows, status, imported_by AS importedBy,
              created_at AS createdAt, committed_at AS committedAt, remark
         FROM import_job WHERE id = ?`,
      [jobId],
    );

    return ok({
      accepted: true,
      jobId,
      jobCode,
      type: def.type,
      label: def.label,
      totalRows: parsed.totalRows,
      successRows: parsed.totalRows,
      errorRows: 0,
      writtenRows: parsed.totalRows,
      job: job[0] ?? null,
      errors: [],
    });
  },
);
