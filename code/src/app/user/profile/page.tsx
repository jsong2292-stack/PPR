'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ImageUploader } from '@/components/upload/image-uploader';
import { useAuth } from '@/lib/auth-client';
import { toast } from 'sonner';

interface ProfileForm {
  nickname: string;
  email: string;
  industry: string;
  expertise: string;
  bio: string;
  avatar: string | null;
}

export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const [form, setForm] = useState<ProfileForm>({
    nickname: '',
    email: '',
    industry: '',
    expertise: '',
    bio: '',
    avatar: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 用户信息加载完成后回填表单
  useEffect(() => {
    if (!user) return;
    setForm({
      nickname: user.nickname || '',
      email: user.email || '',
      industry: (user.industry as string) || '',
      expertise: (user.expertise as string) || '',
      bio: (user.bio as string) || '',
      avatar: user.avatar || null,
    });
    setLoading(false);
  }, [user]);

  const update = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (form.nickname.length < 2 || form.nickname.length > 20) {
      return toast.error('昵称长度应为 2-20 个字符');
    }

    setSaving(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || '保存失败');
        return;
      }

      toast.success('保存成功');
      await refresh();
    } catch {
      toast.error('网络错误');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">个人资料</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">基本信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <ImageUploader
            value={form.avatar}
            onChange={(url) => update('avatar', url)}
            fallbackText={form.nickname}
            bizType="avatar"
          />

          <Separator />

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>登录账号</Label>
              <Input value={user?.phone || user?.username || ''} disabled />
              <p className="text-xs text-gray-400">登录账号不可修改</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nickname">昵称 *</Label>
              <Input
                id="nickname"
                value={form.nickname}
                onChange={(e) => update('nickname', e.target.value)}
                placeholder="2-20 个字符"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                placeholder="用于接收通知"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="industry">部门 / 岗位</Label>
              <Input
                id="industry"
                value={form.industry}
                onChange={(e) => update('industry', e.target.value)}
                placeholder="如：数字化中心"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="expertise">专长 / 标签</Label>
              <Input
                id="expertise"
                value={form.expertise}
                onChange={(e) => update('expertise', e.target.value)}
                placeholder="如：数据分析、流程自动化"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="bio">个人简介</Label>
              <Textarea
                id="bio"
                value={form.bio}
                onChange={(e) => update('bio', e.target.value)}
                placeholder="简单介绍一下自己（500 字以内）"
                rows={4}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存修改'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">账号信息</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-gray-600 sm:grid-cols-2">
          <div>
            <span className="text-gray-400">角色：</span>
            {user?.role === 'admin' ? '管理员' : '普通用户'}
          </div>
          <div>
            <span className="text-gray-400">认证方式：</span>
            {user?.authProvider === 'sso' ? '单点登录' : '本地账号'}
          </div>
          <div>
            <span className="text-gray-400">注册时间：</span>
            {user?.createdAt ? new Date(String(user.createdAt)).toLocaleString('zh-CN') : '—'}
          </div>
          <div>
            <span className="text-gray-400">最近登录：</span>
            {user?.lastLoginAt ? new Date(String(user.lastLoginAt)).toLocaleString('zh-CN') : '—'}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
