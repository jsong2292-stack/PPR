'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';

interface SearchUser {
  id: string;
  nickname: string;
  avatar: string | null;
}

/**
 * 全站搜索
 *
 * 脚手架里以「用户」作为示例数据源，接入业务模块时
 * 可在 /api/search 中聚合多张业务表，或分别调用各业务列表接口。
 */
function SearchContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const runSearch = useCallback(async (keyword: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/users?keyword=${encodeURIComponent(keyword)}`, {
        credentials: 'same-origin',
      });
      const data = await res.json();
      setResults(res.ok ? data.users || [] : []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }, []);

  useEffect(() => {
    if (initialQuery) runSearch(initialQuery);
  }, [initialQuery, runSearch]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">全站搜索</h1>

      <form
        className="mb-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch(query.trim());
        }}
      >
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="输入关键词"
          className="h-11"
        />
        <Button type="submit" className="h-11">
          <Search className="mr-1 h-4 w-4" />
          搜索
        </Button>
      </form>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : results.length > 0 ? (
        <div className="space-y-3">
          {results.map((user) => (
            <Card key={user.id}>
              <CardContent className="flex items-center gap-3 py-4">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={user.avatar || undefined} />
                  <AvatarFallback>{user.nickname?.[0]}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-gray-900">{user.nickname}</p>
                  <Link href="/messages" className="text-xs text-blue-600 hover:underline">
                    发起私信
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="py-16 text-center text-sm text-gray-400">
          {searched ? '没有匹配的结果' : '输入关键词开始搜索'}
        </p>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
