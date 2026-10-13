import { NextRequest, NextResponse } from 'next/server';
import {
  generateAuthorizeUrl,
  generateState,
  isOAuthConfigured,
  saveState,
} from '@/lib/oauth-config';

export const runtime = 'nodejs';

/**
 * 单点登录入口：生成 state → 跳转到 OAuth 授权端点
 *
 * 用法：/api/auth/oauth/login?redirect=/目标路径
 */
export async function GET(request: NextRequest) {
  if (!isOAuthConfigured()) {
    return NextResponse.json(
      { error: '单点登录尚未配置，请检查 OAUTH_* 环境变量' },
      { status: 500 }
    );
  }

  const redirect = request.nextUrl.searchParams.get('redirect') || '/';
  const state = generateState();

  // state 需要同时承载「防 CSRF 校验」与「登录后回跳地址」
  saveState(state);

  const response = NextResponse.redirect(generateAuthorizeUrl(state));
  // 回跳地址写入短期 Cookie，回调时读取，避免在 state 中暴露过长路径
  response.cookies.set('oauth_redirect', encodeURIComponent(redirect), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60,
  });
  return response;
}
