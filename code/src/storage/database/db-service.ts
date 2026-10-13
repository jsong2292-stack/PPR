/**
 * 统一数据库服务
 * MySQL 直连模式（占位符统一使用 `?`）
 */

import { queryOne as dbQueryOne, queryAll as dbQueryAll } from './mysql-client';

/**
 * 查询单条记录
 */
export async function queryOne<T extends Record<string, unknown> = Record<string, unknown>>(
  table: string,
  options: {
    select?: string;
    where?: Record<string, unknown>;
    orderBy?: string;
  } = {}
): Promise<T | null> {
  const { select = '*', where, orderBy } = options;

  let sql = `SELECT ${select} FROM ${table}`;
  const values: unknown[] = [];

  if (where && Object.keys(where).length > 0) {
    const conditions = Object.keys(where).map((key) => {
      values.push(where[key]);
      return `${key} = ?`;
    });
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  if (orderBy) {
    sql += ` ORDER BY ${orderBy}`;
  }

  sql += ' LIMIT 1';

  return dbQueryOne<T>(sql, values);
}

/**
 * 查询多条记录
 */
export async function queryAll<T extends Record<string, unknown> = Record<string, unknown>>(
  table: string,
  options: {
    select?: string;
    where?: Record<string, unknown>;
    orderBy?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<T[]> {
  const { select = '*', where, orderBy, limit, offset } = options;

  let sql = `SELECT ${select} FROM ${table}`;
  const values: unknown[] = [];

  if (where && Object.keys(where).length > 0) {
    const conditions = Object.keys(where).map((key) => {
      values.push(where[key]);
      return `${key} = ?`;
    });
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  if (orderBy) {
    sql += ` ORDER BY ${orderBy}`;
  }

  if (limit) {
    sql += ` LIMIT ${limit}`;
  }

  if (offset) {
    sql += ` OFFSET ${offset}`;
  }

  return dbQueryAll<T>(sql, values);
}

/**
 * 插入记录（通过自增 insertId 回查，仅适用于 AUTO_INCREMENT 主键表）
 */
export async function insert<T extends Record<string, unknown> = Record<string, unknown>>(
  table: string,
  data: Record<string, unknown>
): Promise<T | null> {
  const columns = Object.keys(data);
  const values = Object.values(data);
  const placeholders = values.map(() => '?').join(', ');

  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;

  const { query } = await import('./mysql-client');
  const result = await query(sql, values);
  if (result.insertId <= 0) return null;

  return dbQueryOne<T>(`SELECT * FROM ${table} WHERE id = ?`, [result.insertId]);
}

/**
 * 更新记录（通过主键 id 回查）
 */
export async function update<T extends Record<string, unknown> = Record<string, unknown>>(
  table: string,
  data: Record<string, unknown>,
  where: Record<string, unknown>
): Promise<T | null> {
  const setClauses = Object.keys(data).map((key) => `${key} = ?`);
  const whereClauses = Object.keys(where).map((key) => `${key} = ?`);
  const values = [...Object.values(data), ...Object.values(where)];

  const sql = `UPDATE ${table} SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;

  const { query } = await import('./mysql-client');
  await query(sql, values);

  const whereValues = Object.values(where);
  return dbQueryOne<T>(
    `SELECT * FROM ${table} WHERE ${whereClauses.join(' AND ')}`,
    whereValues
  );
}

/**
 * 删除记录（先查出被删除的记录再删除）
 */
export async function remove<T extends Record<string, unknown> = Record<string, unknown>>(
  table: string,
  where: Record<string, unknown>
): Promise<T | null> {
  const whereClauses = Object.keys(where).map((key) => `${key} = ?`);
  const values = Object.values(where);

  const existing = await dbQueryOne<T>(
    `SELECT * FROM ${table} WHERE ${whereClauses.join(' AND ')} LIMIT 1`,
    values
  );
  const { query } = await import('./mysql-client');
  await query(`DELETE FROM ${table} WHERE ${whereClauses.join(' AND ')}`, values);

  return existing;
}

/**
 * 执行原始 SQL
 */
export async function raw<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<T[]> {
  return dbQueryAll<T>(sql, values);
}

/**
 * 执行原始 SQL 查询单条
 */
export async function rawOne<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<T | null> {
  return dbQueryOne<T>(sql, values);
}
