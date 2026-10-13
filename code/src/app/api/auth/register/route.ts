import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { query, queryOne } from '@/storage/database/mysql-client';
import { hashPassword, setSessionCookie, validateUsername } from '@/lib/auth';
import { getConfigValue } from '@/lib/system-config';

/**
 * 用户注册
 * Body: { username, password, nickname, email?, avatar? }
 */
export async function POST(request: NextRequest) {
  try {
    // 注册开关由系统设置控制
    const enableRegister = await getConfigValue('enable_register');
    if (enableRegister !== 'true') {
      return NextResponse.json({ error: '注册功能已关闭，请联系管理员' }, { status: 403 });
    }

    const body = await request.json();
    const { username, password, nickname, email, avatar } = body;

    if (!username || !password || !nickname) {
      return NextResponse.json({ error: '请填写用户名、密码和昵称' }, { status: 400 });
    }

    if (!validateUsername(username)) {
      return NextResponse.json(
        { error: '用户名需为 3-20 位字母、数字或下划线' },
        { status: 400 }
      );
    }

    if (String(password).length < 6) {
      return NextResponse.json({ error: '密码至少需要 6 个字符' }, { status: 400 });
    }

    if (nickname.length < 2 || nickname.length > 20) {
      return NextResponse.json({ error: '昵称长度应为 2-20 个字符' }, { status: 400 });
    }

    const existing = await queryOne<{ id: string }>('SELECT id FROM users WHERE phone = $1', [
      username,
    ]);
    if (existing) {
      return NextResponse.json({ error: '该用户名已被使用' }, { status: 400 });
    }

    if (email) {
      const existingEmail = await queryOne<{ id: string }>(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );
      if (existingEmail) {
        return NextResponse.json({ error: '该邮箱已被使用' }, { status: 400 });
      }
    }

    const hashedPassword = await hashPassword(password);

    // 第一个注册的用户自动成为管理员，便于新项目开箱即用
    const adminCount = await queryOne<{ count: string }>(
      "SELECT COUNT(*) as count FROM users WHERE role = 'admin'"
    );
    const role = parseInt(adminCount?.count || '0', 10) === 0 ? 'admin' : 'user';

    const newUserId = randomUUID();
    await query(
      `INSERT INTO users (id, phone, email, password, nickname, avatar, status, role, auth_provider)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, 'local')`,
      [newUserId, username, email || null, hashedPassword, nickname, avatar || null, role]
    );

    const response = NextResponse.json({
      success: true,
      user: {
        id: newUserId,
        username,
        nickname,
        avatar: avatar || null,
        role,
      },
    });
    setSessionCookie(response, newUserId, false, { authProvider: 'local' });
    return response;
  } catch (error) {
    console.error('[Auth] register error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
