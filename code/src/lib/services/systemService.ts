/**
 * 系统管理服务：数据来源字典、用户与角色、操作日志。
 *
 * 对应「系统管理」下的三个页面（/system/data-sources、/system/users、/system/audit），
 * 三者的读写口径集中在这里，路由层只做参数校验与鉴权，页面层只做展示。
 *
 * 几条硬约束（这些是本系统与实际生产要求的差距所在）：
 *
 * 1) **只管理生产数据源**：data_source.is_simulated = 1 的行是联调期写入的模拟来源，
 *    它们不代表任何正式生产能力。本服务的列表、修改、删除一律带
 *    `is_simulated = 0` 条件；命中模拟行的请求按「不存在」处理（404），
 *    新建的数据源强制 is_simulated = 0。现场因此不会误把联调来源当成已接入系统。
 *
 * 2) **不返回任何密码材料**：用户列表与详情只返回 `password_hash IS NOT NULL` 的布尔标记
 *    （hasPassword），绝不 SELECT / 返回哈希，避免哈希出现在浏览器与日志里。
 *
 * 3) **重置密码 = 强制下线**：密码重置统一调用 auth/service.resetUserPassword，
 *    它会把 session_version + 1。会话令牌里带着签发时的 session_version
 *    （见 auth/session.ts），递增后该用户所有已签发的令牌立即失效 —— 这正是
 *    「重置后必须重新登录」的实现方式，不是提示文案层面的约定。
 *
 * 4) 数据源的删除前先做引用检查：批次 / 产品数据 / 设备采集 / 工艺记录 / 抽检记录 /
 *    数据一致性核对都引用 data_source.id。仍有引用时返回 409 并给出引用条数，
 *    引导使用者改为「停用」而不是物理删除，避免打断历史数据的来源链路。
 *
 * 所有写操作都写审计（module='system'），detail 记录「改前 → 改后」。
 */
import bcrypt from 'bcryptjs';
import { config } from '../config';
import { execute, query, queryOne, withTransaction, type PoolConnection, type RowDataPacket } from '../db';
import { AppError } from '../errors';
import { writeAudit } from '../audit';
import { resetUserPassword, validatePasswordStrength } from '../auth/service';

// ── 通用工具 ──────────────────────────────────────────────────────────

/** 解析 JSON 列（mysql2 对 JSON 既可能返回对象也可能返回字符串） */
function parseJsonSafe(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

/** 需要审计的写操作上下文 */
export interface MutationContext {
  userId: number;
  request?: Request;
}

function diffText(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const changes: string[] = [];
  for (const [key, value] of Object.entries(after)) {
    if (!sameValue(before[key], value)) {
      changes.push(`${key}：${formatValue(before[key])} → ${formatValue(value)}`);
    }
  }
  return changes;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  if (typeof a === 'boolean' || typeof b === 'boolean') return Boolean(a) === Boolean(b);
  return String(a) === String(b);
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '空';
  return String(value);
}

/** 文本字段归一：'' / 空白 → null */
function normalizeText(value: unknown, max: number, label: string): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > max) {
    throw AppError.validation('数据校验未通过。', { [label]: `长度不能超过 ${max} 个字符。` });
  }
  return text;
}

// =====================================================================
// 一、数据来源字典（data_source）
// =====================================================================

export const DATA_SOURCE_SYSTEM_TYPES: Array<{ value: string; label: string }> = [
  { value: 'manual', label: '人工录入' },
  { value: 'mes', label: 'MES 生产系统' },
  { value: 'qms', label: 'QMS 检验系统' },
  { value: 'device', label: '设备数采' },
  { value: 'other', label: '其它' },
];

const SYSTEM_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  DATA_SOURCE_SYSTEM_TYPES.map((item) => [item.value, item.label]),
);

/**
 * 引用 data_source.id 的表的统一计数表达式。
 * 删除前用它判断「还有多少条业务数据来自这个来源」。
 */
const DATA_SOURCE_REFERENCE_SQL: Array<{ label: string; sql: string; twoParams?: boolean }> = [
  { label: '生产批次', sql: 'SELECT COUNT(*) AS total FROM production_batch WHERE data_source_id = ?' },
  { label: '产品数据', sql: 'SELECT COUNT(*) AS total FROM product_data WHERE data_source_id = ?' },
  { label: '设备采集数据', sql: 'SELECT COUNT(*) AS total FROM equipment_reading WHERE data_source_id = ?' },
  { label: '工艺过程记录', sql: 'SELECT COUNT(*) AS total FROM process_record WHERE data_source_id = ?' },
  { label: '样管抽检记录', sql: 'SELECT COUNT(*) AS total FROM inspection_record WHERE data_source_id = ?' },
  {
    label: '数据一致性核对',
    sql: `SELECT COUNT(*) AS total FROM data_consistency_check
           WHERE primary_source_id = ? OR secondary_source_id = ?`,
    twoParams: true,
  },
];

