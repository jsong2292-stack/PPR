/**
 * 数据库连接工具（脚本用）。
 *
 * 迁移/种子脚本需要 DDL 权限，而应用账号 `ppr_app` 只有 DML 权限，
 * 因此脚本使用 `DB_MIGRATION_USER` / `DB_MIGRATION_PASSWORD` 建立一次性连接。
 * 若未配置迁移账号，则回退到应用账号（并要求 DBA 已授权）。
 */
import mysql from 'mysql2/promise';
import { config, assertDatabaseConfig } from '../src/lib/config';

export interface ConnOptions {
  multipleStatements?: boolean;
}

export function migrationCredentials(): { user: string; password: string; uses: string } {
  if (config.db.migrationUser && config.db.migrationPassword) {
    return {
      user: config.db.migrationUser,
      password: config.db.migrationPassword,
      uses: `迁移账号 ${config.db.migrationUser}`,
    };
  }
  return {
    user: config.db.user,
    password: config.db.password,
    uses: `应用账号 ${config.db.user}（未配置 DB_MIGRATION_USER）`,
  };
}

export async function connectAs(options: ConnOptions = {}): Promise<mysql.Connection> {
  assertDatabaseConfig();
  const { user, password } = migrationCredentials();
  return mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user,
    password,
    database: config.db.database,
    charset: 'utf8mb4',
    timezone: config.db.timezone,
    dateStrings: true,
    decimalNumbers: false,
    multipleStatements: options.multipleStatements ?? false,
    ssl: config.db.ssl ? { rejectUnauthorized: false } : undefined,
  });
}

export async function connectAsApp(): Promise<mysql.Connection> {
  assertDatabaseConfig();
  return mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    charset: 'utf8mb4',
    timezone: config.db.timezone,
    dateStrings: true,
    decimalNumbers: false,
    ssl: config.db.ssl ? { rejectUnauthorized: false } : undefined,
  });
}

/**
 * 把一段 SQL 文本切成可逐条执行的语句。
 *
 * 只处理本项目实际使用的 SQL 形态（无存储过程/触发器/自定义 DELIMITER）：
 * - 去掉 `--` 行注释与 `/* *​/` 块注释；
 * - 按分号切分，忽略字符串字面量内部的分号（'...' / "..." / `...`）。
 * 遇到无法安全切分的语句会原样返回，让 MySQL 报错，而不是静默丢弃。
 */
export function splitStatements(sql: string): string[] {
  const withoutBlockComments = sql.replace(/\/\*[\s\S]*?\*\//g, '');
  const withoutLineComments = withoutBlockComments
    .split(/\r?\n/)
    .map((line) => {
      // 保留行首注释后的内容；-- 出现在字符串里的情况在本项目的 SQL 中不存在
      const idx = line.indexOf('--');
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join('\n');

  const statements: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (let i = 0; i < withoutLineComments.length; i += 1) {
    const ch = withoutLineComments[i];
    if (quote) {
      current += ch;
      if (ch === '\\') {
        // 跳过被转义字符
        if (i + 1 < withoutLineComments.length) {
          current += withoutLineComments[i + 1];
          i += 1;
        }
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === ';') {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      continue;
    }
    current += ch;
  }
  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

/** 逐条执行 SQL，遇到错误立即抛出并带上语句位置。 */
export async function runStatements(conn: mysql.Connection, statements: string[]): Promise<number> {
  let executed = 0;
  for (const statement of statements) {
    try {
      await conn.query(statement);
      executed += 1;
    } catch (error) {
      const preview = statement.replace(/\s+/g, ' ').slice(0, 180);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`第 ${executed + 1} 条语句执行失败：${message}\nSQL: ${preview}…`);
    }
  }
  return executed;
}
