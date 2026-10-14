/**
 * 一次性备份脚本：把 ppr_* 业务表导出成可回滚的 .sql（SHOW CREATE TABLE + INSERT）。
 * 用法：node scripts/demo-data/backup-ppr-tables.mjs [输出文件]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';

const envText = await fs.readFile(path.join(process.cwd(), '.env.local'), 'utf8');
const dsn = envText.split('\n').map((line) => line.trim()).find((line) => line.startsWith('MYSQL_URL=')).slice('MYSQL_URL='.length);
const url = new URL(dsn);
const connection = await mysql.createConnection({
  host: url.hostname, port: Number(url.port || 3306), user: url.username,
  password: decodeURIComponent(url.password), database: url.pathname.slice(1),
});

const [tables] = await connection.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE' AND Tables_in_" + url.pathname.slice(1) + " LIKE 'ppr\\_%'");
const names = tables.map((row) => Object.values(row)[0]).sort();
const out = [`-- ppr_* 备份 ${new Date().toISOString()}`, 'SET NAMES utf8mb4;', 'SET FOREIGN_KEY_CHECKS=0;', ''];
let total = 0;
for (const name of names) {
  const [ddl] = await connection.query(`SHOW CREATE TABLE \`${name}\``);
  out.push(`DROP TABLE IF EXISTS \`${name}\`;`, ddl[0]['Create Table'] + ';');
  const [rows] = await connection.query(`SELECT * FROM \`${name}\``);
  if (rows.length) {
    const columns = Object.keys(rows[0]);
    const values = rows.map((row) => `(${columns.map((column) => mysql.escape(row[column])).join(',')})`);
    out.push(`INSERT INTO \`${name}\` (${columns.map((c) => `\`${c}\``).join(',')}) VALUES`, values.join(',\n') + ';');
  }
  out.push('');
  total += rows.length;
  console.log(`${name}: ${rows.length} 行`);
}
out.push('SET FOREIGN_KEY_CHECKS=1;');
const target = process.argv[2] ?? path.join(process.cwd(), '..', '测试数据', `回滚备份-批次号模型改造-${new Date().toISOString().slice(0, 10)}.sql`);
await fs.writeFile(target, out.join('\n'), 'utf8');
console.log(`已写入 ${target}（共 ${names.length} 张表 / ${total} 行）`);
await connection.end();