const USAGE_COUNT_SQL = `(
    (SELECT COUNT(*) FROM production_batch t WHERE t.data_source_id = d.id)
  + (SELECT COUNT(*) FROM product_data t WHERE t.data_source_id = d.id)
  + (SELECT COUNT(*) FROM equipment_reading t WHERE t.data_source_id = d.id)
  + (SELECT COUNT(*) FROM process_record t WHERE t.data_source_id = d.id)
  + (SELECT COUNT(*) FROM inspection_record t WHERE t.data_source_id = d.id)
  + (SELECT COUNT(*) FROM data_consistency_check t
      WHERE t.primary_source_id = d.id OR t.secondary_source_id = d.id)
)`;

export interface DataSourceRow {
  id: number;
  code: string;
  name: string;
  systemType: string;
  systemTypeLabel: string;
  description: string | null;
  status: 'enabled' | 'disabled';
  sortNo: number;
  /** 引用该来源的业务数据条数（删除前判断依据） */
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface DataSourceDbRow extends RowDataPacket {
  id: number;
  code: string;
  name: string;
  system_type: string;
  description: string | null;
  status: string;
  sort_no: number;
  is_simulated: number;
  usageCount: number;
  created_at: string;
  updated_at: string;
}

function toDataSourceRow(row: DataSourceDbRow): DataSourceRow {
  return {
    id: Number(row.id),
    code: String(row.code),
    name: String(row.name),
    systemType: String(row.system_type),
    systemTypeLabel: SYSTEM_TYPE_LABELS[String(row.system_type)] ?? String(row.system_type),
    description: row.description === null ? null : String(row.description),
    status: String(row.status) as 'enabled' | 'disabled',
    sortNo: Number(row.sort_no),
    usageCount: Number(row.usageCount ?? 0),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

const SELECT_DATA_SOURCE = `SELECT d.id, d.code, d.name, d.system_type, d.description, d.status,
                                   d.sort_no, d.is_simulated, d.created_at, d.updated_at,
                                   ${USAGE_COUNT_SQL} AS usageCount
                              FROM data_source d`;

export interface DataSourceListQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: string;
  systemType?: string;
}

/** 数据来源列表：只返回真实来源（is_simulated = 0） */
export async function listDataSources(options: DataSourceListQuery) {
  const where: string[] = ['d.is_simulated = 0'];
  const params: unknown[] = [];

  if (options.keyword) {
    where.push('(d.code LIKE ? OR d.name LIKE ? OR d.description LIKE ?)');
    const like = `%${options.keyword}%`;
    params.push(like, like, like);
  }
  if (options.status) {
    where.push('d.status = ?');
    params.push(options.status);
  }
  if (options.systemType) {
    where.push('d.system_type = ?');
    params.push(options.systemType);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;

  const countRow = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS total FROM data_source d ${whereSql}`,
    params,
  );

  const rows = await query<DataSourceDbRow>(
    `${SELECT_DATA_SOURCE} ${whereSql} ORDER BY d.sort_no ASC, d.id ASC LIMIT ? OFFSET ?`,
    [...params, options.pageSize, (options.page - 1) * options.pageSize],
  );

  return {
    total: Number(countRow?.total ?? 0),
    page: options.page,
    pageSize: options.pageSize,
    rows: rows.map(toDataSourceRow),
    systemTypes: DATA_SOURCE_SYSTEM_TYPES,
  };
}

export interface DataSourceInput {
  code?: string;
  name?: string;
  systemType?: string;
  description?: string | null;
  status?: 'enabled' | 'disabled';
  sortNo?: number;
}

function buildDataSourceColumns(
  input: DataSourceInput,
  options: { requireCode: boolean },
): Record<string, unknown> {
  const values: Record<string, unknown> = {};

  if (input.code !== undefined || options.requireCode) {
    const code = normalizeText(input.code, 64, 'code');
    if (!code) {
      throw AppError.validation('数据校验未通过。', { code: '来源编码不能为空。' });
    }
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(code)) {
      throw AppError.validation('数据校验未通过。', {
        code: '来源编码只能包含字母、数字、下划线与短横线，且以字母开头。',
      });
    }
    values.code = code;
  }

  if (input.name !== undefined || options.requireCode) {
    const name = normalizeText(input.name, 64, 'name');
    if (!name) {
      throw AppError.validation('数据校验未通过。', { name: '来源名称不能为空。' });
    }
    values.name = name;
  }

  if (input.systemType !== undefined) {
    const type = String(input.systemType);
    if (!DATA_SOURCE_SYSTEM_TYPES.some((item) => item.value === type)) {
      throw AppError.validation('数据校验未通过。', {
        systemType: `系统类型只能是 ${DATA_SOURCE_SYSTEM_TYPES.map((item) => item.value).join(' / ')}。`,
      });
    }
    values.system_type = type;
  } else if (options.requireCode) {
    values.system_type = 'other';
  }

  if (input.description !== undefined) {
    values.description = normalizeText(input.description, 255, 'description');
  }

  if (input.status !== undefined) {
    if (!['enabled', 'disabled'].includes(String(input.status))) {
      throw AppError.validation('数据校验未通过。', { status: '状态只能是 enabled / disabled。' });
    }
    values.status = String(input.status);
  }

  if (input.sortNo !== undefined) {
    const sortNo = Number(input.sortNo);
    if (!Number.isInteger(sortNo) || sortNo < 0 || sortNo > 9999) {
      throw AppError.validation('数据校验未通过。', { sortNo: '排序号必须是 0–9999 的整数。' });
    }
    values.sort_no = sortNo;
  }

  return values;
}

/** 来源编码唯一性：同时提示是否与已有的模拟来源冲突 */
async function assertDataSourceCodeFree(code: string, excludeId: number | null): Promise<void> {
  const row = await queryOne<RowDataPacket & { id: number; is_simulated: number }>(
    'SELECT id, is_simulated FROM data_source WHERE code = ? LIMIT 1',
    [code],
  );
  if (!row) return;
  if (excludeId !== null && Number(row.id) === excludeId) return;
  throw AppError.validation('数据校验未通过。', {
    code:
      Number(row.is_simulated) === 1
        ? `来源编码「${code}」已被一条模拟来源占用（模拟来源不在本页维护，但编码全局唯一）。`
        : `来源编码「${code}」已存在。`,
  });
}

/** 新增数据来源（强制 is_simulated = 0） */
export async function createDataSource(
  input: DataSourceInput,
  context: MutationContext,
): Promise<DataSourceRow> {
  const values = buildDataSourceColumns(input, { requireCode: true });
  await assertDataSourceCodeFree(String(values.code), null);

  const columns = [...Object.keys(values), 'is_simulated'];
  const result = await execute(
    `INSERT INTO data_source (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    [...Object.values(values), 0],
  );
  const id = Number(result.insertId);

  await writeAudit({
    user: { userId: context.userId },
    module: 'system',
    action: 'create',
    targetType: 'data_source',
    targetId: id,
    detail: `新增数据来源：${values.name}（编码 ${values.code}，类型 ${
      SYSTEM_TYPE_LABELS[String(values.system_type)] ?? values.system_type
    }）`,
    detailJson: { ...values, is_simulated: 0 },
    request: context.request,
  });

  const created = await queryOne<DataSourceDbRow>(`${SELECT_DATA_SOURCE} WHERE d.id = ?`, [id]);
  if (!created) throw AppError.notFound('新增成功但未能读回数据来源。');
  return toDataSourceRow(created);
}

/** 修改数据来源；标记为模拟来源（is_simulated = 1）的记录不可修改 */
export async function updateDataSource(
  id: number,
  input: DataSourceInput,
  context: MutationContext,
): Promise<DataSourceRow> {
  const before = await queryOne<DataSourceDbRow>(`${SELECT_DATA_SOURCE} WHERE d.id = ?`, [id]);
  if (!before) throw AppError.notFound('数据来源不存在。');
  if (Number(before.is_simulated) === 1) {
    throw AppError.notFound('该数据来源被标记为模拟来源，不在系统管理中维护。');
  }

  const values = buildDataSourceColumns(input, { requireCode: false });
  if (!Object.keys(values).length) {
    throw AppError.badRequest('没有需要更新的字段。');
  }
  if (values.code !== undefined) {
    await assertDataSourceCodeFree(String(values.code), id);
  }

  const columns = Object.keys(values);
  await execute(
    `UPDATE data_source SET ${columns.map((column) => `${column} = ?`).join(', ')}, updated_at = NOW()
      WHERE id = ? AND is_simulated = 0`,
    [...columns.map((column) => values[column]), id],
  );

  const beforeRecord: Record<string, unknown> = {
    code: before.code,
    name: before.name,
    system_type: before.system_type,
    description: before.description,
    status: before.status,
    sort_no: Number(before.sort_no),
  };
  const changes = diffText(beforeRecord, values);

  await writeAudit({
    user: { userId: context.userId },
    module: 'system',
    action: 'update',
    targetType: 'data_source',
    targetId: id,
    detail: `修改数据来源 ${before.code}（${before.name}）：${
      changes.length ? changes.join('；') : '无字段变化'
    }`,
    detailJson: { before: beforeRecord, after: values },
    request: context.request,
  });

  const updated = await queryOne<DataSourceDbRow>(`${SELECT_DATA_SOURCE} WHERE d.id = ?`, [id]);
  if (!updated) throw AppError.notFound('修改成功但未能读回数据来源。');
  return toDataSourceRow(updated);
}

/** 删除数据来源：仍有业务数据引用时返回 409 并给出引用清单 */
export async function deleteDataSource(
  id: number,
  context: MutationContext,
): Promise<{ deleted: boolean }> {
  const before = await queryOne<RowDataPacket>(
    'SELECT id, code, name, is_simulated FROM data_source WHERE id = ?',
    [id],
  );
  if (!before || Number(before.is_simulated) === 1) {
    throw AppError.notFound('数据来源不存在，或已被标记为模拟来源（不在系统管理中维护）。');
  }

  const references: Array<{ label: string; count: number }> = [];
  for (const check of DATA_SOURCE_REFERENCE_SQL) {
    const params = check.twoParams ? [id, id] : [id];
    const row = await queryOne<RowDataPacket>(check.sql, params);
    const count = Number(row?.total ?? 0);
    if (count > 0) references.push({ label: check.label, count });
  }

  if (references.length) {
    const total = references.reduce((sum, item) => sum + item.count, 0);
    throw AppError.conflict(
      `无法删除数据来源「${before.name}」：仍有 ${total} 条业务数据引用它（${references
        .map((item) => `${item.label} ${item.count} 条`)
        .join('、')}）。请把这些数据的来源改到其它来源，或把该来源改为「停用」。`,
      { extra: { references, total } },
    );
  }

  await execute('DELETE FROM data_source WHERE id = ? AND is_simulated = 0', [id]);

  await writeAudit({
    user: { userId: context.userId },
    module: 'system',
    action: 'delete',
    targetType: 'data_source',
    targetId: id,
    detail: `删除数据来源：${before.code}（${before.name}）`,
    request: context.request,
  });

  return { deleted: true };
}

// =====================================================================
// 二、用户与角色（sys_user / sys_role / sys_user_role）
// =====================================================================

export interface RoleRow {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isBuiltin: boolean;
}

export interface UserRow {
  id: number;
  username: string;
  displayName: string;
  employeeNo: string | null;
  email: string | null;
  phone: string | null;
  department: string | null;
  status: 'active' | 'disabled';
  mustResetPassword: boolean;
  /** 是否已设置密码；绝不返回密码哈希本身 */
  hasPassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roles: RoleRow[];
}

interface UserDbRow extends RowDataPacket {
  id: number;
  username: string;
  display_name: string;
  employee_no: string | null;
  email: string | null;
  phone: string | null;
  department: string | null;
  status: string;
  must_reset_password: number;
  hasPassword: number;
  last_login_at: string | null;
  created_at: string;
  roleIds: string | null;
  roleCodes: string | null;
  roleNames: string | null;
}

const SELECT_USER = `SELECT u.id, u.username, u.display_name, u.employee_no, u.email, u.phone,
                            u.department, u.status, u.must_reset_password,
                            (u.password_hash IS NOT NULL) AS hasPassword,
                            u.last_login_at, u.created_at,
                            GROUP_CONCAT(r.id ORDER BY r.id) AS roleIds,
                            GROUP_CONCAT(r.code ORDER BY r.id) AS roleCodes,
                            GROUP_CONCAT(r.name ORDER BY r.id) AS roleNames
                       FROM sys_user u
                       LEFT JOIN sys_user_role ur ON ur.user_id = u.id
                       LEFT JOIN sys_role r ON r.id = ur.role_id`;

function splitConcat(value: string | null): string[] {
  if (!value) return [];
  return value.split(',');
}

function toUserRow(row: UserDbRow): UserRow {
  const ids = splitConcat(row.roleIds);
  const codes = splitConcat(row.roleCodes);
  const names = splitConcat(row.roleNames);
  return {
    id: Number(row.id),
    username: String(row.username),
    displayName: String(row.display_name),
    employeeNo: row.employee_no === null ? null : String(row.employee_no),
    email: row.email === null ? null : String(row.email),
    phone: row.phone === null ? null : String(row.phone),
    department: row.department === null ? null : String(row.department),
    status: String(row.status) as 'active' | 'disabled',
    mustResetPassword: Number(row.must_reset_password) === 1,
    hasPassword: Number(row.hasPassword) === 1,
    lastLoginAt: row.last_login_at === null ? null : String(row.last_login_at),
    createdAt: String(row.created_at ?? ''),
    roles: ids.map((id, index) => ({
      id: Number(id),
      code: codes[index] ?? '',
      name: names[index] ?? '',
      description: null,
      isBuiltin: false,
    })),
  };
}

/** 角色下拉：只列出启用中的角色（内置角色也不允许删除，这里只做展示） */
export async function listRoles(): Promise<RoleRow[]> {
  const rows = await query<RowDataPacket>(
    `SELECT id, code, name, description, is_builtin
       FROM sys_role WHERE status = 'enabled' ORDER BY id`,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    code: String(row.code),
    name: String(row.name),
    description: row.description === null ? null : String(row.description),
    isBuiltin: Number(row.is_builtin) === 1,
  }));
}

export interface UserListQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: string;
  roleId?: number;
}

