import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/storage/database/mysql-client';
import { getCurrentUser } from '@/lib/auth';

/** 标记单条通知为已读 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: '请先登录' }, { status: 401 });

    const message = await queryOne<{ id: number }>(
      'SELECT id FROM messages WHERE id = $1 AND user_id = $2',
      [parseInt(id, 10), currentUser.id]
    );

    if (!message) {
      return NextResponse.json({ error: '消息不存在' }, { status: 404 });
    }

    await query('UPDATE messages SET is_read = true WHERE id = $1', [message.id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Messages] mark read error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
