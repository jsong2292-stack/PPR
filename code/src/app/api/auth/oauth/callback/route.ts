import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { queryOne, query } from '@/storage/database/mysql-client';
import { setSessionCookie } from '@/lib/auth';
import {
  exchangeCodeForToken,
  getUserInfo,
  isOAuthConfigured,
  oauthProvider,
  verifyState,
} from '@/lib/oauth-config';

export const runtime = 'nodejs';

interface UserRow {
  id: string;
  phone: string | null;
  email: string | null;
  nickname: string;
  avatar: string | null;
  role: string;
  status: string;
  externalId: string | null;
  [key: string]: unknown;
}

/** 登录失败时统一回到登录页并带上错误提示 */
function redirectToLogin(request: NextRequest, message: string): NextResponse {
  const url = new URL('/login', request.nextUrl.origin);
  url.searchParams.set('error', message);
  return NextResponse.redirect(url);
}

/**
 * 单点登录回调：授权码换 token → 拉取用户信息 → 本地建档 / 匹配 → 下发 Session
 */
export async function GET(request: NextRequest) {
  if (!isOAuthConfigured()) {
    return redirectToLogin(request, '单点登录尚未配置');
  }

  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');

  if (errorParam) {
    return redirectToLogin(request, `单点登录被拒绝：${searchParams.get('error_description') || errorParam}`);
  }

  if (!code || !state) {
    return redirectToLogin(request, '单点登录回调参数不完整');
  }

  if (!verifyState(state)) {
    return redirectToLogin(request, '单点登录状态校验失败，请重试');
  }

  // 回跳地址由 /api/auth/oauth/login 写入的短期 Cookie 提供
  const rawRedirect = request.cookies.get('oauth_redirect')?.value;
  const redirectTo = rawRedirect ? decodeURIComponent(rawRedirect) : '/';

  try {
    const token = await exchangeCodeForToken(code);
    if (!token?.access_token) {
      return redirectToLogin(request, '单点登录换取令牌失败');
    }

    const info = await getUserInfo(token.access_token);
    if (!info?.id) {
      return redirectToLogin(request, '单点登录未返回有效的用户信息');
    }

    // 1) 优先按外部用户标识匹配
    let user = await queryOne<UserRow>('SELECT * FROM users WHERE external_id = $1', [
      String(info.id),
    ]);

    // 2) 再按邮箱匹配，实现「先有本地账号，后接入 SSO」的平滑升级
    if (!user && info.email) {
      user = await queryOne<UserRow>('SELECT * FROM users WHERE email = $1', [info.email]);
      if (user) {
        await query(
          `UPDATE users
              SET external_id = $1, auth_provider = 'sso', updated_at = NOW()
            WHERE id = $2`,
          [String(info.id), user.id]
        );
      }
    }

    // 3) 都没有则自动创建账号
    if (!user) {
      const nickname = info.name || info.email?.split('@')[0] || `用户${String(info.id).slice(-6)}`;
      const newUserId = randomUUID();
      await query(
        `INSERT INTO users (id, phone, email, nickname, avatar, role, status, external_id, auth_provider, last_login_at)
         VALUES ($1, $2, $3, $4, $5, 'user', 'active', $6, 'sso', NOW())`,
        [newUserId, null, info.email || null, nickname, info.avatar || null, String(info.id)]
      );
      user = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [newUserId]);
    }

    if (!user) {
      return redirectToLogin(request, '单点登录创建用户失败');
    }

    if (user.status === 'deleted' || user.status === 'disabled' || user.status === 'frozen') {
      return redirectToLogin(request, '账号状态异常，请联系管理员');
    }

    // 同步外部系统可能更新过的资料
    await query(
      `UPDATE users
          SET nickname = COALESCE($1, nickname),
              avatar = COALESCE($2, avatar),
              email = COALESCE(email, $3),
              last_login_at = NOW(),
              login_fail_count = 0,
              frozen_until = NULL,
              updated_at = NOW()
        WHERE id = $4`,
      [info.name || null, info.avatar || null, info.email || null, user.id]
    );

    const response = NextResponse.redirect(new URL(redirectTo, request.nextUrl.origin));
    setSessionCookie(response, user.id, true, {
      authProvider: 'sso',
      externalUserId: String(info.id),
    });
    response.cookies.delete('oauth_redirect');
    console.log('[OAuth] 单点登录成功', {
      provider: oauthProvider.name,
      userId: user.id,
    });
    return response;
  } catch (error) {
    console.error('[OAuth] callback error:', error);
    return redirectToLogin(request, '单点登录处理异常，请稍后重试');
  }
}
