'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, ApiError, fieldErrors } from '@/lib/client/api';
import { useToast } from '@/components/feedback/Toast';

/**
 * 修改密码表单。
 *
 * 密码强度规则与服务端保持一致（service.ts 的 validatePasswordStrength），
 * 前端先校验一遍是为了即时反馈，服务端仍会再校验一次。
 */
export function ChangePasswordForm({ requireCurrent }: { requireCurrent: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFields({});
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setFields({ confirmPassword: '两次输入的新密码不一致。' });
      return;
    }

    setBusy(true);
    try {
      await api.post('/api/auth/change-password', { currentPassword, newPassword });
      toast.success('密码已修改。');
      router.replace('/monitor');
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFields(fieldErrors(caught));
        setMessage(caught.message);
      } else {
        setMessage('修改失败，请稍后重试。');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      {requireCurrent ? (
        <label className="u-field">
          <span className="u-field__label">当前密码</span>
          <input
            className="u-input"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
          {fields.currentPassword ? (
            <span className="u-field__error">{fields.currentPassword}</span>
          ) : null}
        </label>
      ) : null}

      <label className="u-field">
        <span className="u-field__label">新密码</span>
        <input
          className="u-input"
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          autoComplete="new-password"
          required
          minLength={8}
        />
        <span className="u-field__hint">
          至少 8 位，且包含小写字母、大写字母、数字、符号中的至少两类。
        </span>
        {fields.newPassword ? <span className="u-field__error">{fields.newPassword}</span> : null}
      </label>

      <label className="u-field">
        <span className="u-field__label">确认新密码</span>
        <input
          className="u-input"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          autoComplete="new-password"
          required
        />
        {fields.confirmPassword ? (
          <span className="u-field__error">{fields.confirmPassword}</span>
        ) : null}
      </label>

      {message ? (
        <p className="u-notice u-notice--danger u-mb" role="alert">
          {message}
        </p>
      ) : null}

      <button type="submit" className="u-btn u-btn--primary u-btn--block" disabled={busy}>
        {busy ? '提交中…' : '保存新密码'}
      </button>

      <div className="u-mt u-small">
        <Link href="/monitor">返回工作台</Link>
      </div>
    </form>
  );
}
