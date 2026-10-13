import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit 配置（仅用于按 schema.ts 生成 SQL 迁移草稿）
 *
 *   pnpm db:generate
 *
 * 运行时统一使用原生 SQL（src/storage/database/mysql-client.ts），
 * 生成的 SQL 需要人工复核后再放入 scripts/migrations/。
 */
export default defineConfig({
  schema: './src/storage/database/shared/schema.ts',
  out: './scripts/migrations',
  dialect: 'mysql',
  dbCredentials: {
    url: process.env.MYSQL_URL || process.env.DATABASE_URL || '',
  },
  verbose: true,
  strict: false,
});
