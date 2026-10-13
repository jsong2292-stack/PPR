'use client';

import { useCallback, useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Search, Trash2 } from 'lucide-react';

interface AdminUser {
  id: string;
  phone: string | null;
  email: string | null;
  nickname: string;
  avatar: string | null;
  role: string;
  status: string;
  auth_provider: string | null;
  created_at: string;
  last_login_at: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  active: '正常',
  frozen: '已冻结',
  disabled: '已停用',
  deleted: '已注销',
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [keyword, setKeyword] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (targetPage = page) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(targetPage), pageSize: '20' });
        if (keyword) params.set('keyword', keyword);
        if (role) params.set('role', role);
        if (status) params.set('status', status);

        const res = await fetch(`/api/admin/users?${params}`, { credentials: 'same-origin' });
        const data = await res.json();

        if (!res.ok) {
          toast.error(data.error || '加载失败');
          return;
        }

        setUsers(data.users || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
        setPage(data.page || 1);
      } catch {
        toast.error('网络错误');
      } finally {
        setLoading(false);
      }
    },
    [keyword, role, status, page]
  );

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, status]);

  const updateUser = async (userId: string, payload: { role?: string; status?: string }) => {
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, ...payload }),
    });
    const data = await res.json();

    if (!res.ok) {
      toast.error(data.error || '更新失败');
      return;
    }
    toast.success('更新成功');
    load();
  };

  const removeUser = async (userId: string) => {
    const res = await fetch(`/api/admin/users?userId=${userId}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || '删除失败');
      return;
    }
    toast.success('已注销该用户');
    load();
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">用户管理</h1>

      {/* 筛选 */}
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load(1)}
              placeholder="搜索昵称 / 账号 / 邮箱"
              className="pl-9"
            />
          </div>

          <Select value={role || 'all'} onValueChange={(v) => setRole(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="角色" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部角色</SelectItem>
              <SelectItem value="user">普通用户</SelectItem>
              <SelectItem value="admin">管理员</SelectItem>
            </SelectContent>
          </Select>

          <Select value={status || 'all'} onValueChange={(v) => setStatus(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="active">正常</SelectItem>
              <SelectItem value="frozen">已冻结</SelectItem>
              <SelectItem value="disabled">已停用</SelectItem>
              <SelectItem value="deleted">已注销</SelectItem>
            </SelectContent>
          </Select>

          <Button onClick={() => load(1)}>查询</Button>
          <span className="text-sm text-gray-500">共 {total} 位用户</span>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户</TableHead>
                <TableHead>账号 / 邮箱</TableHead>
                <TableHead>来源</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>注册时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-gray-400">
                    加载中...
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-gray-400">
                    没有匹配的用户
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user.avatar || undefined} />
                          <AvatarFallback>{user.nickname?.[0]}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{user.nickname}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      <div>{user.phone || '—'}</div>
                      <div className="text-xs text-gray-400">{user.email || '—'}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {user.auth_provider === 'sso' ? 'SSO' : '本地'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={user.role}
                        onValueChange={(value) => updateUser(user.id, { role: value })}
                      >
                        <SelectTrigger className="h-8 w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">普通用户</SelectItem>
                          <SelectItem value="admin">管理员</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.status === 'active' ? 'default' : 'secondary'}>
                        {STATUS_LABEL[user.status] || user.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {new Date(user.created_at).toLocaleDateString('zh-CN')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {user.status === 'active' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateUser(user.id, { status: 'disabled' })}
                          >
                            停用
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateUser(user.id, { status: 'active' })}
                          >
                            启用
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="注销用户"
                          onClick={() => removeUser(user.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => load(page - 1)}>
            上一页
          </Button>
          <span className="text-sm text-gray-500">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => load(page + 1)}
          >
            下一页
          </Button>
        </div>
      )}
    </div>
  );
}
