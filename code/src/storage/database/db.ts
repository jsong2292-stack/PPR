/**
 * 统一数据库客户端
 * MySQL 直连模式
 */

import * as dbClient from './mysql-client';

export interface DbResult<T = unknown> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

export interface DbQueryOptions {
  table: string;
  select?: string;
  filter?: { column: string; operator: string; value: unknown }[];
  order?: { column: string; ascending?: boolean };
  limit?: number;
  offset?: number;
  single?: boolean;
}

/**
 * 获取数据库客户端类型
 */
export function getDbType(): 'mysql' | 'none' {
  return 'mysql';
}

/**
 * 检查数据库是否可用
 */
export async function checkDatabaseConnection(): Promise<{
  available: boolean;
  type: string;
  error?: string;
}> {
  try {
    const ok = await dbClient.testConnection();
    return {
      available: ok,
      type: 'mysql',
      error: ok ? undefined : 'MySQL 连接失败',
    };
  } catch (error) {
    return {
      available: false,
      type: 'none',
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}

/** 根据过滤条件生成 WHERE 片段与参数 */
function buildWhere(
  filter: { column: string; operator: string; value: unknown }[]
): { sql: string; values: unknown[] } {
  const values: unknown[] = [];
  const conditions: string[] = [];

  for (const f of filter) {
    if (f.operator === 'eq') {
      values.push(f.value);
      conditions.push(`${f.column} = ?`);
    } else if (f.operator === 'neq') {
      values.push(f.value);
      conditions.push(`${f.column} != ?`);
    } else if (f.operator === 'in') {
      const list = f.value as unknown[];
      const placeholders = list.map(() => '?').join(', ');
      values.push(...list);
      conditions.push(`${f.column} IN (${placeholders})`);
    } else if (f.operator === 'like') {
      values.push(f.value);
      conditions.push(`${f.column} LIKE ?`);
    } else if (f.operator === 'gte') {
      values.push(f.value);
      conditions.push(`${f.column} >= ?`);
    } else if (f.operator === 'lte') {
      values.push(f.value);
      conditions.push(`${f.column} <= ?`);
    }
  }

  return { sql: conditions.join(' AND '), values };
}

/**
 * 通用查询方法
 */
async function dbQuery(options: DbQueryOptions): Promise<DbResult> {
  const { table, select = '*', filter = [], order, limit, offset, single } = options;

  let sql = `SELECT ${select} FROM ${table}`;
  const { sql: whereSql, values } = buildWhere(filter);
  if (whereSql) sql += ` WHERE ${whereSql}`;

  if (order) {
    sql += ` ORDER BY ${order.column} ${order.ascending === false ? 'DESC' : 'ASC'}`;
  }

  if (single) {
    sql += ' LIMIT 1';
  } else {
    if (limit) sql += ` LIMIT ${limit}`;
    if (offset) sql += ` OFFSET ${offset}`;
  }

  try {
    if (single) {
      const row = await dbClient.queryOne(sql, values);
      return { data: row, error: null };
    }
    const rows = await dbClient.queryAll(sql, values);
    return { data: rows, error: null };
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : '查询失败' },
    };
  }
}

/**
 * 通用插入方法
 *
 * MySQL 不支持 `RETURNING`，这里通过自增 insertId 重新回查新插入的记录。
 * 注意：仅适用于带 AUTO_INCREMENT 主键的表。
 */
async function dbInsert(
  table: string,
  data: Record<string, unknown> | Record<string, unknown>[]
): Promise<DbResult> {
  const dataArray = Array.isArray(data) ? data : [data];

  if (dataArray.length === 0) {
    return { data: null, error: { message: '没有数据需要插入' } };
  }

  const columns = Object.keys(dataArray[0]);
  const values: unknown[] = [];
  const rowsPlaceholders = dataArray
    .map((row) => `(${columns.map((col) => { values.push(row[col]); return '?'; }).join(', ')})`)
    .join(', ');

  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${rowsPlaceholders}`;

  try {
    const result = await dbClient.query(sql, values);
    const firstId = result.insertId;
    let inserted: Record<string, unknown>[] = [];

    if (firstId > 0) {
      const lastId = firstId + dataArray.length - 1;
      inserted = await dbClient.queryAll(
        `SELECT * FROM ${table} WHERE id BETWEEN ? AND ?`,
        [firstId, lastId]
      );
    }

    return { data: Array.isArray(data) ? inserted : (inserted[0] ?? null), error: null };
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : '插入失败' },
    };
  }
}

/**
 * 通用更新方法（回查更新后的记录）
 */
async function dbUpdate(
  table: string,
  data: Record<string, unknown>,
  filter: { column: string; operator: string; value: unknown }[]
): Promise<DbResult> {
  const setEntries = Object.entries(data);
  const setClauses = setEntries.map(([col]) => `${col} = ?`).join(', ');
  const setValues = setEntries.map(([, val]) => val);

  const { sql: whereSql, values: whereValues } = buildWhere(filter);

  const sql = `UPDATE ${table} SET ${setClauses}${whereSql ? ` WHERE ${whereSql}` : ''}`;

  try {
    await dbClient.query(sql, [...setValues, ...whereValues]);
    const rows = await dbClient.queryAll(
      `SELECT * FROM ${table}${whereSql ? ` WHERE ${whereSql}` : ''}`,
      whereValues
    );
    return { data: rows, error: null };
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : '更新失败' },
    };
  }
}

/**
 * 通用删除方法（先查出被删除的记录再删除）
 */
async function dbDelete(
  table: string,
  filter: { column: string; operator: string; value: unknown }[]
): Promise<DbResult> {
  const { sql: whereSql, values } = buildWhere(filter);

  try {
    const rows = await dbClient.queryAll(
      `SELECT * FROM ${table}${whereSql ? ` WHERE ${whereSql}` : ''}`,
      values
    );
    await dbClient.query(`DELETE FROM ${table}${whereSql ? ` WHERE ${whereSql}` : ''}`, values);
    return { data: rows, error: null };
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : '删除失败' },
    };
  }
}

/**
 * 创建数据库操作对象
 */
export function createDbClient() {
  return {
    type: 'mysql' as const,
    query: dbQuery,
    insert: dbInsert,
    update: dbUpdate,
    delete: dbDelete,
    raw: dbClient.query,
    queryOne: dbClient.queryOne,
    queryAll: dbClient.queryAll,
    transaction: dbClient.transaction,
  };
}

// 导出类型
export type DbClient = ReturnType<typeof createDbClient>;
