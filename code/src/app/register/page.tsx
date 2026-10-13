'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { siteConfig } from '@/lib/site-config';

export default function RegisterPage() {
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return toast.error('用户名需为 3-20 位字母、数字或下划线');
    }
    if (nickname.length < 2 || nickname.length > 20) {
      return toast.error('昵称长度应为 2-20 个字符');
    }
    if (password.length < 6) {
      return toast.error('密码至少需要 6 个字符');
    }
    if (password !== confirmPassword) {
      return toast.error('两次输入的密码不一致');
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, nickname, email: email || undefined, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || '注册失败');
        return;
      }

      toast.success('注册成功');
      router.push('/');
      router.refresh();
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-white px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center space-x-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
              <span className="text-xl font-bold text-white">{siteConfig.logoText}</span>
            </div>
          </Link>
          <h1 className="mt-4 text-2xl font-semibold text-gray-900">创建账号</h1>
          <p className="mt-2 text-gray-500">注册后即可使用 {siteConfig.name} 的全部功能</p>
        </div>

        <Card className="rounded-2xl border-0 shadow-xl">
          <CardContent className="pt-6">
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">用户名 *</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="3-20 位字母、数字或下划线"
                  autoComplete="username"
                  className="h-11 rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nickname">昵称 *</Label>
                <Input
                  id="nickname"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="2-20 个字符，展示给其他用户"
                  className="h-11 rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">邮箱（可选）</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="用于接收通知，也是单点登录账号的匹配依据"
                  autoComplete="email"
                  className="h-11 rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">密码 *</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少 6 位"
                  autoComplete="new-password"
                  className="h-11 rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">确认密码 *</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入密码"
                  autoComplete="new-password"
                  className="h-11 rounded-xl"
                />
              </div>

              <Button type="submit" className="h-11 w-full rounded-xl" disabled={loading}>
                {loading ? '注册中...' : '注册'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-gray-600">
          已有账号？{' '}
          <Link href="/login" className="font-medium text-blue-600 hover:underline">
            去登录
          </Link>
        </p>
      </div>
    </div>
  );
}
