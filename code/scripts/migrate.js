/**
 * 增量迁移执行器（MySQL）
 *
 * 按文件名顺序执行 scripts/migrations/*.sql。
 * 注意：本执行器不做「已执行」记录，迁移脚本需自行保证幂等。
 *
 * 用法：node scripts/migrate.js
 */
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

try {
  require('dotenv').config({ path: '.env.local' });
  require('dotenv').config();
} catch {
  // 忽略
}

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/** 解析 MySQL 连接配置，优先连接串，其次分项变量 */
function resolveConnection() {
  const url = process.env.MYSQL_URL || process.env.DATABASE_URL;
  if (url) {
    const parsed = new URL(url.replace(/^postgres(ql)?:\/\//i, 'mysql://'));
    return {
      host: parsed.hostname || '127.0.0.1',
      port: parsed.port ? Number(parsed.port) : 3306,
      user: decodeURIComponent(parsed.username || 'root'),
      password: decodeURIComponent(parsed.password || ''),
      database: decodeURIComponent(parsed.pathname.replace(/^\//, '')) || '',
    };
  }

  const host = process.env.MYSQL_HOST;
  const database = process.env.MYSQL_DATABASE;
  if (!host || !database) return null;

  return {
    host,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database,
  };
}

async function main() {
  const config = resolveConnection();
  if (!config || !config.database) {
    console.error(
      '未配置数据库连接。请设置 MYSQL_URL（或 DATABASE_URL），或提供 MYSQL_HOST / MYSQL_DATABASE 等分项变量'
    );
    process.exit(1);
  }

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log('migrations 目录不存在，跳过。');
    return;
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('没有迁移文件。');
    return;
  }

  let connection;
  try {
    connection = await mysql.createConnection({
      ...config,
      charset: 'utf8mb4_unicode_ci',
      multipleStatements: true,
    });

    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8').trim();
      if (!sql) continue;

      process.stdout.write(`执行 ${file} ... `);
      await connection.query(sql);
      console.log('完成');
    }

    console.log(`\n全部迁移执行完毕（${files.length} 个文件）。`);
  } catch (error) {
    console.error('\n迁移失败:', error.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

main();
