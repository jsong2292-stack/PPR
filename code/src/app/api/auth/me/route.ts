import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { queryOne } from '@/storage/database/mysql-client';

/** 获取当前登录用户信息（前端 AuthProvider / Navbar 依赖此接口） */
export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ user: null }, { status: 200 });
    }

    const [followerResult, followingResult] = await Promise.all([
      queryOne<{ count: string }>('SELECT COUNT(*) as count FROM follows WHERE following_id = $1', [user.id]),
      queryOne<{ count: string }>('SELECT COUNT(*) as count FROM follows WHERE follower_id = $1', [user.id]),
    ]);

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.phone,
        phone: user.phone,
        email: user.email,
        nickname: user.nickname,
        avatar: user.avatar,
        industry: user.industry,
        expertise: user.expertise,
        bio: user.bio,
        role: user.role,
        authProvider: user.authProvider,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        followerCount: parseInt(followerResult?.count || '0', 10),
        followingCount: parseInt(followingResult?.count || '0', 10),
      },
    });
  } catch (error) {
    console.error('[Auth] me error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
