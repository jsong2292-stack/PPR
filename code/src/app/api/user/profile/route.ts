import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/storage/database/mysql-client';
import { getCurrentUser } from '@/lib/auth';
import { validateEmail } from '@/lib/auth';

/** 当前用户资料 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

    return NextResponse.json({
      profile: {
        id: user.id,
        username: user.phone,
        nickname: user.nickname,
        email: user.email,
        avatar: user.avatar,
        industry: user.industry,
        expertise: user.expertise,
        bio: user.bio,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('[User] get profile error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

/**
 * 更新当前用户资料
 * Body: { nickname?, email?, industry?, expertise?, bio?, avatar? }
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const body = await request.json();
    const { nickname, email, industry, expertise, bio, avatar } = body;

    if (nickname !== undefined && (nickname.length < 2 || nickname.length > 20)) {
      return NextResponse.json({ error: '昵称长度应为 2-20 个字符' }, { status: 400 });
    }

    if (email && !validateEmail(email)) {
      return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 });
    }

    if (bio !== undefined && String(bio).length > 500) {
      return NextResponse.json({ error: '个人简介不能超过 500 字' }, { status: 400 });
    }

    // 仅更新请求体中显式出现的字段，未传字段保持原值
    const updates: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let paramIndex = 1;

    const assign = (column: string, value: unknown) => {
      updates.push(`${column} = $${paramIndex++}`);
      values.push(value);
    };

    if (nickname !== undefined) assign('nickname', nickname);
    if (email !== undefined) assign('email', email || null);
    if (industry !== undefined) assign('industry', industry || null);
    if (expertise !== undefined) assign('expertise', expertise || null);
    if (bio !== undefined) assign('bio', bio || null);
    if (avatar !== undefined) assign('avatar', avatar || null);

    values.push(user.id);
    await query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[User] update profile error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
