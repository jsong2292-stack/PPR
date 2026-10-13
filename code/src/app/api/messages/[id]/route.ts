import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, queryAll } from '@/storage/database/mysql-client';
import { getCurrentUser } from '@/lib/auth';

interface ConversationRow {
  id: number;
  user1_id: string;
  user2_id: string;
  [key: string]: unknown;
}

/** 读取会话内的私信（倒序分页后翻转为正序），顺带把发给自己的消息标为已读 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

    const conversation = await queryOne<ConversationRow>(
      'SELECT id, user1_id, user2_id FROM conversations WHERE id = $1',
      [parseInt(id, 10)]
    );

    if (!conversation) return NextResponse.json({ error: '会话不存在' }, { status: 404 });
    if (conversation.user1_id !== user.id && conversation.user2_id !== user.id) {
      return NextResponse.json({ error: '无权访问该会话' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = 20;
    const offset = (page - 1) * pageSize;

    const messages = await queryAll(
      `SELECT id, content, sender_id, receiver_id, is_read, created_at
         FROM private_messages
        WHERE conversation_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      [conversation.id, pageSize, offset]
    );

    await query(
      `UPDATE private_messages
          SET is_read = true
        WHERE conversation_id = $1 AND receiver_id = $2 AND is_read = false`,
      [conversation.id, user.id]
    );

    return NextResponse.json({
      messages: (messages || []).reverse(),
      page,
      hasMore: (messages?.length || 0) === pageSize,
    });
  } catch (error) {
    console.error('[Conversations] get messages error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

/**
 * 发送私信
 * Body: { content }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

    const { content } = await request.json();
    if (!content || !String(content).trim()) {
      return NextResponse.json({ error: '消息内容不能为空' }, { status: 400 });
    }
    if (String(content).length > 2000) {
      return NextResponse.json({ error: '消息内容不能超过 2000 字' }, { status: 400 });
    }

    const conversation = await queryOne<ConversationRow>(
      'SELECT id, user1_id, user2_id FROM conversations WHERE id = $1',
      [parseInt(id, 10)]
    );

    if (!conversation) return NextResponse.json({ error: '会话不存在' }, { status: 404 });
    if (conversation.user1_id !== user.id && conversation.user2_id !== user.id) {
      return NextResponse.json({ error: '无权访问该会话' }, { status: 403 });
    }

    const receiverId =
      conversation.user1_id === user.id ? conversation.user2_id : conversation.user1_id;
    const text = String(content).trim();

    const insertResult = await query(
      `INSERT INTO private_messages (conversation_id, sender_id, receiver_id, content)
       VALUES ($1, $2, $3, $4)`,
      [conversation.id, user.id, receiverId, text]
    );
    const message = await queryOne('SELECT * FROM private_messages WHERE id = $1', [
      insertResult.insertId,
    ]);

    await query(
      `UPDATE conversations SET last_message = $1, last_message_at = NOW() WHERE id = $2`,
      [text.substring(0, 100), conversation.id]
    );

    return NextResponse.json({ success: true, message });
  } catch (error) {
    console.error('[Conversations] send message error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
