'use client';

/**
 * 前端路由守卫
 *
 * - 公开路径（登录 / 注册 / 安装向导 / API）直接放行
 * - 未登录时：若开启了单点登录自动认证则跳转 SSO，否则跳转登录页
 *
 * 服务端同样在 src/server.ts 中做了一次拦截，二者互为兜底。
 */
import { useAuth } from '@/lib/auth-client';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, ReactNode } from 'react';
import { isPublicPath } from '@/lib/site-config';

interface SSOConfig {
  /** 满足「已配置 + 系统设置开启」时才自动跳转 */
  autoLogin: boolean;
  configured: boolean;
  loginUrl: string;
}

export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const redirectedRef = useRef(false);
  const ssoFetchedRef = useRef(false);

  const [showContent, setShowContent] = useState(false);
  const [ssoConfig, setSsoConfig] = useState<SSOConfig | null>(null);

  // 只在首次挂载时拉取一次 SSO 配置
  useEffect(() => {
    if (ssoFetchedRef.current) return;
    ssoFetchedRef.current = true;

    fetch('/api/auth/oauth/status')
      .then((res) => res.json())
      .then((data) =>
        setSsoConfig({
          autoLogin: Boolean(data.autoLogin),
          configured: Boolean(data.provider?.configured),
          loginUrl: data.loginUrl || '/api/auth/oauth/login',
        })
      )
      .catch(() =>
        setSsoConfig({ autoLogin: false, configured: false, loginUrl: '/api/auth/oauth/login' })
      );
  }, []);

  useEffect(() => {
    if (loading || !ssoConfig) return;

    if (isPublicPath(pathname)) {
      setShowContent(true);
      return;
    }

    if (user) {
      redirectedRef.current = false;
      setShowContent(true);
      return;
    }

    if (!redirectedRef.current) {
      redirectedRef.current = true;
      setShowContent(false);

      const redirect = encodeURIComponent(pathname);
      if (ssoConfig.autoLogin && ssoConfig.configured) {
        window.location.href = `${ssoConfig.loginUrl}?redirect=${redirect}`;
      } else {
        window.location.href = `/login?redirect=${redirect}`;
      }
    }
  }, [user, loading, pathname, ssoConfig]);

  // 公开页面直接渲染
  if (isPublicPath(pathname)) return <>{children}</>;

  if (loading || !ssoConfig) return <AuthLoading text="正在验证登录状态..." />;

  if (showContent || user) return <>{children}</>;

  return (
    <AuthLoading
      text={ssoConfig.autoLogin ? '正在跳转单点登录...' : '正在跳转登录页...'}
    />
  );
}

function AuthLoading({ text }: { text: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        <span className="text-sm text-gray-500">{text}</span>
      </div>
    </div>
  );
}
