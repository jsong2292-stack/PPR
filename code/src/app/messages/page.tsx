'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { MessageSquarePlus, Send } from 'lucide-react';

interface OtherUser {
  id: string;
  nickname: string;
  avatar: string | null;
}

interface Conversation {
  id: number;
  last_message: string | null;
  last_message_at: string | null;
  otherUser: OtherUser | null;
  unreadCount: number;
}

interface PrivateMessage {
  id: number;
  content: string;
  sender_id: string;
  receiver_id: string;
  created_at: string;
}

export default function PrivateMessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [content, setContent] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [sending, setSending] = useState(false);

  // 新建会话
  const [pickerOpen, setPickerOpen] = useState(false);
  const [candidates, setCandidates] = useState<OtherUser[]>([]);

  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    const res = await fetch('/api/messages/conversations', { credentials: 'same-origin' });
    const data = await res.json();
    if (res.ok) setConversations(data.conversations || []);
  }, []);

  const loadMessages = useCallback(async (conversationId: number) => {
    const res = await fetch(`/api/messages/${conversationId}`, { credentials: 'same-origin' });
    const data = await res.json();
    if (res.ok) setMessages(data.messages || []);
  }, []);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then((res) => res.json())
      .then((data) => setCurrentUserId(data.user?.id || ''))
      .catch(() => setCurrentUserId(''));
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (selected) loadMessages(selected.id);
  }, [selected, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const searchUsers = async (keyword: string) => {
    const res = await fetch(`/api/users?keyword=${encodeURIComponent(keyword)}`, {
      credentials: 'same-origin',
    });
    const data = await res.json();
    if (res.ok) setCandidates(data.users || []);
  };

  const startConversation = async (targetUserId: string) => {
    const res = await fetch('/api/messages/conversations', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId }),
    });
    const data = await res.json();

    if (!res.ok) {
      toast.error(data.error || '创建会话失败');
      return;
    }

    setPickerOpen(false);
    await loadConversations();
    setSelected({
      id: data.conversation.id,
      last_message: data.conversation.last_message,
      last_message_at: data.conversation.last_message_at,
      otherUser: data.otherUser,
      unreadCount: 0,
    });
  };

  const send = async () => {
    if (!selected || !content.trim()) return;

    setSending(true);
    try {
      const res = await fetch(`/api/messages/${selected.id}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || '发送失败');
        return;
      }

      setContent('');
      await loadMessages(selected.id);
      await loadConversations();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">私信</h1>
        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                searchUsers('');
                setPickerOpen(true);
              }}
            >
              <MessageSquarePlus className="mr-1 h-4 w-4" />
              发起会话
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>选择联系人</DialogTitle>
            </DialogHeader>
            <Input
              placeholder="搜索昵称或账号"
              onChange={(e) => searchUsers(e.target.value)}
            />
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {candidates.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => startConversation(user.id)}
                  className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-gray-100"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user.avatar || undefined} />
                    <AvatarFallback>{user.nickname?.[0]}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{user.nickname}</span>
                </button>
              ))}
              {candidates.length === 0 && (
                <p className="py-6 text-center text-sm text-gray-400">没有匹配的用户</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        {/* 会话列表 */}
        <Card className="h-[560px] overflow-hidden">
          <CardContent className="h-full overflow-y-auto p-2">
            {conversations.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-400">暂无会话</p>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => setSelected(conv)}
                  className={`flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors ${
                    selected?.id === conv.id ? 'bg-blue-50' : 'hover:bg-gray-100'
                  }`}
                >
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={conv.otherUser?.avatar || undefined} />
                    <AvatarFallback>{conv.otherUser?.nickname?.[0] || '?'}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{conv.otherUser?.nickname || '未知用户'}</p>
                    <p className="truncate text-xs text-gray-500">{conv.last_message || '暂无消息'}</p>
                  </div>
                  {conv.unreadCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs text-white">
                      {conv.unreadCount}
                    </span>
                  )}
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {/* 消息区 */}
        <Card className="flex h-[560px] flex-col overflow-hidden">
          {selected ? (
            <>
              <div className="border-b px-4 py-3">
                <p className="font-medium text-gray-900">{selected.otherUser?.nickname}</p>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {messages.map((message) => {
                  const mine = message.sender_id === currentUserId;
                  return (
                    <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[70%] rounded-2xl px-3.5 py-2 text-sm ${
                          mine ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{message.content}</p>
                        <p className={`mt-1 text-[10px] ${mine ? 'text-blue-100' : 'text-gray-400'}`}>
                          {new Date(message.created_at).toLocaleString('zh-CN')}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <div className="flex items-center gap-2 border-t p-3">
                <Input
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="输入消息，回车发送"
                />
                <Button onClick={send} disabled={sending || !content.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <CardContent className="flex h-full items-center justify-center text-sm text-gray-400">
              选择左侧会话开始聊天
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
