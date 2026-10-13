/**
 * 统一 MySQL 数据库客户端
 *
 * 基于 mysql2/promise 连接池 + 原生 SQL。
 *
 * 为降低迁移成本，本模块对外暴露的 API 与旧版 PostgreSQL 客户端保持一致
 * （query / queryOne / queryAll / transaction / testConnection），并且**兼容 `$1, $2`
 * 形式的占位符**：内部会自动转换为 MySQL 的 `?` 占位符并按需要复制参数。
 * 新代码建议直接使用 `?` 占位符。
 *
 * 连接串解析优先级：MYSQL_URL → DATABASE_URL → 分项变量（MYSQL_HOST 等）。
 */
import { execSync } from 'child_process';
import mysql, { Pool, PoolConnection, ResultSetHeader } from 'mysql2/promise';

let pool: Pool | null = null;
let envLoaded = false;

/** 是否需要平台侧注入环境变量（保持与旧实现一致） */
function hasDbConfig(): boolean {
  return Boolean(
    process.env.MYSQL_URL ||
      process.env.DATABASE_URL ||
      (process.env.MYSQL_HOST && process.env.MYSQL_DATABASE)
  );
}

function loadEnv(): void {
  if (envLoaded) return;

  if (hasDbConfig()) {
    envLoaded = true;
    return;
  }

  try {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- loadEnv 为同步函数，无法使用 import()
      require('dotenv').config();
      if (hasDbConfig()) {
        envLoaded = true;
        return;
      }
    } catch {
      // dotenv not available
    }

    const pythonCode = `
import os
import sys
try:
    from coze_workload_identity import Client
    client = Client()
    env_vars = client.get_project_env_vars()
    client.close()
    for env_var in env_vars:
        print(f"{env_var.key}={env_var.value}")
except Exception as e:
    print(f"# Error: {e}", file=sys.stderr)
`;

    const output = execSync(`python3 -c '${pythonCode.replace(/'/g, "'\"'\"'")}'`, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const lines = output.trim().split('\n');
    for (const line of lines) {
      if (line.startsWith('#')) continue;
      const eqIndex = line.indexOf('=');
      if (eqIndex > 0) {
        const key = line.substring(0, eqIndex);
        let value = line.substring(eqIndex + 1);
        if ((value.startsWith("'") && value.endsWith("'")) ||
            (value.startsWith('"') && value.endsWith('"'))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }

    envLoaded = true;
  } catch {
    // Silently fail
  }
}

interface ConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/** 从连接串解析出 MySQL 连接参数 */
function parseConnectionString(rawUrl: string): ConnectionConfig {
  // 兼容误写成 postgres:// 前缀的历史连接串
  const url = rawUrl.replace(/^postgres(ql)?:\/\//i, 'mysql://');
  const parsed = new URL(url);
  return {
    host: parsed.hostname || '127.0.0.1',
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username || 'root'),
    password: decodeURIComponent(parsed.password || ''),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, '')) || '',
  };
}

function getConnectionConfig(): ConnectionConfig {
  loadEnv();

  const url = process.env.MYSQL_URL || process.env.DATABASE_URL;
  if (url) {
    return parseConnectionString(url);
  }

  const host = process.env.MYSQL_HOST || process.env.DB_HOST;
  const database = process.env.MYSQL_DATABASE || process.env.DB_NAME;

  if (!host || !database) {
    throw new Error(
      'MySQL 连接未配置。请设置 MYSQL_URL（或 DATABASE_URL），或提供 MYSQL_HOST / MYSQL_DATABASE 等分项变量'
    );
  }

  return {
    host,
    port: Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306),
    user: process.env.MYSQL_USER || process.env.DB_USER || 'root',
    password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '',
    database,
  };
}

function getConnectionString(): string {
  const cfg = getConnectionConfig();
  return `mysql://${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`;
}

