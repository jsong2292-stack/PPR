import { NextResponse } from 'next/server';
import { query } from '@/storage/database/mysql-client';
import { getCurrentUser } from '@/lib/auth';

/** 一键全部已读 */
export async function POST() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: '请先登录' }, { status: 401 });

    await query('UPDATE messages SET is_read = true WHERE user_id = $1 AND is_read = false', [
      currentUser.id,
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Messages] read all error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
