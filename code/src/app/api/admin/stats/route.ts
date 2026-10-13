import { NextResponse } from 'next/server';
import { queryAll } from '@/storage/database/mysql-client';
import { requireAdmin } from '@/lib/auth';
import { failFrom } from '@/lib/api';

/** 后台首页概览数据 */
export async function GET() {
  try {
    await requireAdmin();

    const one = async (sql: string, values?: unknown[]): Promise<number> => {
      const rows = await queryAll<{ count: string }>(sql, values);
      return parseInt(rows[0]?.count || '0', 10);
    };

    const [totalUsers, activeUsers, adminUsers, totalMessages, unreadMessages, totalFiles, totalStorage] =
      await Promise.all([
        one('SELECT COUNT(*) as count FROM users'),
        one("SELECT COUNT(*) as count FROM users WHERE status = 'active'"),
        one("SELECT COUNT(*) as count FROM users WHERE role = 'admin'"),
        one('SELECT COUNT(*) as count FROM messages'),
        one('SELECT COUNT(*) as count FROM messages WHERE is_read = false'),
        one('SELECT COUNT(*) as count FROM uploaded_files'),
        queryAll<{ total: string | null }>('SELECT SUM(size) as total FROM uploaded_files'),
      ]);

    const storageBytes = parseInt(String(totalStorage[0]?.total || '0'), 10);

    // 最近 7 天每日新增用户，用于后台趋势图
    const userTrend = await queryAll<{ day: string; count: string }>(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') as day, COUNT(*) as count
         FROM users
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY day
        ORDER BY day`
    );

    return NextResponse.json({
      stats: {
        totalUsers,
        activeUsers,
        adminUsers,
        totalMessages,
        unreadMessages,
        totalFiles,
        storageBytes,
      },
      userTrend: userTrend.map((r) => ({ day: r.day, count: parseInt(r.count, 10) })),
    });
  } catch (error) {
    return failFrom(error);
  }
}
