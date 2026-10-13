'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { siteConfig } from '@/lib/site-config';

interface OAuthStatus {
  provider: { name: string; displayName: string; icon: string; configured: boolean };
  autoLogin: boolean;
  loginUrl: string;
}

function LoginContent() {
  const searchParams = useSearchParams();
  const errorParam = searchParams.get('error');
  const redirect = searchParams.get('redirect') || '/';

  const [oauthStatus, setOauthStatus] = useState<OAuthStatus | null>(null);
  const [registerEnabled, setRegisterEnabled] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ssoRedirecting, setSsoRedirecting] = useState(false);

  useEffect(() => {
    fetch('/api/auth/oauth/status')
      .then((res) => res.json())
      .then((data: OAuthStatus) => {
        setOauthStatus(data);
        // 开启 SSO 自动登录时无需用户操作，直接跳转
        if (data.autoLogin) {
          setSsoRedirecting(true);
          setTimeout(() => {
            window.location.href = `${data.loginUrl || '/api/auth/oauth/login'}?redirect=${encodeURIComponent(redirect)}`;
          }, 100);
        }
      })
      .catch(() => setOauthStatus(null));

    fetch('/api/auth/register/status')
      .then((res) => res.json())
      .then((data) => setRegisterEnabled(Boolean(data.enabled)))
      .catch(() => setRegisterEnabled(false));

    if (errorParam) toast.error(decodeURIComponent(errorParam));
  }, [errorParam, redirect]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return toast.error('请输入用户名');
    if (!password) return toast.error('请输入密码');

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, remember }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || '登录失败');
        return;
      }

      toast.success('登录成功');
      // 等 Cookie 生效后再跳转，避免浏览器尚未保存就发起导航
      try {
        await fetch('/api/auth/me', { credentials: 'same-origin' });
      } catch {
        /* 忽略，由服务端兜底 */
      }
      window.location.href = redirect;
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  };

  const handleSSO = () => {
    window.location.href = `${oauthStatus?.loginUrl || '/api/auth/oauth/login'}?redirect=${encodeURIComponent(redirect)}`;
  };

  if (ssoRedirecting) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
        <p className="text-sm text-gray-500">正在跳转单点登录...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-white px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center space-x-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
              <span className="text-xl font-bold text-white">{siteConfig.logoText}</span>
            </div>
          </Link>
          <h1 className="mt-4 text-2xl font-semibold text-gray-900">欢迎回来</h1>
          <p className="mt-2 text-gray-500">登录 {siteConfig.name}</p>
        </div>

        <Card className="rounded-2xl border-0 shadow-xl">
          <CardContent className="pt-6">
            {oauthStatus?.provider.configured && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-full rounded-xl border-2 text-base font-medium hover:bg-gray-50"
                  onClick={handleSSO}
                >
                  <span className="mr-2 text-xl">{oauthStatus.provider.icon}</span>
                  使用{oauthStatus.provider.displayName}账号登录
                </Button>

                <div className="relative my-6">
                  <Separator />
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-3 text-sm text-gray-400">
                    或
                  </span>
                </div>
              </>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">用户名</Label>
                <Input
                  id="username"
                  type="text"
                  autoComplete="username"
                  placeholder="请输入用户名"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="h-12 rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">密码</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="请输入密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 rounded-xl"
                />
              </div>

              <label className="flex items-center space-x-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span>记住我</span>
              </label>

              <Button
                type="submit"
                className="h-12 w-full rounded-xl text-base font-medium"
                disabled={loading}
              >
                {loading ? '登录中...' : '登录'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {registerEnabled && (
          <p className="mt-6 text-center text-sm text-gray-600">
            还没有账号？{' '}
            <Link href="/register" className="font-medium text-blue-600 hover:underline">
              立即注册
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-gray-900" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
