import { NextResponse } from 'next/server';
import { queryAll } from '@/storage/database/mysql-client';
import { hasDatabaseUrl } from '@/lib/env';

/**
 * 数据库自检：确认连接串可读、连接可用、核心表存在。
 * 访问 /api/test-db 可快速判断部署环境是否配置正确。
 */
export async function GET() {
  if (!hasDatabaseUrl()) {
    return NextResponse.json(
      {
        success: false,
        error: '未配置数据库连接串，请设置 MYSQL_URL（或 DATABASE_URL）',
      },
      { status: 500 }
    );
  }

  try {
    const version = await queryAll<{ version: string }>('SELECT VERSION() as version');
    const tables = await queryAll<{ table_name: string }>(
      `SELECT table_name AS table_name FROM information_schema.tables
        WHERE table_schema = DATABASE()
        ORDER BY table_name`
    );

    return NextResponse.json({
      success: true,
      method: 'MySQL 直连（mysql2 连接池 + 原生 SQL）',
      server: version[0]?.version?.split(' ').slice(0, 2).join(' '),
      tables: tables.map((t) => t.table_name),
    });
  } catch (error) {
    console.error('[TestDB] error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}
