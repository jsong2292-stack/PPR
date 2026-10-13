import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, queryAll } from '@/storage/database/mysql-client';
import { requireAdmin } from '@/lib/auth';
import { failFrom } from '@/lib/api';

/** 用户列表（分页 + 关键词 / 角色 / 状态筛选），仅管理员 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));
    const keyword = searchParams.get('keyword') || '';
    const role = searchParams.get('role') || '';
    const status = searchParams.get('status') || '';
    const offset = (page - 1) * pageSize;

    const conditions = ['1 = 1'];
    const params: (string | number)[] = [];

    if (keyword) {
      params.push(`%${keyword}%`);
      const i = params.length;
      conditions.push(
        `(nickname LIKE $${i} OR phone LIKE $${i} OR email LIKE $${i})`
      );
    }
    if (role) {
      params.push(role);
      conditions.push(`role = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    const where = conditions.join(' AND ');

    const countRow = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM users WHERE ${where}`,
      params
    );
    const total = parseInt(countRow?.count || '0', 10);

    const users = await queryAll(
      `SELECT id, phone, email, nickname, avatar, industry, expertise, bio,
              role, status, auth_provider, last_login_at, created_at, updated_at
         FROM users
        WHERE ${where}
        ORDER BY created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );

    return NextResponse.json({
      users: users || [],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    return failFrom(error);
  }
}

/**
 * 更新用户状态 / 角色（仅管理员）
 * Body: { userId, status?, role? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const currentUser = await requireAdmin();
    const { userId, status, role } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: '请指定用户' }, { status: 400 });
    }
    if (userId === currentUser.id && role) {
      return NextResponse.json({ error: '不能修改自己的角色' }, { status: 400 });
    }
    if (role && !['user', 'admin'].includes(role)) {
      return NextResponse.json({ error: '角色取值不合法' }, { status: 400 });
    }
    if (status && !['active', 'frozen', 'disabled', 'deleted'].includes(status)) {
      return NextResponse.json({ error: '状态取值不合法' }, { status: 400 });
    }

    const updates: string[] = [];
    const params: (string | number)[] = [];

    if (status) {
      params.push(status);
      updates.push(`status = $${params.length}`);
    }
    if (role) {
      params.push(role);
      updates.push(`role = $${params.length}`);
    }
    if (updates.length === 0) {
      return NextResponse.json({ error: '没有要更新的内容' }, { status: 400 });
    }

    params.push(userId);
    await query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`,
      params
    );

    return NextResponse.json({ success: true, message: '更新成功' });
  } catch (error) {
    return failFrom(error);
  }
}

/** 软删除用户（status = deleted），仅管理员 */
export async function DELETE(request: NextRequest) {
  try {
    const currentUser = await requireAdmin();
    const userId = new URL(request.url).searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: '请指定用户' }, { status: 400 });
    }
    if (userId === currentUser.id) {
      return NextResponse.json({ error: '不能删除自己' }, { status: 400 });
    }

    await query("UPDATE users SET status = 'deleted', updated_at = NOW() WHERE id = $1", [
      userId,
    ]);

    return NextResponse.json({ success: true, message: '删除成功' });
  } catch (error) {
    return failFrom(error);
  }
}
