'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export default function PasswordPage() {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!oldPassword) return toast.error('请输入原密码');
    if (newPassword.length < 8) return toast.error('新密码长度至少 8 位');
    if (newPassword !== confirmPassword) return toast.error('两次输入的新密码不一致');
    if (newPassword === oldPassword) return toast.error('新密码不能与原密码相同');

    setSaving(true);
    try {
      const res = await fetch('/api/user/password', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || '修改失败');
        return;
      }

      toast.success('密码修改成功');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      toast.error('网络错误');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">修改密码</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">安全设置</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="oldPassword">原密码</Label>
              <Input
                id="oldPassword"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">新密码</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
              <p className="text-xs text-gray-400">至少 8 位，建议包含字母与数字</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">确认新密码</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? '提交中...' : '确认修改'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-gray-400">
        提示：单点登录创建的账号没有本地密码，如需设置请联系管理员。
      </p>
    </div>
  );
}
