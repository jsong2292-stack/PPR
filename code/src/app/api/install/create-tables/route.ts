import { NextResponse } from 'next/server';
import { checkDatabaseConnection } from '@/storage/database/db';
import { queryOne } from '@/storage/database/mysql-client';

/** 脚手架必需的数据表 */
const REQUIRED_TABLES = [
  'users',
  'follows',
  'messages',
  'conversations',
  'private_messages',
  'uploaded_files',
  'user_behaviors',
  'audits',
  'system_config',
];

/** 检查数据表是否齐全（建表由 scripts/init-db.sql 完成） */
export async function POST() {
  try {
    const dbStatus = await checkDatabaseConnection();
    if (!dbStatus.available) {
      return NextResponse.json({
        success: false,
        needsConfig: true,
        error: dbStatus.error || '数据库连接失败',
      });
    }

    const existingTables: string[] = [];
    const missingTables: string[] = [];

    for (const table of REQUIRED_TABLES) {
      const result = await queryOne<{ exists: number }>(
        `SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = DATABASE() AND table_name = $1
         ) as \`exists\``,
        [table]
      );
      if (result?.exists) existingTables.push(table);
      else missingTables.push(table);
    }

    if (missingTables.length > 0) {
      return NextResponse.json({
        success: false,
        error: `缺少数据表: ${missingTables.join(', ')}。请先执行 scripts/init-db.sql`,
        existingTables,
        missingTables,
      });
    }

    return NextResponse.json({
      success: true,
      message: '所有数据表已就绪',
      tables: existingTables,
    });
  } catch (error) {
    console.error('[Install] create-tables error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '检查数据表失败',
    });
  }
}
