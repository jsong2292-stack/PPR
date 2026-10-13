import { NextResponse } from 'next/server';
import { checkDatabaseConnection } from '@/storage/database/db';
import { queryOne } from '@/storage/database/mysql-client';

/** 测试数据库连通性 */
export async function POST() {
  try {
    const dbStatus = await checkDatabaseConnection();

    if (!dbStatus.available) {
      return NextResponse.json({
        success: false,
        error: dbStatus.error || '数据库连接失败',
      });
    }

    // 顺带探测核心表是否存在，给出更明确的下一步指引
    try {
      await queryOne('SELECT id FROM users LIMIT 1');
    } catch {
      return NextResponse.json({
        success: true,
        message: '数据库连接成功（数据表尚未创建）',
        tablesReady: false,
      });
    }

    return NextResponse.json({
      success: true,
      message: '数据库连接成功',
      tablesReady: true,
    });
  } catch (error) {
    console.error('[Install] test-db error:', error);
    return NextResponse.json({
      success: false,
      error: `数据库连接失败: ${error instanceof Error ? error.message : '未知错误'}`,
    });
  }
}
