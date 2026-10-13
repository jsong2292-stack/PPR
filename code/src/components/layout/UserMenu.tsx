'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorMessage } from '@/lib/client/api';
import { useToast } from '@/components/feedback/Toast';

/**
 * 顶部用户区：显示当前账号并提供退出、修改密码入口。
 */
export function UserMenu({
  displayName,
  username,
  roles,
}: {
  displayName: string;
  username: string;
  roles: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const handleLogout = async () => {
    setBusy(true);
    try {
      await api.post('/api/auth/logout');
      router.replace('/login');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error, '退出登录失败。'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="u-row">
      <div className="u-small">
        <div className="u-strong">{displayName}</div>
        <div className="u-faint u-xs">
          {username}
          {roles.length ? ` · ${roles.join(' / ')}` : ''}
        </div>
      </div>
      <button
        type="button"
        className="u-btn u-btn--small"
        onClick={() => router.push('/account/password')}
      >
        修改密码
      </button>
      <button
        type="button"
        className="u-btn u-btn--small"
        onClick={handleLogout}
        disabled={busy}
      >
        {busy ? '退出中…' : '退出'}
      </button>
    </div>
  );
}
