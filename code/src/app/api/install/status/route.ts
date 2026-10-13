import { NextResponse } from 'next/server';
import { checkDatabaseConnection } from '@/storage/database/db';
import { queryOne } from '@/storage/database/mysql-client';

/** 安装向导状态：数据库是否可用、是否已存在管理员账号 */
export async function GET() {
  try {
    const dbStatus = await checkDatabaseConnection();

    if (!dbStatus.available) {
      return NextResponse.json({
        installed: false,
        needsConfig: true,
        error: dbStatus.error || '数据库连接失败',
        dbType: dbStatus.type,
      });
    }

    const admin = await queryOne<{ id: string }>(
      "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
    );

    return NextResponse.json({ installed: Boolean(admin) });
  } catch (error) {
    console.error('[Install] status error:', error);
    return NextResponse.json({
      installed: false,
      needsConfig: true,
      error: error instanceof Error ? error.message : '未知错误',
    });
  }
}
