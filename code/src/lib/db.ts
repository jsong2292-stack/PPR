/**
 * MySQL 连接池与事务工具。
 *
 * 约定（与 db/README.md 一致）：
 *   - charset utf8mb4，timezone 与现场一致（默认 +08:00）
 *   - dateStrings: true —— DATETIME 以 'YYYY-MM-DD HH:mm:ss' 字符串返回，
 *     避免 Node 的 Date 对象把本地时间按 UTC 解释导致现场时间错位
 *   - decimalNumbers: false —— DECIMAL 返回字符串，保留数据库精度。
 *     业务层需要数值时统一用 `toNumber()` 转换，绝不隐式 Number()
 *   - 应用账号只有 DML 权限，建表/迁移由 scripts/db-migrate.ts 用迁移账号执行
 */
import mysql, { type Pool, type PoolConnection, type RowDataPacket, type ResultSetHeader } from 'mysql2/promise';
import { config, assertDatabaseConfig } from './config';
import { logger } from './logger';

export type { Pool, PoolConnection, RowDataPacket, ResultSetHeader };

let pool: Pool | null = null;

/** 获取全局连接池（惰性创建） */
export function getPool(): Pool {
  if (pool) return pool;
  assertDatabaseConfig();
  pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    charset: 'utf8mb4',
    timezone: config.db.timezone,
    dateStrings: true,
    decimalNumbers: false,
    waitForConnections: true,
    connectionLimit: config.db.connectionLimit,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    ssl: config.db.ssl ? { rejectUnauthorized: false } : undefined,
  });

  // 会话时区对齐。
  //
  // 为什么必须显式设置：MySQL 的 DATETIME 不带时区，NOW()/CURRENT_TIMESTAMP
  // 取的是会话时区。若数据库容器是 UTC 而现场是 +08:00，
  // created_at / updated_at 会被写成 UTC 时间，而驱动又按 +08:00 解释，
  // 读出来就少了 8 小时（排查「刚新增的记录时间是 8 小时前」时请先看这里）。
  //
  // 这里在每条连接建立时把会话时区设为应用配置的时区，保证：
  //   写入方（NOW()）与读取方（驱动的 timezone 参数）使用同一把尺子。
  pool.on('connection', (connection) => {
    connection.query(`SET time_zone = '${config.db.timezone}'`, (error: Error | null) => {
      if (error) {
        logger.warn('设置数据库会话时区失败，时间字段可能存在偏移', {
          timezone: config.db.timezone,
          error: error.message,
        });
      }
    });
  });

  return pool;
}

/** 进程退出时释放连接池（自定义 Server 的优雅退出会调用） */
export async function closePool(): Promise<void> {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}

/**
 * 参数规整。
 *
 * mysql2 对 `undefined` 会直接抛错（"Bind parameters must not contain undefined"），
 * 而 TypeScript 的可选字段在运行时很容易变成 undefined。这里统一把 undefined
 * 转成 NULL，避免每个 repository 都要写一遍 `?? null`。
 * 同时把 boolean 转成 0/1，因为 MySQL 的 TINYINT(1) 不接受 true/false 以外
 * 的隐式转换在某些驱动版本上会报错。
 */
function normalizeParams(params: unknown[]): unknown[] {
  return params.map((value) => {
    if (value === undefined) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    return value;
  });
}

/** 查询多行 */
export async function query<T extends RowDataPacket = RowDataPacket>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const [rows] = await getPool().query<T[]>(sql, normalizeParams(params));
  return rows;
}

/** 查询单行，无结果返回 null */
export async function queryOne<T extends RowDataPacket = RowDataPacket>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** 写入语句统一返回结果头（insertId / affectedRows） */
export async function execute(sql: string, params: unknown[] = []): Promise<ResultSetHeader> {
  const [result] = await getPool().execute(sql, normalizeParams(params));
  return result as ResultSetHeader;
}

/** 取单列标量值（COUNT/SUM 等） */
export async function queryScalar<T = number>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const row = await queryOne<RowDataPacket>(sql, params);
  if (!row) return null;
  const values = Object.values(row);
  return (values[0] ?? null) as T | null;
}

/**
 * 事务包装。
 *
 * 用法：
 *   await withTransaction(async (conn) => {
 *     await conn.query(...);
 *   });
 * 回调抛错时自动回滚；正常情况下提交。
 * 注意：事务内的查询必须使用回调提供的 conn，不能用全局 query()，
 * 否则会跑在池里的另一条连接上，不属于本事务。
 */
export async function withTransaction<T>(
  handler: (conn: PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await handler(conn);
    await conn.commit();
    return result;
  } catch (error) {
    try {
      await conn.rollback();
    } catch {
      // 回滚失败通常意味着连接已断开，交由连接池回收
    }
    throw error;
  } finally {
    conn.release();
  }
}

/** 数据库健康检查：返回版本与当前时间，供 /api/health 使用 */
export async function pingDatabase(): Promise<{ version: string; now: string }> {
  const row = await queryOne<RowDataPacket & { version: string; now: string }>(
    'SELECT VERSION() AS version, DATE_FORMAT(NOW(), "%Y-%m-%d %H:%i:%s") AS now',
  );
  return { version: row?.version ?? 'unknown', now: row?.now ?? '' };
}
