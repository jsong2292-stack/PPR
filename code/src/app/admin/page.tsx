'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Users, FileUp, Bell, HardDrive, Settings, UserCog, Send } from 'lucide-react';

interface Stats {
  totalUsers: number;
  activeUsers: number;
  adminUsers: number;
  totalMessages: number;
  unreadMessages: number;
  totalFiles: number;
  storageBytes: number;
}

interface TrendPoint {
  day: string;
  count: number;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await fetch('/api/admin/stats', { credentials: 'same-origin' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || '加载失败');
        return;
      }
      setStats(data.stats);
      setTrend(data.userTrend || []);
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // 演示：给自己发一条站内通知，验证消息通知链路
  const sendTestNotification = async () => {
    const res = await fetch('/api/admin/notifications', { credentials: 'same-origin' });
    if (res.ok) toast.success('已发送一条测试通知，请查看消息中心');
    else toast.error('发送失败');
  };

  const maxTrend = Math.max(1, ...trend.map((t) => t.count));

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">管理后台</h1>
          <p className="mt-1 text-sm text-gray-500">脚手架自带的基础运维能力</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/users">
            <Button variant="outline" size="sm">
              <UserCog className="mr-1 h-4 w-4" />
              用户管理
            </Button>
          </Link>
          <Link href="/admin/settings">
            <Button variant="outline" size="sm">
              <Settings className="mr-1 h-4 w-4" />
              系统设置
            </Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : stats ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={<Users className="h-5 w-5 text-blue-600" />}
              label="用户总数"
              value={stats.totalUsers}
              hint={`活跃 ${stats.activeUsers} · 管理员 ${stats.adminUsers}`}
            />
            <StatCard
              icon={<Bell className="h-5 w-5 text-orange-500" />}
              label="通知消息"
              value={stats.totalMessages}
              hint={`未读 ${stats.unreadMessages}`}
            />
            <StatCard
              icon={<FileUp className="h-5 w-5 text-green-600" />}
              label="上传文件"
              value={stats.totalFiles}
              hint="本地磁盘 / 存储桶累计"
            />
            <StatCard
              icon={<HardDrive className="h-5 w-5 text-purple-600" />}
              label="占用空间"
              value={formatBytes(stats.storageBytes)}
              hint="uploaded_files 累计"
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">近 7 天新增用户</CardTitle>
              </CardHeader>
              <CardContent>
                {trend.length === 0 ? (
                  <p className="py-10 text-center text-sm text-gray-400">暂无数据</p>
                ) : (
                  <div className="flex h-40 items-end gap-3">
                    {trend.map((point) => (
                      <div key={point.day} className="flex flex-1 flex-col items-center gap-2">
                        <span className="text-xs text-gray-500">{point.count}</span>
                        <div
                          className="w-full rounded-t bg-blue-500/80"
                          style={{ height: `${(point.count / maxTrend) * 100}%`, minHeight: 4 }}
                        />
                        <span className="text-[10px] text-gray-400">{point.day.slice(5)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">快捷操作</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start" onClick={sendTestNotification}>
                  <Send className="mr-2 h-4 w-4" />
                  发送测试通知给自己
                </Button>
                <Link href="/admin/users" className="block">
                  <Button variant="outline" className="w-full justify-start">
                    <UserCog className="mr-2 h-4 w-4" />
                    管理用户角色与状态
                  </Button>
                </Link>
                <Link href="/admin/settings" className="block">
                  <Button variant="outline" className="w-full justify-start">
                    <Settings className="mr-2 h-4 w-4" />
                    调整系统开关
                  </Button>
                </Link>
                <a href="/api/test-db" target="_blank" rel="noreferrer" className="block">
                  <Button variant="outline" className="w-full justify-start">
                    <HardDrive className="mr-2 h-4 w-4" />
                    数据库自检
                  </Button>
                </a>
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="py-16 text-center text-sm text-gray-400">
            无法加载统计信息，请确认数据库连接与管理员权限
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50">{icon}</div>
          <div>
            <p className="text-sm text-gray-500">{label}</p>
            <p className="text-2xl font-semibold text-gray-900">{value}</p>
          </div>
        </div>
        {hint && <p className="mt-3 text-xs text-gray-400">{hint}</p>}
      </CardContent>
    </Card>
  );
}
