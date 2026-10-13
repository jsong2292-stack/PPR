'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';

interface Notification {
  id: number;
  type: string;
  title: string;
  content: string | null;
  related_id: number | null;
  related_type: string | null;
  is_read: boolean;
  created_at: string;
}

interface Pagination {
  page: number;
  totalPages: number;
  total: number;
}

const TYPE_LABEL: Record<string, string> = {
  system: '系统',
  audit: '审核',
  comment: '评论',
  like: '点赞',
  collect: '收藏',
  follow: '关注',
};

export default function MessagesPage() {
  const [messages, setMessages] = useState<Notification[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, totalPages: 1, total: 0 });
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchMessages = useCallback(
    async (page = 1, onlyUnread = unreadOnly) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/user/messages?page=${page}&pageSize=20${onlyUnread ? '&unread=true' : ''}`,
          { credentials: 'same-origin' }
        );
        const data = await res.json();

        if (!res.ok) {
          toast.error(data.error || '加载失败');
          return;
        }

        setMessages(data.messages || []);
        setPagination({
          page: data.pagination?.page || 1,
          totalPages: data.pagination?.totalPages || 1,
          total: data.pagination?.total || 0,
        });
      } catch {
        toast.error('网络错误');
      } finally {
        setLoading(false);
      }
    },
    [unreadOnly]
  );

  useEffect(() => {
    fetchMessages(1, unreadOnly);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadOnly]);

  const markRead = async (id: number) => {
    await fetch(`/api/user/messages/${id}/read`, { method: 'POST', credentials: 'same-origin' });
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, is_read: true } : m)));
  };

  const markAllRead = async () => {
    const res = await fetch('/api/user/messages/read-all', {
      method: 'POST',
      credentials: 'same-origin',
    });
    if (res.ok) {
      toast.success('已全部标记为已读');
      fetchMessages(pagination.page, unreadOnly);
    }
  };

  const remove = async (id: number) => {
    const res = await fetch(`/api/user/messages/${id}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    if (res.ok) {
      toast.success('已删除');
      fetchMessages(pagination.page, unreadOnly);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">消息通知</h1>
          <p className="mt-1 text-sm text-gray-500">共 {pagination.total} 条</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={unreadOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => setUnreadOnly((v) => !v)}
          >
            只看未读
          </Button>
          <Button variant="outline" size="sm" onClick={markAllRead}>
            <CheckCheck className="mr-1 h-4 w-4" />
            全部已读
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : messages.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-gray-400">
            <Bell className="h-10 w-10" />
            <p>暂无消息</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {messages.map((message) => (
            <Card
              key={message.id}
              className={`transition-shadow hover:shadow-md ${message.is_read ? '' : 'border-l-4 border-l-blue-500'}`}
              onClick={() => !message.is_read && markRead(message.id)}
            >
              <CardContent className="flex items-start gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {TYPE_LABEL[message.type] || message.type}
                    </Badge>
                    <span className="truncate font-medium text-gray-900">{message.title}</span>
                    {!message.is_read && <span className="h-2 w-2 rounded-full bg-blue-500" />}
                  </div>
                  {message.content && (
                    <p className="whitespace-pre-wrap text-sm text-gray-600">{message.content}</p>
                  )}
                  <p className="mt-2 text-xs text-gray-400">
                    {new Date(message.created_at).toLocaleString('zh-CN')}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="删除消息"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(message.id);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-gray-400" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 分页 */}
      {pagination.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page <= 1}
            onClick={() => fetchMessages(pagination.page - 1)}
          >
            上一页
          </Button>
          <span className="text-sm text-gray-500">
            {pagination.page} / {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => fetchMessages(pagination.page + 1)}
          >
            下一页
          </Button>
        </div>
      )}
    </div>
  );
}
