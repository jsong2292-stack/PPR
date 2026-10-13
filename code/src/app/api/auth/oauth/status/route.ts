import { NextResponse } from 'next/server';
import { isOAuthConfigured, oauthProvider } from '@/lib/oauth-config';
import { getConfigFlag } from '@/lib/system-config';
import { getCurrentUser } from '@/lib/auth';

/**
 * 单点登录状态，前端据此决定：
 *   - 是否展示「使用 XX 账号登录」按钮（configured）
 *   - 未登录时是否自动跳转 SSO（enabled = 配置已就绪 + 系统设置开启）
 */
export async function GET() {
  const configured = isOAuthConfigured();
  let autoLoginEnabled = false;

  try {
    autoLoginEnabled = (await getConfigFlag('enable_sso_auto_login')) && configured;
  } catch {
    autoLoginEnabled = false;
  }

  let authenticated = false;
  try {
    authenticated = Boolean(await getCurrentUser());
  } catch {
    authenticated = false;
  }

  return NextResponse.json({
    provider: {
      name: oauthProvider.name,
      displayName: oauthProvider.displayName,
      icon: oauthProvider.icon,
      configured,
    },
    /** 兼容旧前端字段名 */
    [oauthProvider.name]: {
      configured,
      name: oauthProvider.displayName,
      icon: oauthProvider.icon,
    },
    autoLogin: autoLoginEnabled,
    authenticated,
    loginUrl: '/api/auth/oauth/login',
  });
}
