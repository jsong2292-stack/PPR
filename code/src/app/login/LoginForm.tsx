'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/client/api';
import { ToastProvider, useToast } from '@/components/feedback/Toast';

interface LoginResponse {
  user: {
    userId: number;
    username: string;
    displayName: string;
    roles: string[];
    permissions: string[];
  };
  mustResetPassword: boolean;
}

function LoginFormInner() {
  const router = useRouter();
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await api.post<LoginResponse>('/api/auth/login', { username, password });
      if (result.mustResetPassword) {
        toast.warning('请先修改初始密码后再继续使用。');
        router.replace('/account/password');
      } else {
        router.replace('/monitor');
      }
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError) setError(caught.message);
      else setError('登录失败，请稍后重试。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <label className="u-field">
        <span className="u-field__label">账号</span>
        <input
          className="u-input"
          name="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          autoFocus
          required
          aria-invalid={error ? true : undefined}
        />
      </label>

      <label className="u-field">
        <span className="u-field__label">密码</span>
        <input
          className="u-input"
          name="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
          aria-invalid={error ? true : undefined}
        />
      </label>

      {error ? (
        <p className="u-notice u-notice--danger u-mb" role="alert">
          {error}
        </p>
      ) : null}

      <button type="submit" className="u-btn u-btn--primary u-btn--block" disabled={busy}>
        {busy ? '登录中…' : '登录'}
      </button>
    </form>
  );
}

/** ToastProvider 必须在表单外层（表单要能用 useToast） */
export function LoginForm() {
  return (
    <ToastProvider>
      <LoginFormInner />
    </ToastProvider>
  );
}