/** 用户列表（含角色），不返回任何密码哈希 */
export async function listUsers(options: UserListQuery) {
  const where: string[] = [];
  const params: unknown[] = [];

  if (options.keyword) {
    where.push(
      '(u.username LIKE ? OR u.display_name LIKE ? OR u.employee_no LIKE ? OR u.email LIKE ? OR u.department LIKE ?)',
    );
    const like = `%${options.keyword}%`;
    params.push(like, like, like, like, like);
  }
  if (options.status) {
    where.push('u.status = ?');
    params.push(options.status);
  }
  if (options.roleId) {
    where.push('EXISTS (SELECT 1 FROM sys_user_role x WHERE x.user_id = u.id AND x.role_id = ?)');
    params.push(options.roleId);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countRow = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS total FROM sys_user u ${whereSql}`,
    params,
  );

  const rows = await query<UserDbRow>(
    `${SELECT_USER} ${whereSql} GROUP BY u.id ORDER BY u.id ASC LIMIT ? OFFSET ?`,
    [...params, options.pageSize, (options.page - 1) * options.pageSize],
  );

  return {
    total: Number(countRow?.total ?? 0),
    page: options.page,
    pageSize: options.pageSize,
    rows: rows.map(toUserRow),
  };
}

async function findUserRow(id: number): Promise<UserRow | null> {
  const row = await queryOne<UserDbRow>(`${SELECT_USER} WHERE u.id = ? GROUP BY u.id`, [id]);
  return row ? toUserRow(row) : null;
}

/** 角色的存在性校验：传了不存在的角色一律 422，而不是静默忽略 */
async function resolveRoleIds(roleIds: number[]): Promise<number[]> {
  const unique = [...new Set(roleIds)];
  if (!unique.length) return [];
  const placeholders = unique.map(() => '?').join(',');
  const rows = await query<RowDataPacket>(
    `SELECT id FROM sys_role WHERE status = 'enabled' AND id IN (${placeholders})`,
    unique,
  );
  const found = new Set(rows.map((row) => Number(row.id)));
  const missing = unique.filter((id) => !found.has(id));
  if (missing.length) {
    throw AppError.validation('数据校验未通过。', {
      roleIds: `角色不存在或已停用：${missing.join('、')}。`,
    });
  }
  return unique;
}

async function assertUsernameFree(username: string, excludeId: number | null): Promise<void> {
  const row = await queryOne<RowDataPacket>('SELECT id FROM sys_user WHERE username = ? LIMIT 1', [
    username,
  ]);
  if (!row) return;
  if (excludeId !== null && Number(row.id) === excludeId) return;
  throw AppError.validation('数据校验未通过。', { username: `登录名「${username}」已存在。` });
}

async function assertEmployeeNoFree(employeeNo: string | null, excludeId: number | null): Promise<void> {
  if (!employeeNo) return;
  const row = await queryOne<RowDataPacket>(
    'SELECT id FROM sys_user WHERE employee_no = ? LIMIT 1',
    [employeeNo],
  );
  if (!row) return;
  if (excludeId !== null && Number(row.id) === excludeId) return;
  throw AppError.validation('数据校验未通过。', { employeeNo: `工号「${employeeNo}」已被占用。` });
}

async function replaceUserRoles(
  connection: PoolConnection,
  userId: number,
  roleIds: number[],
): Promise<void> {
  await connection.execute('DELETE FROM sys_user_role WHERE user_id = ?', [userId]);
  for (const roleId of roleIds) {
    await connection.execute('INSERT INTO sys_user_role (user_id, role_id) VALUES (?, ?)', [
      userId,
      roleId,
    ]);
  }
}

export interface UserInput {
  username?: string;
  displayName?: string;
  employeeNo?: string | null;
  email?: string | null;
  phone?: string | null;
  department?: string | null;
  status?: 'active' | 'disabled';
  roleIds?: number[];
  /**
   * 初始密码 / 重置密码。传了就重置：密码哈希写入 password_hash，
   * must_reset_password = 1，且 session_version + 1（该用户所有会话立即失效）。
   */
  newPassword?: string | null;
}

function validateEmailFormat(email: string | null): void {
  if (!email) return;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw AppError.validation('数据校验未通过。', { email: '邮箱格式不正确。' });
  }
}

/** 新建用户（可同时分配角色与设置初始密码） */
export async function createUser(
  input: UserInput,
  context: MutationContext,
): Promise<{ user: UserRow; passwordConfigured: boolean }> {
  const username = normalizeText(input.username, 64, 'username');
  const displayName = normalizeText(input.displayName, 64, 'displayName');
  if (!username) throw AppError.validation('数据校验未通过。', { username: '登录名不能为空。' });
  if (!/^[a-zA-Z][a-zA-Z0-9._-]{2,63}$/.test(username)) {
    throw AppError.validation('数据校验未通过。', {
      username: '登录名需以字母开头，由字母、数字、点、下划线、短横线组成，长度 3–64。',
    });
  }
  if (!displayName) throw AppError.validation('数据校验未通过。', { displayName: '姓名不能为空。' });

  const employeeNo = normalizeText(input.employeeNo, 32, 'employeeNo');
  const email = normalizeText(input.email, 128, 'email');
  const phone = normalizeText(input.phone, 32, 'phone');
  const department = normalizeText(input.department, 64, 'department');
  validateEmailFormat(email);

  await assertUsernameFree(username, null);
  await assertEmployeeNoFree(employeeNo, null);

  const status = input.status === 'disabled' ? 'disabled' : 'active';
  if (input.status !== undefined && !['active', 'disabled'].includes(String(input.status))) {
    throw AppError.validation('数据校验未通过。', { status: '账号状态只能是 active / disabled。' });
  }

  const roleIds = await resolveRoleIds(input.roleIds ?? []);

  let passwordHash: string | null = null;
  if (input.newPassword) {
    const problem = validatePasswordStrength(input.newPassword);
    if (problem) throw AppError.validation('数据校验未通过。', { newPassword: problem });
    passwordHash = await bcrypt.hash(input.newPassword, config.auth.bcryptRounds);
  }

  const userId = await withTransaction(async (connection) => {
    const [result] = await connection.execute(
      `INSERT INTO sys_user
         (username, password_hash, must_reset_password, display_name, employee_no, email, phone, department, status)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)`,
      [username, passwordHash, displayName, employeeNo, email, phone, department, status],
    );
    const newId = Number((result as { insertId: number }).insertId);
    await replaceUserRoles(connection, newId, roleIds);
    return newId;
  });

  await writeAudit({
    user: { userId: context.userId },
    module: 'system',
    action: 'create',
    targetType: 'sys_user',
    targetId: userId,
    detail:
      `新增用户 ${username}（${displayName}），角色 ${roleIds.length} 个` +
      (passwordHash ? '，已设置初始密码（首次登录必须修改）' : '，未设置密码（需管理员重置后才能登录）'),
    detailJson: { username, displayName, employeeNo, email, phone, department, status, roleIds },
    request: context.request,
  });

  const created = await findUserRow(userId);
  if (!created) throw AppError.notFound('新增成功但未能读回用户。');
  return { user: created, passwordConfigured: Boolean(passwordHash) };
}

/**
 * 修改用户（字段 + 角色 + 可选重置密码）。
 *
 * 安全护栏：
 *   - 不允许停用当前登录账号（否则会把自己锁在系统外）
 *   - 不允许通过本接口重置自己的密码（应走「修改密码」页，需验证原密码）
 */
export async function updateUser(
  id: number,
  input: UserInput,
  context: MutationContext,
): Promise<{ user: UserRow; rolesChanged: boolean; passwordReset: boolean }> {
  const before = await findUserRow(id);
  if (!before) throw AppError.notFound('用户不存在。');

  if (input.status === 'disabled' && id === context.userId) {
    throw AppError.conflict('不能停用当前登录的账号。如需停用请由其他管理员操作。');
  }
  if (input.newPassword && id === context.userId) {
    throw AppError.badRequest('不能在用户管理中重置自己的密码，请使用「修改密码」功能（需验证原密码）。');
  }

  const values: Record<string, unknown> = {};

  if (input.username !== undefined) {
    const username = normalizeText(input.username, 64, 'username');
    if (!username) throw AppError.validation('数据校验未通过。', { username: '登录名不能为空。' });
    if (!/^[a-zA-Z][a-zA-Z0-9._-]{2,63}$/.test(username)) {
      throw AppError.validation('数据校验未通过。', {
        username: '登录名需以字母开头，由字母、数字、点、下划线、短横线组成，长度 3–64。',
      });
    }
    if (!sameValue(before.username, username)) {
      await assertUsernameFree(username, id);
      values.username = username;
    }
  }

  if (input.displayName !== undefined) {
    const displayName = normalizeText(input.displayName, 64, 'displayName');
    if (!displayName) throw AppError.validation('数据校验未通过。', { displayName: '姓名不能为空。' });
    values.display_name = displayName;
  }

  if (input.employeeNo !== undefined) {
    const employeeNo = normalizeText(input.employeeNo, 32, 'employeeNo');
    if (!sameValue(before.employeeNo, employeeNo)) await assertEmployeeNoFree(employeeNo, id);
    values.employee_no = employeeNo;
  }

  if (input.email !== undefined) {
    const email = normalizeText(input.email, 128, 'email');
    validateEmailFormat(email);
    values.email = email;
  }

  if (input.phone !== undefined) {
    values.phone = normalizeText(input.phone, 32, 'phone');
  }

  if (input.department !== undefined) {
    values.department = normalizeText(input.department, 64, 'department');
  }

  if (input.status !== undefined) {
    if (!['active', 'disabled'].includes(String(input.status))) {
      throw AppError.validation('数据校验未通过。', { status: '账号状态只能是 active / disabled。' });
    }
    values.status = String(input.status);
  }

  const roleIds = input.roleIds === undefined ? null : await resolveRoleIds(input.roleIds);
  const columns = Object.keys(values);

  if (!columns.length && roleIds === null && !input.newPassword) {
    throw AppError.badRequest('没有需要更新的字段（提交值与当前值相同）。');
  }

  const rolesChanged =
    roleIds !== null &&
    (roleIds.length !== before.roles.length ||
      roleIds.some((roleId) => !before.roles.some((role) => role.id === roleId)));

  if (columns.length || rolesChanged) {
    await withTransaction(async (connection) => {
      if (columns.length) {
        await connection.execute(
          `UPDATE sys_user SET ${columns.map((column) => `${column} = ?`).join(', ')}, updated_at = NOW()
            WHERE id = ?`,
          [...columns.map((column) => values[column]), id],
        );
      }
      if (rolesChanged && roleIds) {
        await replaceUserRoles(connection, id, roleIds);
      }
    });
  }

  // 密码重置走 auth 服务：它负责 bcrypt 哈希、must_reset_password=1 与 session_version+1
  let passwordReset = false;
  if (input.newPassword) {
    const problem = validatePasswordStrength(input.newPassword);
    if (problem) throw AppError.validation('数据校验未通过。', { newPassword: problem });
    await resetUserPassword({
      operatorId: context.userId,
      targetUserId: id,
      newPassword: input.newPassword,
      request: context.request,
    });
    passwordReset = true;
  }

  const beforeRecord: Record<string, unknown> = {
    username: before.username,
    display_name: before.displayName,
    employee_no: before.employeeNo,
    email: before.email,
    phone: before.phone,
    department: before.department,
    status: before.status,
  };
  const changes = diffText(beforeRecord, values);
  if (rolesChanged && roleIds) {
    changes.push(
      `角色：${before.roles.map((role) => role.code).join('、') || '无'} → ${
        roleIds.length ? `已重新分配 ${roleIds.length} 个角色` : '无'
      }`,
    );
  }
  if (passwordReset) {
    changes.push('重置登录密码：该用户所有登录会话已失效，下次登录必须修改密码');
  }

  await writeAudit({
    user: { userId: context.userId },
    module: 'system',
    action: 'update',
    targetType: 'sys_user',
    targetId: id,
    detail: `修改用户 ${before.username}（${before.displayName}）：${
      changes.length ? changes.join('；') : '无字段变化'
    }`,
    detailJson: { before: beforeRecord, after: values, roleIds, passwordReset },
    request: context.request,
  });

  const updated = await findUserRow(id);
  if (!updated) throw AppError.notFound('修改成功但未能读回用户。');
  return { user: updated, rolesChanged, passwordReset };
}

// =====================================================================
// 三、操作日志（operation_log，只读）
// =====================================================================

export const AUDIT_MODULE_LABELS: Record<string, string> = {
  auth: '登录认证',
  masterdata: '基础主数据',
  datasource: '数据源',
  quality_monitor: '质量监控',
  diagnosis: '异常诊断',
  eight_d: '8D 报告',
  archive: '分析归档',
  notification: '预警通知',
  system: '系统管理',
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  login: '登录',
  login_failed: '登录失败',
  logout: '退出登录',
  password_change: '修改密码',
  create: '新增',
  update: '修改',
  delete: '删除',
  import: '导入',
  export: '导出',
  rule_scan: '规则扫描',
  ai_generate: '生成分析',
  engineer_decision: '工程师判定',
  archive: '归档',
  notify: '发送通知',
  report_save: '保存报告',
  report_finalize: '报告定稿',
  handle_event: '处置事件',
};

export interface AuditRow {
  id: number;
  createdAt: string;
  module: string;
  moduleLabel: string;
  actionType: string;
  actionLabel: string;
  targetType: string | null;
  targetId: string | null;
  detail: string | null;
  detailJson: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  userName: string | null;
  username: string | null;
}

export interface AuditListQuery {
  page: number;
  pageSize: number;
  module?: string;
  actionType?: string;
  keyword?: string;
  /** YYYY-MM-DD（含当天 00:00:00） */
  from?: string;
  /** YYYY-MM-DD（含当天 23:59:59） */
  to?: string;
}

const SELECT_AUDIT = `SELECT l.id, l.created_at, l.module, l.action_type, l.target_type, l.target_id,
                             l.detail, l.detail_json, l.ip_address, l.user_agent,
                             u.display_name AS userName, u.username
                        FROM operation_log l
                        LEFT JOIN sys_user u ON u.id = l.user_id`;

/** 审计日志列表（只读） */
export async function listOperationLogs(options: AuditListQuery) {
  const where: string[] = [];
  const params: unknown[] = [];

  if (options.module) {
    where.push('l.module = ?');
    params.push(options.module);
  }
  if (options.actionType) {
    where.push('l.action_type = ?');
    params.push(options.actionType);
  }
  if (options.from) {
    where.push('l.created_at >= ?');
    params.push(`${options.from} 00:00:00`);
  }
  if (options.to) {
    where.push('l.created_at <= ?');
    params.push(`${options.to} 23:59:59`);
  }
  if (options.keyword) {
    where.push(
      '(l.detail LIKE ? OR l.target_type LIKE ? OR l.target_id LIKE ? OR l.module LIKE ? OR l.action_type LIKE ? OR u.display_name LIKE ? OR u.username LIKE ?)',
    );
    const like = `%${options.keyword}%`;
    params.push(like, like, like, like, like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countRow = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS total FROM operation_log l LEFT JOIN sys_user u ON u.id = l.user_id ${whereSql}`,
    params,
  );

  const rows = await query<RowDataPacket>(
    `${SELECT_AUDIT} ${whereSql} ORDER BY l.created_at DESC, l.id DESC LIMIT ? OFFSET ?`,
    [...params, options.pageSize, (options.page - 1) * options.pageSize],
  );

  return {
    total: Number(countRow?.total ?? 0),
    page: options.page,
    pageSize: options.pageSize,
    rows: rows.map((row) => {
      const module = String(row.module ?? '');
      const actionType = String(row.action_type ?? '');
      return {
        id: Number(row.id),
        createdAt: String(row.created_at ?? ''),
        module,
        moduleLabel: AUDIT_MODULE_LABELS[module] ?? module,
        actionType,
        actionLabel: AUDIT_ACTION_LABELS[actionType] ?? actionType,
        targetType: row.target_type === null ? null : String(row.target_type),
        targetId: row.target_id === null ? null : String(row.target_id),
        detail: row.detail === null ? null : String(row.detail),
        detailJson: parseJsonSafe(row.detail_json),
        ipAddress: row.ip_address === null ? null : String(row.ip_address),
        userAgent: row.user_agent === null ? null : String(row.user_agent),
        userName: row.userName === null ? null : String(row.userName),
        username: row.username === null ? null : String(row.username),
      } satisfies AuditRow;
    }),
  };
}

/** 过滤下拉的候选项（模块 / 动作），取自实际日志而不是硬编码 */
export async function listAuditFacets(): Promise<{
  modules: Array<{ value: string; label: string }>;
  actions: Array<{ value: string; label: string }>;
}> {
  const moduleRows = await query<RowDataPacket>(
    'SELECT DISTINCT module FROM operation_log ORDER BY module',
  );
  const actionRows = await query<RowDataPacket>(
    'SELECT DISTINCT action_type FROM operation_log ORDER BY action_type',
  );
  const modules = moduleRows.map((row) => {
    const value = String(row.module);
    return { value, label: AUDIT_MODULE_LABELS[value] ?? value };
  });
  const actions = actionRows.map((row) => {
    const value = String(row.action_type);
    return { value, label: AUDIT_ACTION_LABELS[value] ?? value };
  });
  return { modules, actions };
}
