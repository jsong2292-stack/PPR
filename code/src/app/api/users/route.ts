import { NextRequest, NextResponse } from 'next/server';
import { queryAll } from '@/storage/database/mysql-client';
import { requireUser } from '@/lib/auth';
import { failFrom } from '@/lib/api';

/**
 * 用户检索（供发起私信时选择联系人）
 * GET /api/users?keyword=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const currentUser = await requireUser();
    const keyword = new URL(request.url).searchParams.get('keyword') || '';
    const limit = Math.min(50, Number(new URL(request.url).searchParams.get('limit') || 20));

    const values: unknown[] = [currentUser.id];
    let where = 'WHERE id <> $1 AND status = $2';
    values.push('active');

    if (keyword) {
      values.push(`%${keyword}%`);
      where += ` AND (nickname LIKE $${values.length} OR phone LIKE $${values.length})`;
    }

    const users = await queryAll<{ id: string; nickname: string; avatar: string | null }>(
      `SELECT id, nickname, avatar
         FROM users
         ${where}
        ORDER BY created_at DESC
        LIMIT ${limit}`,
      values
    );

    return NextResponse.json({ users });
  } catch (error) {
    return failFrom(error);
  }
}
