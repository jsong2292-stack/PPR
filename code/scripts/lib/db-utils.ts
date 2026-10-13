/**
 * 脚本侧数据库工具。
 *
 * 与 `src/lib/db.ts` 的区别：
 *   - 应用运行时用连接池（长连接、并发复用）；
 *   - 脚本用一次性连接（迁移 / 校验 / 冒烟跑完即退出），并使用权限更高的迁移账号。
 *
 * 为什么这里用 initScriptEnv() 显式加载环境变量，而不是在模块顶层 import config：
 *   ES 模块的 import 会被提升到所有语句之前执行，`import { config }` 会在
 *   `loadEnv()` 之前求值，导致脚本读不到 .env.local。因此本模块只导出工厂函数，
 *   由脚本在加载环境变量之后调用。
 */
import mysql from 'mysql2/promise';
import { loadEnv } from '../../src/lib/env';
import { config, assertDatabaseConfig, type AppConfig } from '../../src/lib/config';

export type ScriptDbConfig = AppConfig['db'];

export interface ConnOptions {
  multipleStatements?: boolean;
}

/**
 * 脚本入口第一件事：加载 .env* 并返回可用于连库的配置。
 * 必须在任何连库动作之前调用。
 */
export function initScriptEnv(): ScriptDbConfig {
  loadEnv();
  return config.db;
}

export function migrationCredentials(db: ScriptDbConfig = config.db): {
  user: string;
  password: string;
  uses: string;
} {
  if (db.migrationUser && db.migrationPassword) {
    return {
      user: db.migrationUser,
      password: db.migrationPassword,
      uses: `迁移账号 ${db.migrationUser}`,
    };
  }
  return {
    user: db.user,
    password: db.password,
    uses: `应用账号 ${db.user}（未配置 DB_MIGRATION_USER）`,
  };
}

function baseConnectionOptions(db: ScriptDbConfig) {
  return {
    host: db.host,
    port: db.port,
    database: db.database,
    charset: 'utf8mb4',
    timezone: db.timezone,
    dateStrings: true as const,
    decimalNumbers: false as const,
    ssl: db.ssl ? { rejectUnauthorized: false } : undefined,
  };
}

/** 以迁移账号（或回退到应用账号）建立一次性连接 */
export async function connectAs(
  db: ScriptDbConfig,
  options: ConnOptions = {},
): Promise<mysql.Connection> {
  assertDatabaseConfig();
  const { user, password } = migrationCredentials(db);
  return mysql.createConnection({
    ...baseConnectionOptions(db),
    user,
    password,
    multipleStatements: options.multipleStatements ?? false,
  });
}

/** 以应用账号建立一次性连接，用于验证应用账号的真实权限 */
export async function connectAsApp(db: ScriptDbConfig): Promise<mysql.Connection> {
  assertDatabaseConfig();
  return mysql.createConnection({
    ...baseConnectionOptions(db),
    user: db.user,
    password: db.password,
  });
}

/**
 * 把一段 SQL 文本切成可逐条执行的语句。
 *
 * 只处理本项目实际使用的 SQL 形态（无存储过程/触发器/自定义 DELIMITER）：
 * - 去掉 `--` 行注释与块注释；
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

/** 逐条执行 SQL，遇到错误立即抛出并带上语句位置 */
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

/**
 * 执行拆分后的语句，但 **忽略** 指定错误码。
 *
 * 迁移脚本需要「幂等」：例如 `ADD COLUMN` 在列已存在时应视为成功。
 * MySQL 没有 `ADD COLUMN IF NOT EXISTS`，所以用错误码白名单实现。
 */
export async function runStatementsIgnoring(
  conn: mysql.Connection,
  statements: string[],
  ignorableCodes: string[],
): Promise<{ executed: number; skipped: number }> {
  let executed = 0;
  let skipped = 0;
  for (const statement of statements) {
    try {
      await conn.query(statement);
      executed += 1;
    } catch (error) {
      const code = (error as { code?: string }).code ?? '';
      if (ignorableCodes.includes(code)) {
        skipped += 1;
        continue;
      }
      const preview = statement.replace(/\s+/g, ' ').slice(0, 180);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`语句执行失败：${message}\nSQL: ${preview}…`);
    }
  }
  return { executed, skipped };
}
