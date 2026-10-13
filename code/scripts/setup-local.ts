/**
 * 本地开发环境初始化（把「建库 + 建账号 + 生成 .env.local」一次做完）。
 *
 *   pnpm setup:local                 # 交互式，使用默认值
 *   pnpm setup:local --user root --password root
 *
 * 前提：MySQL 已在本地运行（本项目开发环境使用 Docker 容器 mysql，127.0.0.1:3306）。
 * 本脚本用管理员账号连库，完成：
 *   1) CREATE DATABASE ppr_quality（不存在时）
 *   2) 创建应用账号 ppr_app（DML 权限）与迁移账号 ppr_migrator（该库 DDL 权限）
 *   3) 生成 .env.local（已存在则保留，除非加 --force）
 *
 * 安全性：
 *   - 生成随机口令，避免使用弱口令；
 *   - 只授予 ppr_quality 库内权限，账号看不到同实例的其他库；
 *   - `.env.local` 已在 .gitignore 中排除。
 *
 * 生产环境请勿使用本脚本：生产应由 DBA 建库建账号，再执行 `pnpm db:migrate`。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
import mysql from 'mysql2/promise';

interface Args {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  force: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string, fallback: string): string => {
    const index = argv.indexOf(flag);
    return index !== -1 && argv[index + 1] ? argv[index + 1] : fallback;
  };
  return {
    host: get('--host', process.env.DB_HOST ?? '127.0.0.1'),
    port: Number(get('--port', process.env.DB_PORT ?? '3306')),
    user: get('--user', process.env.DB_ADMIN_USER ?? 'root'),
    password: get('--password', process.env.DB_ADMIN_PASSWORD ?? 'root'),
    database: get('--database', process.env.DB_NAME ?? 'ppr_quality'),
    force: argv.includes('--force'),
  };
}

/** 生成 URL 安全的随机口令（去掉容易混淆的字符） */
function randomPassword(length = 24): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function randomSecret(): string {
  return crypto.randomBytes(48).toString('base64url');
}

function quoteIdent(value: string): string {
  return `\`${value.replace(/`/g, '')}\``;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const envPath = path.join(process.cwd(), '.env.local');

  if (fs.existsSync(envPath) && !args.force) {
    console.log(`.env.local 已存在（${envPath}）。`);
    console.log('如需重新生成并重置数据库账号口令，请加 --force（会改动数据库中的口令）。');
    return;
  }

  const appPassword = randomPassword();
  const migratorPassword = randomPassword();
  const authSecret = randomSecret();

  console.log(`连接 MySQL：${args.user}@${args.host}:${args.port}`);
  const isSocketUser = ['root', 'localhost'].includes(args.user) && !args.password;
  const admin = await mysql.createConnection({
    host: args.host,
    port: args.port,
    user: args.user,
    password: args.password || undefined,
    ...(isSocketUser ? {} : {}),
    multipleStatements: false,
  });

  try {
    console.log(`1/4 创建数据库 ${args.database}`);
    await admin.query(
      `CREATE DATABASE IF NOT EXISTS ${quoteIdent(args.database)}
         DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
    );

    // 宿主经 NAT 访问容器内的 MySQL 时，源地址不是 localhost，
    // 因此主机名用 '%'；生产环境应改为具体网段。
    for (const [user, password, grants] of [
      [
        'ppr_app',
        appPassword,
        [
          `GRANT SELECT, INSERT, UPDATE, DELETE ON ${quoteIdent(args.database)}.* TO 'ppr_app'@'%'`,
        ],
      ],
      [
        'ppr_migrator',
        migratorPassword,
        [
          `GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES ON ${quoteIdent(args.database)}.* TO 'ppr_migrator'@'%'`,
        ],
      ],
    ] as const) {
      console.log(`2/4 配置账号 ${user}`);
      await admin.query(`CREATE USER IF NOT EXISTS '${user}'@'%' IDENTIFIED BY '${password}'`);
      await admin.query(`ALTER USER '${user}'@'%' IDENTIFIED BY '${password}'`);
      for (const grant of grants) await admin.query(grant);
      await admin.query('FLUSH PRIVILEGES');
    }

    console.log('3/4 写入 .env.local');
    const content = [
      '# ─────────────────────────────────────────────────────────────',
      '# 由 pnpm setup:local 生成（本机开发环境）。此文件已在 .gitignore 中排除。',
      `# 生成时间：${new Date().toLocaleString('zh-CN')}`,
      '# ─────────────────────────────────────────────────────────────',
      '',
      'NODE_ENV=development',
      'HOST=127.0.0.1',
      'PORT=3000',
      'APP_URL=http://127.0.0.1:3000',
      '',
      '# MySQL',
      `DB_HOST=${args.host}`,
      `DB_PORT=${args.port}`,
      `DB_NAME=${args.database}`,
      'DB_USER=ppr_app',
      `DB_PASSWORD=${appPassword}`,
      'DB_MIGRATION_USER=ppr_migrator',
      `DB_MIGRATION_PASSWORD=${migratorPassword}`,
      'DB_CONNECTION_LIMIT=10',
      'DB_TIMEZONE=+08:00',
      'DB_SSL=false',
      '',
      '# 会话与安全',
      `AUTH_SECRET=${authSecret}`,
      'SESSION_TTL_HOURS=12',
      'BOOTSTRAP_ADMIN_USERNAME=admin',
      'BOOTSTRAP_ADMIN_PASSWORD=',
      'BOOTSTRAP_ADMIN_NAME=系统管理员',
      '',
      '# 后台规则引擎',
      'ENABLE_RULE_SCHEDULER=true',
      'RULE_SCAN_INTERVAL_SECONDS=300',
      'RULE_SCAN_LOOKBACK_HOURS=72',
      '',
      '# 通知（db = 只落库；smtp = 同时尝试投递）',
      'NOTIFY_TRANSPORT=db',
      'SMTP_HOST=',
      'SMTP_PORT=465',
      'SMTP_SECURE=true',
      'SMTP_USER=',
      'SMTP_PASSWORD=',
      'SMTP_FROM=',
      '',
      'MAX_UPLOAD_MB=20',
      '',
    ].join('\n');
    fs.writeFileSync(envPath, content, { mode: 0o600 });

    console.log('4/4 完成');
    console.log('');
    console.log(`  数据库：${args.database}`);
    console.log('  应用账号 ppr_app      仅 DML 权限（SELECT/INSERT/UPDATE/DELETE）');
    console.log('  迁移账号 ppr_migrator 含本库 DDL 权限');
    console.log(`  口令已写入：${envPath}`);
    console.log('');
    console.log('下一步：');
    console.log('  pnpm db:migrate       # 建立表结构 + 基础数据');
    console.log('  pnpm db:check         # 校验连接与结构');
  } finally {
    await admin.end();
  }
}

main().catch((error) => {
  console.error(`\n初始化失败：${error instanceof Error ? error.message : String(error)}`);
  console.error('请确认 MySQL 正在运行，且 --user/--password 为管理员账号。');
  process.exitCode = 1;
});
