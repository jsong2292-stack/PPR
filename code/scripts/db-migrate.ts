#!/usr/bin/env tsx
/**
 * 数据库迁移执行器。
 *
 *   pnpm db:migrate            应用所有未执行的迁移
 *   pnpm db:migrate --status   只列出状态，不执行
 *   pnpm db:migrate --dry-run  打印将要执行的迁移，不连接数据库
 *
 * 迁移记录表 `schema_migration` 保存已应用的文件名与校验和；文件内容变更会报错，
 * 防止「改过的迁移在新环境重跑导致结构不一致」。
 *
 * DDL（1. 建库建账号）由 DBA 或 `scripts/db-bootstrap.sh` 完成，见 docs/DEPLOY.md。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
import { loadEnv } from '../src/lib/env';

loadEnv();

import { config } from '../src/lib/config';
import { connectAs, migrationCredentials, runStatements, splitStatements } from './lib/db-utils';

const MIGRATIONS_DIR = path.join(process.cwd(), 'db', 'migrations');
const LEDGER_TABLE = 'schema_migration';

interface MigrationFile {
  name: string;
  fullPath: string;
  sql: string;
  checksum: string;
  statements: string[];
}

function readMigrations(): MigrationFile[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`迁移目录不存在：${MIGRATIONS_DIR}`);
  }
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => {
      const fullPath = path.join(MIGRATIONS_DIR, name);
      const sql = fs.readFileSync(fullPath, 'utf8');
      return {
        name,
        fullPath,
        sql,
        checksum: crypto.createHash('sha256').update(sql).digest('hex').slice(0, 16),
        statements: splitStatements(sql),
      };
    });
}

async function ensureLedger(conn: Awaited<ReturnType<typeof connectAs>>): Promise<void> {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS ${LEDGER_TABLE} (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(191) NOT NULL COMMENT '迁移文件名',
      checksum CHAR(16) NOT NULL COMMENT '内容校验和（sha256 前 16 位）',
      statements INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '执行的语句条数',
      applied_by VARCHAR(64) NOT NULL DEFAULT '' COMMENT '执行账号',
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '执行时间',
      PRIMARY KEY (id),
      UNIQUE KEY uk_migration_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='数据库迁移记录';
  `);
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const statusOnly = args.has('--status');
  const dryRun = args.has('--dry-run');

  const migrations = readMigrations();
  if (!migrations.length) {
    console.log('没有找到任何迁移文件。');
    return;
  }

  if (dryRun) {
    console.log(`将按顺序执行 ${migrations.length} 个迁移（dry-run，未连接数据库）：`);
    for (const m of migrations) console.log(`  - ${m.name}  (${m.statements.length} 条语句, ${m.checksum})`);
    return;
  }

  console.log(`数据库：${config.db.host}:${config.db.port}/${config.db.database}`);
  console.log(`身份：${migrationCredentials().uses}`);

  const conn = await connectAs();
  try {
    await ensureLedger(conn);
    const [rows] = await conn.query<any[]>(`SELECT name, checksum FROM ${LEDGER_TABLE}`);
    const applied = new Map<string, string>(rows.map((r) => [r.name, r.checksum]));

    let pending = 0;
    let drifted = 0;

    for (const m of migrations) {
      const existing = applied.get(m.name);
      if (existing === undefined) {
        pending += 1;
        if (statusOnly) {
          console.log(`  [待执行] ${m.name}  (${m.statements.length} 条语句)`);
          continue;
        }
        process.stdout.write(`  [执行中] ${m.name} … `);
        for (const statement of m.statements) {
          try {
            await conn.query(statement);
          } catch (error) {
            process.stdout.write('失败\n');
            const preview = statement.replace(/\s+/g, ' ').slice(0, 200);
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`${m.name} 执行失败：${message}\nSQL: ${preview}…`);
          }
        }
        await conn.query(
          `INSERT INTO ${LEDGER_TABLE} (name, checksum, statements, applied_by) VALUES (?,?,?,?)`,
          [m.name, m.checksum, m.statements.length, migrationCredentials().user],
        );
        console.log(`完成（${m.statements.length} 条语句）`);
        continue;
      }
      if (existing !== m.checksum) {
        drifted += 1;
        console.error(
          `  [校验失败] ${m.name}：已应用的版本校验和 ${existing} 与当前文件 ${m.checksum} 不一致。` +
            `已应用的迁移不可修改；如需变更请新增迁移文件。`,
        );
        continue;
      }
      if (statusOnly) console.log(`  [已应用] ${m.name}`);
    }

    if (statusOnly) {
      console.log(`\n共 ${migrations.length} 个迁移，待执行 ${pending} 个，校验失败 ${drifted} 个。`);
    } else if (pending === 0) {
      console.log('  [已是最新] 没有待执行的迁移。');
    }

    if (drifted > 0) process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(`\n迁移失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
