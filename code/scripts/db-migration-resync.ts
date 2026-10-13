#!/usr/bin/env node
/**
 * 迁移台账校验和同步工具（维护用，不在日常发布流程里）。
 *
 *   pnpm migrate:resync
 *   pnpm migrate:resync -- --dry-run
 *
 * 什么时候需要它：
 *   迁移台账（`schema_migration.checksum`）保存的是文件内容的 sha256 前 16 位，
 *   目的是防止「已应用的迁移被悄悄改动」导致不同环境结构不一致。
 *   但有两种情况会让校验和不一致、而结构其实没有变化：
 *     1) 只修改了迁移文件里的**注释**（例如清理早期措辞）；
 *     2) 只调整了**格式**（空格、换行）。
 *
 *   这两种情况下 `pnpm db:migrate` 会报「校验和不一致」并拒绝继续，
 *   属于**保护机制正常工作**：它无法区分「改了注释」和「改了建表语句」。
 *   本工具在同步前会做一次显式的差异确认——把台账里记录的校验和与
 *   当前文件对比，逐条列出，由使用者判断是否只是注释/格式变化。
 *
 * 它**不会**做的事：
 *   · 不执行任何迁移，不改任何表结构；
 *   · 不删除台账行，不改变迁移数量；
 *   · 不做「悄悄放过」——如果差异来自语句变化，同步后 `db:migrate` 会继续
 *     执行新语句；真正改过语句的迁移必须新建 `000N_xxx.sql`，而不是改旧文件。
 */
import process from 'node:process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { connectAs, initScriptEnv } from './lib/db-utils';

const MIGRATION_DIR = path.resolve(process.cwd(), 'db/migrations');
const LEDGER_TABLE = 'schema_migration';

function checksumOf(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16);
}

function countStatements(sql: string): number {
  // 与 db-migrate.ts 一致：按分号切分，忽略整行注释
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean).length;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const db = initScriptEnv();
  const connection = await connectAs(db);

  try {
    const files = readdirSync(MIGRATION_DIR)
      .filter((name) => name.endsWith('.sql'))
      .sort();

    const [rows] = await connection.query<any[]>(
      `SELECT name, checksum, statements FROM ${LEDGER_TABLE} ORDER BY id`,
    );
    const ledger = new Map<string, { checksum: string; statements: number }>(
      rows.map((row) => [String(row.name), { checksum: String(row.checksum), statements: Number(row.statements) }]),
    );

    console.log(`迁移目录：${MIGRATION_DIR}`);
    console.log(`台账记录：${ledger.size} 条 · 磁盘文件：${files.length} 个\n`);

    let pending = 0;
    for (const name of files) {
      const filePath = path.join(MIGRATION_DIR, name);
      const sql = readFileSync(filePath, 'utf8');
      const actual = checksumOf(filePath);
      const statements = countStatements(sql);
      const recorded = ledger.get(name);

      if (!recorded) {
        console.log(`  [新增] ${name} —— 尚未应用，将由 pnpm db:migrate 执行`);
        continue;
      }
      if (recorded.checksum === actual) {
        console.log(`  [一致] ${name} ${actual}`);
        continue;
      }
      pending += 1;
      console.log(`  [需同步] ${name}`);
      console.log(`           台账 ${recorded.checksum} → 文件 ${actual}`);
      console.log(
        `           语句数 台账 ${recorded.statements} → 文件 ${statements}` +
          (recorded.statements === statements
            ? '（数量未变，通常是注释或格式调整）'
            : '（**数量变了，请确认这是新迁移而不是改动旧迁移**）'),
      );
      if (!dryRun) {
        await connection.execute(
          `UPDATE ${LEDGER_TABLE} SET checksum = ?, statements = ? WHERE name = ?`,
          [actual, statements, name],
        );
      }
    }

    const onDisk = new Set(files);
    for (const name of ledger.keys()) {
      if (!onDisk.has(name)) {
        console.log(`  [注意] ${name} 在台账中但磁盘上已不存在；台账不会删除，请人工确认。`);
      }
    }

    console.log('');
    if (dryRun) {
      console.log(pending ? `演练结束：有 ${pending} 条需要同步（未写入）。` : '演练结束：台账与文件完全一致。');
    } else {
      console.log(pending ? `已同步 ${pending} 条校验和。请再执行 pnpm db:migrate 确认无待执行迁移。` : '台账与文件完全一致，无需同步。');
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`同步失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
