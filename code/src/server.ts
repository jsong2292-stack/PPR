import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import jwt from 'jsonwebtoken';
import { validateEnv } from '@/lib/env';
import { isOAuthConfigured } from '@/lib/oauth-config';

// 启动前校验环境变量
validateEnv();

/**
 * 生产环境必须关闭 Next.js dev/HMR：公网链路上的代理或 WAF 可能周期性断开 HMR WebSocket，
 * dev 客户端重连时会触发整页刷新，导致 AuthProvider/AuthGuard 反复回到登录校验页。
 */
const dev = process.env.NODE_ENV !== 'production' && process.env.COZE_PROJECT_ENV !== 'PROD';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '9010', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'rifeng-platform-demo-jwt-secret';
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'session';

/** SSO 自动登录开关缓存，避免每个请求都查库 */
let ssoAutoLoginEnabled = false;
let ssoConfigLastCheck = 0;
const SSO_CONFIG_TTL = 30_000;

async function refreshSSOConfig(): Promise<boolean> {
  const now = Date.now();
  if (now - ssoConfigLastCheck < SSO_CONFIG_TTL) return ssoAutoLoginEnabled;

  if (!isOAuthConfigured()) {
    ssoAutoLoginEnabled = false;
    ssoConfigLastCheck = now;
    return false;
  }

  try {
    const { queryOne } = await import('@/storage/database/mysql-client');
    const row = await queryOne<{ value: string }>(
      "SELECT value FROM system_config WHERE `key` = 'enable_sso_auto_login'"
    );
    ssoAutoLoginEnabled = row?.value === 'true';
    ssoConfigLastCheck = now;
  } catch {
    // 查询失败时保留上一次的缓存值
  }
  return ssoAutoLoginEnabled;
}

/** 无需登录即可访问的路径前缀 */
const PUBLIC_PATHS = ['/login', '/register', '/install', '/api', '/_next'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * 部署平台健康检查：无 Cookie 的探活请求直接放行，避免被 302 判为不健康。
 *
 * 只认探活专用的 User-Agent，不要加入 curl / wget 等通用客户端，
 * 否则任何人都能通过伪造 UA 绕过服务端登录拦截。
 * 数据安全最终由各 API 路由的 requireUser / requireAdmin 保证。
 */
function isHealthCheck(req: import('http').IncomingMessage): boolean {
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  return (
    !req.headers.cookie && (ua.includes('kube-probe') || ua.includes('health-check'))
  );
}

function isRSCRequest(req: import('http').IncomingMessage): boolean {
  return req.headers['rsc'] === '1' || req.headers['next-router-state-tree'] !== undefined;
}

function getSessionToken(req: import('http').IncomingMessage): string | undefined {
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]*)`));
  return match ? match[1] : undefined;
}

function verifyTokenStandalone(token: string): boolean {
  try {
    jwt.verify(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      const pathname = parsedUrl.pathname || '/';

      // 健康检查：不走 Next.js，确保探活快速返回
      if (pathname === '/api/health/ping') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
        return;
      }

      // 静态资源直接放行
      if (
        pathname.startsWith('/_next/static') ||
        pathname.startsWith('/_next/image') ||
        pathname.startsWith('/favicon') ||
        (pathname.includes('.') && !pathname.startsWith('/api/'))
      ) {
        await handle(req, res, parsedUrl);
        return;
      }

      if (isPublicPath(pathname)) {
        await handle(req, res, parsedUrl);
        return;
      }

      if (isHealthCheck(req)) {
        await handle(req, res, parsedUrl);
        return;
      }

      // RSC 请求交给 Next.js 处理（客户端导航由 AuthGuard 兜底），
      // 若在此处 302 会导致客户端路由拿到 204 / 空白页
      if (isRSCRequest(req)) {
        await handle(req, res, parsedUrl);
        return;
      }

      // 仅对浏览器直接导航做服务端登录拦截
      const token = getSessionToken(req);
      const isAuthenticated = token ? verifyTokenStandalone(token) : false;

      if (!isAuthenticated) {
        const ssoEnabled = await refreshSSOConfig();
        const location = ssoEnabled
          ? `/api/auth/oauth/login?redirect=${encodeURIComponent(pathname)}`
          : `/login?redirect=${encodeURIComponent(pathname)}`;

        res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
        res.end();
        return;
      }

      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });

  server.once('error', (err) => {
    console.error(err);
    process.exit(1);
  });

  server.listen(port, () => {
    console.log(
      `> Server listening at http://${hostname}:${port} as ${dev ? 'development' : 'production'}`
    );
  });
});
