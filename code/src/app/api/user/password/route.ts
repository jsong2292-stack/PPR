import { NextRequest, NextResponse } from 'next/server';
import { queryOne, query } from '@/storage/database/mysql-client';
import { getCurrentUser, hashPassword, verifyPassword } from '@/lib/auth';

/**
 * 修改当前用户密码
 * Body: { oldPassword, newPassword }
 */
export async function PUT(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: '请先登录' }, { status: 401 });

    const body = await request.json();
    const { oldPassword, newPassword } = body;

    if (!oldPassword || !newPassword) {
      return NextResponse.json({ error: '请填写完整信息' }, { status: 400 });
    }

    if (String(newPassword).length < 8) {
      return NextResponse.json({ error: '新密码长度至少 8 位' }, { status: 400 });
    }

    if (oldPassword === newPassword) {
      return NextResponse.json({ error: '新密码不能与原密码相同' }, { status: 400 });
    }

    const user = await queryOne<{ id: string; password: string | null }>(
      'SELECT id, password FROM users WHERE id = $1',
      [currentUser.id]
    );

    if (!user) return NextResponse.json({ error: '用户不存在' }, { status: 404 });

    if (!user.password) {
      return NextResponse.json(
        { error: '当前账号通过单点登录创建，未设置本地密码' },
        { status: 400 }
      );
    }

    const isValid = await verifyPassword(oldPassword, user.password);
    if (!isValid) {
      return NextResponse.json({ error: '原密码错误' }, { status: 400 });
    }

    const hashedPassword = await hashPassword(newPassword);
    await query('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [
      hashedPassword,
      currentUser.id,
    ]);

    return NextResponse.json({ success: true, message: '密码修改成功' });
  } catch (error) {
    console.error('[User] update password error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
