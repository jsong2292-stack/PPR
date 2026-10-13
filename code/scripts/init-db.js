/**
 * 数据库初始化脚本（MySQL）
 *
 * 读取 scripts/init-db.sql 并执行，随后依次执行 scripts/migrations/*.sql。
 * 用法：node scripts/init-db.js
 */
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// 尽量从 .env.local / .env 读取连接串
try {
  require('dotenv').config({ path: '.env.local' });
  require('dotenv').config();
} catch {
  // dotenv 不可用时依赖进程环境变量
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

async function runMigrations(connection) {
  if (!fs.existsSync(MIGRATIONS_DIR)) return;

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('没有需要执行的迁移文件。');
    return;
  }

  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8').trim();
    if (!sql) continue;

    console.log(`执行迁移: ${file}`);
    await connection.query(sql);
  }
  console.log(`迁移完成，共 ${files.length} 个文件。`);
}

async function initDatabase() {
  const config = resolveConnection();
  if (!config || !config.database) {
    console.error(
      '未配置数据库连接。请设置 MYSQL_URL（或 DATABASE_URL），或提供 MYSQL_HOST / MYSQL_DATABASE 等分项变量'
    );
    process.exit(1);
  }

  let connection;
  try {
    console.log(`正在连接 MySQL: ${config.user}@${config.host}:${config.port}/${config.database} ...`);
    connection = await mysql.createConnection({
      ...config,
      charset: 'utf8mb4_unicode_ci',
      multipleStatements: true,
    });
    console.log('连接成功');

    const sql = fs.readFileSync(path.join(__dirname, 'init-db.sql'), 'utf8');
    console.log('正在执行 scripts/init-db.sql ...');
    await connection.query(sql);
    console.log('基础表创建完成');

    await runMigrations(connection);

    const [rows] = await connection.query(
      `SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = DATABASE()`
    );
    console.log(`当前数据库下共 ${rows[0].count} 张表。`);
    console.log('');
    console.log('下一步：pnpm dev 启动系统；本地演示账号 admin / Admin@123。');
  } catch (error) {
    console.error('数据库初始化失败:', error.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

initDatabase();
