import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, queryAll } from '@/storage/database/mysql-client';
import { getCurrentUser } from '@/lib/auth';

/** 当前用户的私信会话列表 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

    const rows = await queryAll<{
      id: number;
      last_message: string | null;
      last_message_at: string | null;
      created_at: string;
      user1_id: string;
      user2_id: string;
    }>(
      `SELECT id, last_message, last_message_at, created_at, user1_id, user2_id
         FROM conversations
        WHERE user1_id = $1 OR user2_id = $1
        ORDER BY (last_message_at IS NULL), last_message_at DESC, created_at DESC`,
      [user.id]
    );

    const conversations = await Promise.all(
      rows.map(async (conv) => {
        const otherUserId = conv.user1_id === user.id ? conv.user2_id : conv.user1_id;

        const otherUser = await queryOne<{ id: string; nickname: string; avatar: string | null }>(
          'SELECT id, nickname, avatar FROM users WHERE id = $1',
          [otherUserId]
        );

        const unread = await queryOne<{ count: string }>(
          `SELECT COUNT(*) as count
             FROM private_messages
            WHERE conversation_id = $1 AND receiver_id = $2 AND is_read = false`,
          [conv.id, user.id]
        );

        return { ...conv, otherUser, unreadCount: parseInt(unread?.count || '0', 10) };
      })
    );

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error('[Conversations] list error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

/**
 * 创建（或复用）与目标用户的会话
 * Body: { targetUserId }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

    const { targetUserId } = await request.json();

    if (!targetUserId) {
      return NextResponse.json({ error: '请指定对话用户' }, { status: 400 });
    }
    if (targetUserId === user.id) {
      return NextResponse.json({ error: '不能和自己发起对话' }, { status: 400 });
    }

    const targetUser = await queryOne<{ id: string; nickname: string; avatar: string | null }>(
      'SELECT id, nickname, avatar FROM users WHERE id = $1',
      [targetUserId]
    );
    if (!targetUser) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    // 统一按字典序存放两个用户 ID，保证同一对用户只有一条会话记录
    const [user1Id, user2Id] = [user.id, targetUserId].sort();

    const existing = await queryOne(
      'SELECT * FROM conversations WHERE user1_id = $1 AND user2_id = $2',
      [user1Id, user2Id]
    );
    if (existing) {
      return NextResponse.json({ conversation: existing, otherUser: targetUser });
    }

    const insertResult = await query(
      'INSERT INTO conversations (user1_id, user2_id, last_message_at) VALUES ($1, $2, NOW())',
      [user1Id, user2Id]
    );
    const created = await queryOne('SELECT * FROM conversations WHERE id = $1', [
      insertResult.insertId,
    ]);

    return NextResponse.json({ conversation: created, otherUser: targetUser });
  } catch (error) {
    console.error('[Conversations] create error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
