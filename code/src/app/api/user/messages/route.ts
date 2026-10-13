import { NextRequest, NextResponse } from 'next/server';
import { queryAll } from '@/storage/database/mysql-client';
import { getCurrentUser } from '@/lib/auth';
import { parsePagination } from '@/lib/api';

/** 当前用户的站内通知列表（分页） */
export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: '请先登录' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const { page, pageSize, offset } = parsePagination(searchParams);
    const type = searchParams.get('type');
    const unreadOnly = searchParams.get('unread') === 'true';

    const conditions = ['user_id = $1'];
    const values: unknown[] = [currentUser.id];

    if (type) {
      values.push(type);
      conditions.push(`type = $${values.length}`);
    }
    if (unreadOnly) {
      conditions.push('is_read = false');
    }

    const where = conditions.join(' AND ');

    const countRows = await queryAll<{ total: string }>(
      `SELECT COUNT(*) as total FROM messages WHERE ${where}`,
      values
    );
    const total = parseInt(countRows[0]?.total || '0', 10);

    const rows = await queryAll(
      `SELECT id, type, title, content, related_id, related_type, is_read, created_at
         FROM messages
        WHERE ${where}
        ORDER BY created_at DESC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset]
    );

    return NextResponse.json({
      messages: rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        hasMore: offset + pageSize < total,
      },
    });
  } catch (error) {
    console.error('[Messages] list error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
