import { NextRequest, NextResponse } from 'next/server';
import { queryOne, query } from '@/storage/database/mysql-client';
import {
  verifyPassword,
  setSessionCookie,
  isAccountFrozen,
  handleLoginFail,
  resetLoginFailCount,
} from '@/lib/auth';

interface UserRow {
  id: string;
  phone: string | null;
  email: string | null;
  nickname: string;
  avatar: string | null;
  role: string;
  status: string;
  password: string | null;
  [key: string]: unknown;
}

/**
 * 账号密码登录
 * Body: { username | phone, password, remember? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // username 与 phone 二者取其一，兼容旧前端
    const identifier = (body.username || body.phone || '').trim();
    const { password, remember } = body;

    if (!identifier) {
      return NextResponse.json({ error: '请输入用户名' }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: '请输入密码' }, { status: 400 });
    }

    // 先按登录账号（phone 字段）查询，再按邮箱 / 昵称兜底
    let user = await queryOne<UserRow>('SELECT * FROM users WHERE phone = $1', [identifier]);
    if (!user) {
      user = await queryOne<UserRow>('SELECT * FROM users WHERE email = $1', [identifier]);
    }
    if (!user) {
      user = await queryOne<UserRow>('SELECT * FROM users WHERE nickname = $1', [identifier]);
    }

    if (!user) {
      // 不区分「用户不存在」与「密码错误」，避免账号枚举
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 400 });
    }

    if (user.status === 'frozen' && (await isAccountFrozen(user.id))) {
      return NextResponse.json({ error: '账号已被冻结，请稍后再试' }, { status: 403 });
    }

    if (user.status === 'deleted') {
      return NextResponse.json({ error: '账号已被注销' }, { status: 403 });
    }

    if (user.status === 'disabled') {
      return NextResponse.json({ error: '账号已被停用，请联系管理员' }, { status: 403 });
    }

    // 单点登录创建的账号可能没有本地密码
    if (!user.password) {
      return NextResponse.json(
        { error: '该账号未设置密码，请使用单点登录登录' },
        { status: 400 }
      );
    }

    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      await handleLoginFail(user.id);
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 400 });
    }

    await resetLoginFailCount(user.id);
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.phone,
        phone: user.phone,
        email: user.email,
        nickname: user.nickname,
        avatar: user.avatar,
        role: user.role,
      },
    });
    setSessionCookie(response, user.id, Boolean(remember), { authProvider: 'local' });
    return response;
  } catch (error) {
    console.error('[Auth] login error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
