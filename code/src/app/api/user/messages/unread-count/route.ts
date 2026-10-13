import { NextResponse } from 'next/server';
import { queryOne } from '@/storage/database/mysql-client';
import { getCurrentUser } from '@/lib/auth';

/** 未读通知数量（Navbar 每 60s 轮询） */
export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ unreadCount: 0 });

    const result = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM messages WHERE user_id = $1 AND is_read = false`,
      [currentUser.id]
    );

    return NextResponse.json({ unreadCount: parseInt(result?.count || '0', 10) });
  } catch (error) {
    console.error('[Messages] unread count error:', error);
    return NextResponse.json({ unreadCount: 0 });
  }
}
