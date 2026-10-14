'use client';

/**
 * 顶部导航栏（通用版）
 *
 * 菜单项来自 src/lib/site-config.ts 的 siteConfig.nav，
 * 换项目时只需修改配置，无需改动本组件。
 *
 * 对外提供的事件：
 *   window.dispatchEvent(new Event('rf:open-search'))  展开顶部搜索框
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth, type AuthUser } from '@/lib/auth-client';
import { siteConfig, type NavItem } from '@/lib/site-config';

interface RegisterStatus {
  enabled: boolean;
}

/** 判断菜单项在当前登录状态下是否可见 */
function isItemVisible(item: NavItem, user: AuthUser | null): boolean {
  if (item.adminOnly && user?.role !== 'admin') return false;
  if (item.authOnly && !user) return false;
  if (item.guestOnly && user) return false;
  return true;
}

export default function Navbar() {
  const router = useRouter();
  const { user, refresh } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [registerStatus, setRegisterStatus] = useState<RegisterStatus>({ enabled: false });
  const [unreadCount, setUnreadCount] = useState(0);
  const [isQrOpen, setIsQrOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasFetchedUnreadRef = useRef(false);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/user/messages/unread-count', { credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.unreadCount || 0);
      }
    } catch {
      // 忽略轮询失败
    }
  }, []);

  // 注册开关
  useEffect(() => {
    fetch('/api/auth/register/status')
      .then((res) => res.json())
      .then((data) => setRegisterStatus({ enabled: Boolean(data.enabled) }))
      .catch(() => setRegisterStatus({ enabled: false }));
  }, []);

  // 登录后开始轮询未读数，退出登录时清空
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (user?.id && !hasFetchedUnreadRef.current) {
      hasFetchedUnreadRef.current = true;
      fetchUnreadCount();
      intervalRef.current = setInterval(fetchUnreadCount, 60000);
    }

    if (!user) {
      hasFetchedUnreadRef.current = false;
      setUnreadCount(0);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [user?.id, user, fetchUnreadCount]);

  // 搜索框展开后自动聚焦
  useEffect(() => {
    if (isSearchOpen) {
      const timer = setTimeout(() => searchInputRef.current?.focus(), 120);
      return () => clearTimeout(timer);
    }
  }, [isSearchOpen]);

  // 页面其它位置（如页脚「站内搜索」）触发展开
  useEffect(() => {
    const handleOpenSearch = () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setIsSearchOpen(true);
      setTimeout(() => searchInputRef.current?.focus(), 360);
    };
    window.addEventListener('rf:open-search', handleOpenSearch);
    return () => window.removeEventListener('rf:open-search', handleOpenSearch);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setIsSearchOpen(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      setUnreadCount(0);
      hasFetchedUnreadRef.current = false;
      await refresh();
      // 使用整页跳转，确保服务端重新判定 SSO 状态
      window.location.href = '/login';
    } catch {
      console.error('Logout failed');
    }
  };

  const navItems = siteConfig.nav.filter((item) => isItemVisible(item, user));

  return (
    <>
      <nav className="sticky top-0 z-50 border-b border-gray-200/50 bg-white/80 backdrop-blur-xl">
        {/* 通栏布局：左侧留白与 QualityShell 侧边栏保持同一栅格，保证 Logo 与边栏对齐且贴靠最左侧 */}
        <div className="w-full px-3">
          <div className="flex h-14 items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex flex-shrink-0 items-center space-x-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
                <span className="text-sm font-bold text-white">{siteConfig.logoText}</span>
              </div>
              <div className="hidden flex-col leading-tight sm:flex">
                <span className="text-sm font-semibold text-gray-900">{siteConfig.name}</span>
                <span className="text-[9px] uppercase tracking-wider text-gray-500">
                  {siteConfig.nameEn}
                </span>
              </div>
            </Link>

            {/* 主导航：本站业务入口已统一收敛到左侧业务边栏（QualityShell），
                顶部仅作为品牌与账号区，因此 siteConfig.nav 清空后此处不再渲染菜单。 */}
            {(navItems.length > 0 || siteConfig.enableQrDialog) && (
              <div className="flex min-w-0 flex-1 items-center justify-start pl-3 md:justify-center md:pl-8">
                <div className="no-scrollbar flex w-full select-none items-center gap-4 overflow-x-auto overscroll-x-contain whitespace-nowrap md:w-auto md:gap-8 md:overflow-visible">
                  {navItems.map((item) => (
                    <div key={`${item.label}-${item.href}`} className="group/nav relative shrink-0">
                      <Link
                        href={item.href}
                        className="relative text-sm text-gray-600 transition-colors hover:text-gray-900"
                      >
                        {item.label}
                        <span className="absolute -bottom-1 left-0 h-0.5 w-0 bg-gray-900 transition-all duration-300 group-hover/nav:w-full" />
                      </Link>

                      {item.children && item.children.length > 0 && (
                        <div className="invisible absolute left-0 top-full z-50 -translate-y-1 pt-4 opacity-0 transition-all duration-200 ease-out group-hover/nav:visible group-hover/nav:translate-y-0 group-hover/nav:opacity-100">
                          <div className="w-40 rounded-xl border border-gray-200/50 bg-white p-1 shadow-xl">
                            {item.children.map((child) => (
                              <Link
                                key={child.href}
                                href={child.href}
                                className="block rounded-lg px-3 py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900"
                              >
                                {child.label}
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {siteConfig.enableQrDialog && (
                    <button
                      type="button"
                      onClick={() => setIsQrOpen(true)}
                      className="relative shrink-0 text-sm text-gray-600 transition-colors hover:text-gray-900"
                    >
                      更多资讯
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* 右侧操作区 */}
            <div className="flex shrink-0 items-center space-x-1.5 sm:space-x-3">
              {/* 搜索：图标点击后横向展开输入框 */}
              <div className="flex items-center">
                <form
                  onSubmit={handleSearch}
                  className={`relative flex items-center overflow-hidden transition-all duration-300 ease-out ${
                    isSearchOpen ? 'w-32 opacity-100 sm:w-40 lg:w-56' : 'w-0 opacity-0'
                  }`}
                >
                  <svg
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onBlur={() => {
                      if (!searchQuery.trim()) setIsSearchOpen(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setSearchQuery('');
                        setIsSearchOpen(false);
                      }
                    }}
                    placeholder="搜索..."
                    aria-label="站内搜索"
                    tabIndex={isSearchOpen ? 0 : -1}
                    className="h-9 w-32 shrink-0 rounded-full bg-gray-100 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-500 transition-colors duration-200 focus:bg-white focus:outline-none sm:w-40 lg:w-56"
                  />
                </form>

                <button
                  type="button"
                  onClick={() => setIsSearchOpen(true)}
                  aria-label="搜索"
                  tabIndex={isSearchOpen ? -1 : 0}
                  className={`flex h-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-gray-600 transition-all duration-300 ease-out hover:text-gray-900 focus:outline-none ${
                    isSearchOpen ? 'w-0 opacity-0' : 'w-9 opacity-100'
                  }`}
                >
                  <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
              </div>

              {user ? (
                <>
                  {/* 消息通知 */}
                  <Link href="/user/messages" className="relative" aria-label="消息通知">
                    <span className="flex p-2 text-gray-600 transition-colors hover:text-gray-900">
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                    </span>
                    {unreadCount > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white shadow-sm">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </Link>

                  {/* 用户菜单 */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="group flex items-center space-x-2 focus:outline-none">
                        <Avatar className="h-8 w-8 ring-2 ring-transparent transition-all group-hover:ring-gray-200">
                          <AvatarImage src={user.avatar || undefined} />
                          <AvatarFallback className="bg-gray-100 text-sm font-medium text-gray-600">
                            {user.nickname?.[0]}
                          </AvatarFallback>
                        </Avatar>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="mt-2 w-56 rounded-xl border border-gray-200/50 shadow-xl"
                    >
                      <div className="border-b border-gray-100 px-3 py-2">
                        <p className="font-medium text-gray-900">{user.nickname}</p>
                        <p className="text-xs text-gray-500">{user.email || user.phone || '—'}</p>
                      </div>
                      <DropdownMenuItem asChild className="py-2.5">
                        <Link href="/user/profile">个人资料</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild className="py-2.5">
                        <Link href="/user/password">修改密码</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild className="py-2.5">
                        <Link href="/user/messages">消息通知</Link>
                      </DropdownMenuItem>
                      {user.role === 'admin' && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem asChild className="py-2.5">
                            <Link href="/admin" className="text-blue-600">
                              管理后台
                            </Link>
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={handleLogout}
                        className="py-2.5 text-red-600 focus:text-red-600"
                      >
                        退出登录
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : (
                <div className="flex items-center space-x-2">
                  <Link href="/login">
                    <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-900">
                      登录
                    </Button>
                  </Link>
                  {registerStatus.enabled && (
                    <Link href="/register">
                      <Button
                        size="sm"
                        className="rounded-full bg-blue-600 px-5 text-white hover:bg-blue-700"
                      >
                        注册
                      </Button>
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* 二维码弹窗（siteConfig.enableQrDialog 为 true 时启用） */}
      {siteConfig.enableQrDialog && (
        <Dialog open={isQrOpen} onOpenChange={setIsQrOpen}>
          <DialogContent className="max-w-[376px] text-center">
            <DialogTitle>{siteConfig.qrTitle}</DialogTitle>
            <DialogDescription>{siteConfig.qrDescription}</DialogDescription>
            <div className="mt-4 flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={siteConfig.qrImage}
                alt={siteConfig.qrTitle}
                width={160}
                height={160}
                className="h-40 w-40 object-contain"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