function getPool(): Pool {
  if (!pool) {
    const cfg = getConnectionConfig();
    pool = mysql.createPool({
      ...cfg,
      waitForConnections: true,
      connectionLimit: 10,
      maxIdle: 10,
      idleTimeout: 30000,
      queueLimit: 0,
      connectTimeout: 10000,
      charset: 'utf8mb4_unicode_ci',
      // 约定数据库以 UTC 存储时间；返回 JS Date，JSON 序列化后为 ISO 字符串（与旧版行为一致）
      timezone: 'Z',
      supportBigNumbers: true,
      multipleStatements: false,
    });

    // mysql2 的 Pool 类型声明未暴露 'error' 事件，这里按 EventEmitter 处理
    (pool as unknown as NodeJS.EventEmitter).on('error', (err: Error) => {
      console.error('MySQL pool error:', err);
    });
  }

  return pool;
}

async function getClient(): Promise<PoolConnection> {
  return getPool().getConnection();
}

/** 将 SQL 中 `$n` 形式占位符转换为 mysql2 的 `?`，并按需重排 / 复制参数 */
function buildQuery(text: string, values?: unknown[]): { sql: string; params: unknown[] } {
  if (!values || values.length === 0) {
    return { sql: text, params: [] };
  }

  let hasDollar = false;
  const params: unknown[] = [];
  const sql = text.replace(/\$(\d+)/g, (_match, num: string) => {
    hasDollar = true;
    params.push(values[Number(num) - 1]);
    return '?';
  });

  // 未使用 `$n` 时，认为调用方已使用 `?` 占位符，原样透传参数
  return hasDollar ? { sql, params } : { sql: text, params: values };
}

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  insertId: number;
  affectedRows: number;
}

async function runQuery<T extends Record<string, unknown> = Record<string, unknown>>(
  executor: Pick<PoolConnection, 'query'>,
  text: string,
  values?: unknown[]
): Promise<QueryResult<T>> {
  const { sql, params } = buildQuery(text, values);
  const [result] = await executor.query(sql, params);

  if (Array.isArray(result)) {
    return { rows: result as T[], insertId: 0, affectedRows: result.length };
  }

  const header = result as ResultSetHeader;
  return {
    rows: [],
    insertId: Number(header?.insertId ?? 0),
    affectedRows: Number(header?.affectedRows ?? 0),
  };
}

async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  values?: unknown[]
): Promise<QueryResult<T>> {
  return runQuery<T>(getPool(), text, values);
}

async function queryOne<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  values?: unknown[]
): Promise<T | null> {
  const result = await query<T>(text, values);
  return result.rows[0] ?? null;
}

async function queryAll<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  values?: unknown[]
): Promise<T[]> {
  const result = await query<T>(text, values);
  return result.rows;
}

/** 事务内可用的客户端（API 与模块级函数一致） */
export interface TransactionClient {
  query: (text: string, values?: unknown[]) => Promise<QueryResult>;
  queryOne: (text: string, values?: unknown[]) => Promise<Record<string, unknown> | null>;
  queryAll: (text: string, values?: unknown[]) => Promise<Record<string, unknown>[]>;
}

async function transaction<T>(callback: (client: TransactionClient) => Promise<T>): Promise<T> {
  const conn = await getClient();
  try {
    await conn.beginTransaction();

    const client: TransactionClient = {
      query: (text, values) => runQuery(conn, text, values),
      queryOne: async (text, values) => {
        const result = await runQuery(conn, text, values);
        return result.rows[0] ?? null;
      },
      queryAll: async (text, values) => {
        const result = await runQuery(conn, text, values);
        return result.rows;
      },
    };

    const result = await callback(client);
    await conn.commit();
    return result;
  } catch (error) {
    try {
      await conn.rollback();
    } catch {
      // 回滚失败时忽略，抛出原始错误
    }
    throw error;
  } finally {
    conn.release();
  }
}

async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// 检查数据库连接
async function testConnection(): Promise<boolean> {
  try {
    await query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export {
  getPool,
  getClient,
  query,
  queryOne,
  queryAll,
  transaction,
  closePool,
  testConnection,
  getConnectionString,
  getConnectionConfig,
};
