import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { query, queryOne } from '@/storage/database/mysql-client';
import { hashPassword, validateUsername } from '@/lib/auth';

/** 查询是否已存在管理员账号 */
export async function GET() {
  try {
    const existingAdmin = await queryOne<{
      id: string;
      nickname: string;
      phone: string;
      role: string;
    }>("SELECT id, nickname, phone, role FROM users WHERE role = 'admin' LIMIT 1");

    return NextResponse.json({
      hasAdmin: Boolean(existingAdmin),
      admin: existingAdmin
        ? { id: existingAdmin.id, nickname: existingAdmin.nickname, phone: existingAdmin.phone }
        : null,
    });
  } catch (error) {
    console.error('[Admin] init check error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

/**
 * 创建初始管理员账号（仅在系统中没有任何管理员时可用）
 * Body: { username, nickname, password }
 */
export async function POST(request: NextRequest) {
  try {
    const { username, nickname, password } = await request.json();

    if (!username || !username.trim()) {
      return NextResponse.json({ error: '请输入用户名' }, { status: 400 });
    }
    if (!validateUsername(username.trim())) {
      return NextResponse.json(
        { error: '用户名需为 3-20 位字母、数字或下划线' },
        { status: 400 }
      );
    }
    if (!nickname || !nickname.trim()) {
      return NextResponse.json({ error: '请输入昵称' }, { status: 400 });
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ error: '密码至少需要 6 个字符' }, { status: 400 });
    }

    const existingAdmin = await queryOne("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    if (existingAdmin) {
      return NextResponse.json({ error: '管理员账号已存在，无法重复创建' }, { status: 400 });
    }

    const existingUser = await queryOne('SELECT id FROM users WHERE phone = $1', [username.trim()]);
    if (existingUser) {
      return NextResponse.json({ error: '该用户名已被使用' }, { status: 400 });
    }

    const hashedPassword = await hashPassword(password);
    const newAdminId = randomUUID();
    await query(
      `INSERT INTO users (id, phone, nickname, password, role, status, auth_provider)
       VALUES ($1, $2, $3, $4, 'admin', 'active', 'local')`,
      [newAdminId, username.trim(), nickname.trim(), hashedPassword]
    );

    return NextResponse.json({
      success: true,
      message: '管理员账号创建成功',
      admin: { id: newAdminId, phone: username.trim(), nickname: nickname.trim(), role: 'admin' },
    });
  } catch (error) {
    console.error('[Admin] init error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

/** 重置指定用户密码（仅用于应急运维，建议后续加权限校验或改为 CLI 脚本） */
export async function PUT(request: NextRequest) {
  try {
    const { username, password } = await request.json();
    if (!username || !password || password.length < 6) {
      return NextResponse.json({ error: '参数错误' }, { status: 400 });
    }

    const hashedPassword = await hashPassword(password);
    const result = await query(
      'UPDATE users SET password = $1, login_fail_count = 0, frozen_until = NULL, updated_at = NOW() WHERE phone = $2',
      [hashedPassword, username]
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Admin] reset password error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

/** 需要动态执行，避免构建期静态化 */
export const dynamic = 'force-dynamic';
