'use client';

/**
 * 管理员路由守卫
 *
 * 用于后台管理相关页面：未登录跳登录页，已登录但非管理员跳回业务首页。
 * 接口层另有 requireAdmin 兜底，二者互为补充。
 */
import { useAuth } from '@/lib/auth-client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, ReactNode } from 'react';

export function AdminGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [redirecting, setRedirecting] = useState(false);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (loading) return;
    if (isAdmin) return;

    setRedirecting(true);
    if (!user) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    } else {
      router.replace('/quality/monitor');
    }
  }, [loading, isAdmin, user, pathname, router]);

  if (!loading && isAdmin) return <>{children}</>;

  return <AdminLoading text={redirecting ? '正在跳转...' : '正在校验权限...'} />;
}

function AdminLoading({ text }: { text: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        <span className="text-sm text-gray-500">{text}</span>
      </div>
    </div>
  );
}
