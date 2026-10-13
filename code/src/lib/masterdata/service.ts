/**
 * 主数据通用服务。
 *
 * 六类主数据的增删改查都走这里，差异由 `MasterResource` 配置驱动。
 * 统一处理了正式系统必须有的几件事：
 *   1) 唯一性检查（并给出「哪一列重复」的字段级错误）
 *   2) 软删除 + 删除前引用检查（避免打断历史批次、抽检与归档的引用链）
 *   3) 审计日志（新增/修改/删除都留痕，记录变更前后差异）
 *   4) 编码自动生成（留空时按前缀 + 序号生成）
 *
 * 注意：删除采用软删除（is_deleted = 1）。若资源确实存在引用，
 * 则拒绝删除并返回引用明细，由使用者先把引用处理掉。
 */
import { execute, query, queryOne, type RowDataPacket } from '../db';
import { AppError } from '../errors';
import { writeAudit } from '../audit';
import { findMasterResource, type MasterField, type MasterResource } from './resources';
import type { PageResult } from '../types';

export interface MasterListQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: string;
}

export interface MasterRow extends Record<string, unknown> {
  id: number;
}

function softDeleteFilter(resource: MasterResource, alias: string): string {
  if (!resource.softDelete) return '';
  return `${alias}.is_deleted = 0`;
}

/**
 * listSql 的主表别名。
 * 取 FROM 后紧跟的「表名 别名」中的别名；没有别名时用表名。
 */
function aliasOf(resource: MasterResource): string {
  // 必须取「最外层」的 FROM：列清单里的统计子查询也含 FROM，
  // 取第一个匹配会错拿子查询的别名（曾经把 product_category 认成 s）。
  const matches = [...resource.listSql.matchAll(/\bFROM\s+([a-z_][a-z0-9_]*)\s+([a-z][a-z0-9_]*)\b/gi)];
  return matches.at(-1)?.[2] ?? resource.table;
}

/**
 * 排序片段。
 *
 * 所有列表查询都把 listSql 包成子查询（这样才能安全地拼接软删除与搜索条件），
 * 子查询的列名是配置里的 camelCase 别名，因此排序要去掉表前缀，
 * 否则会出现「Unknown column 'm.sort_no' in 'order clause'」。
 */
function orderFor(resource: MasterResource): string {
  return resource.defaultOrder
    .split(',')
    .map((part) => part.replace(/^\s*[a-z][a-z0-9_]*\./i, '').trim())
    .join(', ');
}

