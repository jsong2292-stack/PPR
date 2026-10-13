import { NextResponse } from 'next/server';
import { checkDatabaseConnection } from '@/storage/database/db';

/** 健康检查：进程存活 + 数据库连通性（供探活 / 监控使用） */
export async function GET() {
  const db = await checkDatabaseConnection();

  return NextResponse.json(
    {
      status: 'ok',
      timestamp: Date.now(),
      database: { available: db.available, type: db.type, error: db.error },
    },
    { status: 200 }
  );
}
