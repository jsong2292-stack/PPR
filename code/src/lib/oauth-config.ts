/**
 * 单点登录（OAuth 2.0 授权码模式）配置
 *
 * 通过环境变量即可对接任意 OAuth2 提供方（飞连 / 北森 / 企业微信 / Keycloak / Authing ...）：
 *
 *   OAUTH_PROVIDER_NAME         提供方标识，如 feilian
 *   OAUTH_PROVIDER_DISPLAY_NAME 登录按钮上的名称，如 飞连
 *   OAUTH_PROVIDER_ICON         登录按钮上的图标（emoji 或字符）
 *   OAUTH_AUTH_URL              授权端点
 *   OAUTH_TOKEN_URL             换取 token 端点
 *   OAUTH_USER_INFO_URL         用户信息端点
 *   OAUTH_SCOPE                 授权范围，默认 openid profile email
 *   OAUTH_CLIENT_ID             应用 Client ID
 *   OAUTH_CLIENT_SECRET         应用 Client Secret
 *   OAUTH_REDIRECT_URI          回调地址，如 https://your-domain.com/api/auth/oauth/callback
 *
 * 未配置 clientId / clientSecret / redirectUri 时，SSO 功能自动关闭，
 * 前端只展示账号密码登录。
 */

export interface OAuthUserInfo {
  id: string;
  name?: string;
  email?: string;
  avatar?: string;
  phone?: string;
}

export interface OAuthProvider {
  name: string;
  displayName: string;
  icon: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export const oauthProvider: OAuthProvider = {
  name: process.env.OAUTH_PROVIDER_NAME || 'sso',
  displayName: process.env.OAUTH_PROVIDER_DISPLAY_NAME || '企业单点登录',
  icon: process.env.OAUTH_PROVIDER_ICON || '🔐',

  authorizeUrl: process.env.OAUTH_AUTH_URL || '',
  tokenUrl: process.env.OAUTH_TOKEN_URL || '',
  userInfoUrl: process.env.OAUTH_USER_INFO_URL || '',

  scope: process.env.OAUTH_SCOPE || 'openid profile email',

  clientId: process.env.OAUTH_CLIENT_ID || '',
  clientSecret: process.env.OAUTH_CLIENT_SECRET || '',
  redirectUri: process.env.OAUTH_REDIRECT_URI || '',
};

/** 单点登录是否已完成配置 */
export function isOAuthConfigured(): boolean {
  return Boolean(
    oauthProvider.clientId &&
      oauthProvider.clientSecret &&
      oauthProvider.redirectUri &&
      oauthProvider.authorizeUrl &&
      oauthProvider.tokenUrl &&
      oauthProvider.userInfoUrl
  );
}

/** 生成授权跳转地址 */
export function generateAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: oauthProvider.clientId,
    redirect_uri: oauthProvider.redirectUri,
    scope: oauthProvider.scope,
    state,
  });
  return `${oauthProvider.authorizeUrl}?${params.toString()}`;
}

/** 使用授权码换取访问令牌 */
export async function exchangeCodeForToken(code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
} | null> {
  try {
    const requestBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: oauthProvider.clientId,
      client_secret: oauthProvider.clientSecret,
      redirect_uri: oauthProvider.redirectUri,
    }).toString();

    const response = await fetch(oauthProvider.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: requestBody,
    });

    if (!response.ok) {
      console.error('[OAuth] 换取 token 失败，状态码:', response.status);
      return null;
    }

    return JSON.parse(await response.text());
  } catch (error) {
    console.error('[OAuth] 换取 token 异常:', error);
    return null;
  }
}

/**
 * 获取用户信息。
 * 兼容常见的返回结构：{ code, data: {...} } 或直接返回用户对象，
 * 以及 user_id / sub / id、fullname / name / nickname 等字段别名。
 */
export async function getUserInfo(accessToken: string): Promise<OAuthUserInfo | null> {
  try {
    const response = await fetch(oauthProvider.userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      console.error('[OAuth] 获取用户信息失败，状态码:', response.status);
      return null;
    }

    const responseData = JSON.parse(await response.text());
    const data = responseData?.data || responseData;

    const userInfo: OAuthUserInfo = {
      id: data.user_id || data.sub || data.id || data.employee_id || data.uid || data.openid,
      name:
        data.fullname ||
        data.name ||
        data.nickname ||
        data.username ||
        data.display_name ||
        data.real_name,
      email: data.email || data.mail || data.work_email,
      avatar: data.avatar || data.picture || data.head_img_url || data.avatar_url || data.photo,
      phone: data.mobile || data.phone || data.phone_number || data.cellphone,
    };

    if (!userInfo.id) {
      console.error('[OAuth] 用户信息中缺少唯一标识');
      return null;
    }

    return userInfo;
  } catch (error) {
    console.error('[OAuth] 获取用户信息异常:', error);
    return null;
  }
}

/** 生成随机 state */
export function generateState(): string {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}

/**
 * state 存储与校验。
 * 单实例部署用内存即可；多实例部署请替换为 Redis 等共享存储。
 */
const stateStore = new Map<string, { state: string; expireAt: number }>();

export function saveState(state: string): void {
  stateStore.set(state, { state, expireAt: Date.now() + 10 * 60 * 1000 });
}

export function verifyState(state: string): boolean {
  const stored = stateStore.get(state);
  if (!stored) return false;
  if (stored.expireAt < Date.now()) {
    stateStore.delete(state);
    return false;
  }
  stateStore.delete(state);
  return true;
}