/** 列表查询（关键字搜索 + 分页） */
export async function listMasterRows(
  resourceKey: string,
  options: MasterListQuery,
): Promise<PageResult<MasterRow>> {
  const resource = requireResource(resourceKey);

  const where: string[] = [];
  const params: unknown[] = [];

  // 软删除过滤必须用 listSql 里的主表别名，否则子查询包一层后会找不到列
  if (resource.softDelete) where.push(softDeleteFilter(resource, aliasOf(resource)));

  if (options.keyword) {
    const like = `%${options.keyword}%`;
    where.push(`(${resource.searchColumns.map((column) => `${column} LIKE ?`).join(' OR ')})`);
    for (const _ of resource.searchColumns) params.push(like);
  }
  if (options.status && resourceHasColumn(resource, 'status')) {
    where.push(`${aliasOf(resource)}.status = ?`);
    params.push(options.status);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const fromSql = resource.listSql;

  const countRow = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS total FROM (${fromSql} ${whereSql}) AS t`,
    params,
  );

  const rows = await query<RowDataPacket>(
    `${fromSql} ${whereSql} ORDER BY ${orderFor(resource)} LIMIT ? OFFSET ?`,
    [...params, options.pageSize, (options.page - 1) * options.pageSize],
  );

  return {
    rows: rows as MasterRow[],
    total: Number(countRow?.total ?? 0),
    page: options.page,
    pageSize: options.pageSize,
  };
}

/** 单条详情 */
export async function findMasterRow(
  resourceKey: string,
  id: number,
): Promise<MasterRow | null> {
  const resource = requireResource(resourceKey);
  const row = await queryOne<RowDataPacket>(
    `${resource.listSql} WHERE ${aliasOf(resource)}.id = ?`,
    [id],
  );
  return (row as MasterRow) ?? null;
}

/** 下拉选项（引用型字段用） */
export async function listMasterOptions(
  resourceKey: string,
): Promise<Array<{ value: number; label: string; hint?: string }>> {
  const resource = requireResource(resourceKey);
  const alias = aliasOf(resource);
  const soft = resource.softDelete ? `${alias}.is_deleted = 0` : '1=1';

  // listSql 里主表已带别名，直接包一层子查询即可复用（排序也在子查询里完成）
  const rows = await query<RowDataPacket>(
    `SELECT * FROM (${resource.listSql} WHERE ${soft}) AS sub ORDER BY ${orderFor(resource)} LIMIT 1000`,
  );

  return rows.map((row) => ({
    value: Number(row.id),
    label: labelFor(resource, row),
  }));
}

function labelFor(resource: MasterResource, row: RowDataPacket): string {
  const parts: string[] = [];
  for (const key of ['name', 'specName', 'metricName', 'code']) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      parts.push(String(value));
      if (parts.length >= 2) break;
    }
  }
  return parts.join(' · ') || String(row.id);
}

function requireResource(key: string): MasterResource {
  const resource = findMasterResource(key);
  if (!resource) throw AppError.notFound(`未知的主数据资源：${key}`);
  return resource;
}

function resourceHasColumn(resource: MasterResource, column: string): boolean {
  return resource.fields.some((field) => field.key === column);
}

/** 数据库列名转换：camelCase → snake_case（用于限定唯一性检查） */
function toSnakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}

/** 需要写库的字段（排除只读与引用展示字段） */
function writableFields(resource: MasterResource): MasterField[] {
  return resource.fields.filter((field) => field.type !== 'readonly');
}

/**
 * 校验并转换入参。
 * 返回可以直接绑定到 SQL 的值（字段按数据库列名）。
 */
export function buildColumnValues(
  resource: MasterResource,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of writableFields(resource)) {
    if (!(field.key in input)) continue;
    const raw = input[field.key];
    if (field.type === 'number') {
      values[toSnakeCase(field.key)] = raw === null || raw === '' ? null : Number(raw);
    } else if (field.type === 'boolean') {
      values[toSnakeCase(field.key)] = raw ? 1 : 0;
    } else {
      values[toSnakeCase(field.key)] = raw === '' ? null : raw;
    }
  }
  return values;
}

/**
 * 唯一性检查。
 * 返回字段级错误；无冲突返回 {}。
 */
async function checkUnique(
  resource: MasterResource,
  values: Record<string, unknown>,
  excludeId: number | null,
): Promise<Record<string, string>> {
  const errors: Record<string, string> = {};

  if (resource.codeColumn !== 'id') {
    const code = values[resource.codeColumn];
    if (code !== undefined && code !== null) {
      const row = await queryOne<RowDataPacket>(
        `SELECT id FROM ${resource.table} WHERE ${resource.codeColumn} = ? ${
          excludeId ? 'AND id <> ?' : ''
        } LIMIT 1`,
        excludeId ? [code, excludeId] : [code],
      );
      if (row) {
        const field = resource.fields.find((item) => item.key === resource.codeColumn);
        errors[resource.codeColumn] = `${field?.label ?? '编码'}「${code}」已存在。`;
      }
    }
  }

  // 复合唯一（如规格限值的 规格 + 指标）
  if (resource.uniqueColumns.length > 1) {
    const conditions: string[] = [];
    const params: unknown[] = [];
    for (const unique of resource.uniqueColumns) {
      const value = values[unique.column];
      if (value === undefined || value === null) continue;
      conditions.push(`${unique.column} = ?`);
      params.push(value);
    }
    if (conditions.length === resource.uniqueColumns.length) {
      const row = await queryOne<RowDataPacket>(
        `SELECT id FROM ${resource.table} WHERE ${conditions.join(' AND ')} ${
          excludeId ? 'AND id <> ?' : ''
        } LIMIT 1`,
        excludeId ? [...params, excludeId] : params,
      );
      if (row) {
        errors._ = `${resource.uniqueColumns.map((item) => item.label).join(' + ')}的组合已存在，请勿重复配置。`;
      }
    }
  }

  return errors;
}

/** 编码自动生成 */
async function generateCode(resource: MasterResource): Promise<string | null> {
  if (!resource.codePrefix || resource.codeColumn === 'id') return null;
  const row = await queryOne<RowDataPacket>(
    `SELECT ${resource.codeColumn} AS code FROM ${resource.table}
      WHERE ${resource.codeColumn} LIKE ?
      ORDER BY ${resource.codeColumn} DESC LIMIT 1`,
    [`${resource.codePrefix}-%`],
  );
  const prefix = `${resource.codePrefix}-`;
  const last = row?.code ? Number(String(row.code).slice(prefix.length)) : 0;
  const next = (Number.isFinite(last) ? last : 0) + 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

export interface MasterMutationContext {
  userId: number;
  request?: Request;
}

/** 新增 */
export async function createMasterRow(
  resourceKey: string,
  input: Record<string, unknown>,
  context: MasterMutationContext,
): Promise<MasterRow> {
  const resource = requireResource(resourceKey);
  const values = buildColumnValues(resource, input);

  const codeColumn = resource.codeColumn;
  if (codeColumn !== 'id' && (values[codeColumn] === undefined || values[codeColumn] === null)) {
    const generated = await generateCode(resource);
    if (!generated) throw AppError.validation('无法自动生成编码，请手动填写。', { [codeColumn]: '请填写编码' });
    values[codeColumn] = generated;
  }

  const uniqueErrors = await checkUnique(resource, values, null);
  if (Object.keys(uniqueErrors).length) {
    throw AppError.validation('数据校验未通过。', uniqueErrors);
  }

  if (resource.table === 'metric_spec_limit') {
    const lower = Number(values.lower_limit);
    const upper = Number(values.upper_limit);
    if (Number.isFinite(lower) && Number.isFinite(upper) && lower > upper) {
      throw AppError.validation('数据校验未通过。', { lowerLimit: '下限不能大于上限。' });
    }
  }

  const columns = Object.keys(values);
  const placeholders = columns.map(() => '?').join(', ');
  const insertColumns = resource.hasCreatedBy === false ? columns : [...columns, 'created_by'];
  const insertValues = columns.map((column) => values[column]);
  if (resource.hasCreatedBy !== false) insertValues.push(context.userId);

  const result = await execute(
    `INSERT INTO ${resource.table} (${insertColumns.join(', ')})
     VALUES (${columns.map(() => '?').join(', ')}${resource.hasCreatedBy === false ? '' : ', ?'})`,
    insertValues,
  );

  await writeAudit({
    user: { userId: context.userId },
    module: 'masterdata',
    action: 'create',
    targetType: resource.table,
    targetId: result.insertId,
    detail: `新增${resource.singular}：${describe(resource, values)}`,
    detailJson: values,
    request: context.request,
  });

  const created = await findMasterRow(resourceKey, Number(result.insertId));
  if (!created) throw AppError.notFound('新增成功但未能读回记录。');
  return created;
}

/** 修改 */
export async function updateMasterRow(
  resourceKey: string,
  id: number,
  input: Record<string, unknown>,
  context: MasterMutationContext,
): Promise<MasterRow> {
  const resource = requireResource(resourceKey);
  const before = await findMasterRowRaw(resource, id);
  if (!before) throw AppError.notFound(`${resource.singular}不存在或已删除。`);

  const values = buildColumnValues(resource, input);
  if (!Object.keys(values).length) {
    throw AppError.badRequest('没有需要更新的字段。');
  }

  const uniqueErrors = await checkUnique(resource, values, id);
  if (Object.keys(uniqueErrors).length) {
    throw AppError.validation('数据校验未通过。', uniqueErrors);
  }

  if (resource.table === 'metric_spec_limit') {
    const lower = Number(values.lower_limit ?? before.lower_limit);
    const upper = Number(values.upper_limit ?? before.upper_limit);
    if (Number.isFinite(lower) && Number.isFinite(upper) && lower > upper) {
      throw AppError.validation('数据校验未通过。', { lowerLimit: '下限不能大于上限。' });
    }
  }

  const columns = Object.keys(values);
  await execute(
    `UPDATE ${resource.table} SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`,
    [...columns.map((column) => values[column]), id],
  );

  const changed = diffFields(before, values);
  await writeAudit({
    user: { userId: context.userId },
    module: 'masterdata',
    action: 'update',
    targetType: resource.table,
    targetId: id,
    detail: `修改${resource.singular}：${changed.length ? changed.join('；') : '无字段变化'}`,
    detailJson: { before: pick(before, Object.keys(values)), after: values },
    request: context.request,
  });

  const updated = await findMasterRow(resourceKey, id);
  if (!updated) throw AppError.notFound('修改成功但未能读回记录。');
  return updated;
}

/** 删除（软删除优先；有引用时拒绝） */
export async function deleteMasterRow(
  resourceKey: string,
  id: number,
  context: MasterMutationContext,
): Promise<{ deleted: boolean; soft: boolean }> {
  const resource = requireResource(resourceKey);
  const before = await findMasterRowRaw(resource, id);
  if (!before) throw AppError.notFound(`${resource.singular}不存在。`);

  // 引用检查
  for (const check of resource.referenceCheck ?? []) {
    const row = await queryOne<RowDataPacket>(check.sql, [id]);
    const total = Number(row?.total ?? 0);
    if (total > 0) {
      throw AppError.conflict(
        `无法删除：仍有 ${total} 条${check.label}引用该${resource.singular}。` +
          `请先处理引用数据，或把状态改为「停用」。`,
        { extra: { reference: check.label, count: total } },
      );
    }
  }

  if (resource.softDelete) {
    await execute(
      `UPDATE ${resource.table} SET is_deleted = 1, status = 'disabled' WHERE id = ?`,
      [id],
    );
  } else {
    await execute(`DELETE FROM ${resource.table} WHERE id = ?`, [id]);
  }

  await writeAudit({
    user: { userId: context.userId },
    module: 'masterdata',
    action: 'delete',
    targetType: resource.table,
    targetId: id,
    detail: `${resource.softDelete ? '停用并删除' : '删除'}${resource.singular}：${describe(
      resource,
      before as Record<string, unknown>,
    )}`,
    request: context.request,
  });

  return { deleted: true, soft: resource.softDelete };
}

async function findMasterRowRaw(
  resource: MasterResource,
  id: number,
): Promise<Record<string, unknown> | null> {
  const row = await queryOne<RowDataPacket>(`SELECT * FROM ${resource.table} WHERE id = ?`, [id]);
  return row ? (row as Record<string, unknown>) : null;
}

function describe(resource: MasterResource, values: Record<string, unknown>): string {
  const name = values.name ?? values[resource.codeColumn] ?? values.id;
  return String(name ?? '');
}

function pick(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) result[key] = source[key] ?? null;
  return result;
}

function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  const changes: string[] = [];
  for (const [key, value] of Object.entries(after)) {
    const previous = before[key];
    const same =
      (previous === null || previous === undefined) && (value === null || value === undefined)
        ? true
        : String(previous) === String(value);
    if (!same) changes.push(`${key}：${previous ?? '空'} → ${value ?? '空'}`);
  }
  return changes;
}
