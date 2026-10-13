'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pagination } from '@/components/common/Pagination';
import { Modal } from '@/components/feedback/Modal';
import { useToast } from '@/components/feedback/Toast';
import { api, errorMessage, fieldErrors } from '@/lib/client/api';
import type { RoleRow, UserRow } from '@/lib/services/systemService';

interface UserListData {
  total: number;
  page: number;
  pageSize: number;
  rows: UserRow[];
}

interface FormState {
  username: string;
  displayName: string;
  employeeNo: string;
  email: string;
  phone: string;
  department: string;
  status: 'active' | 'disabled';
  roleIds: number[];
  newPassword: string;
}

const EMPTY_FORM: FormState = {
  username: '',
  displayName: '',
  employeeNo: '',
  email: '',
  phone: '',
  department: '',
  status: 'active',
  roleIds: [],
  newPassword: '',
};

const STATUS_LABELS: Record<string, string> = { active: '启用', disabled: '停用' };

/**
 * 用户表格（客户端组件）。
 *
 * 覆盖三件事：新建/编辑账号、分配角色、重置密码。
 *   - 角色用勾选框分配（避免多选下拉在移动端难用），提交 roleIds；
 *     服务端会校验角色存在且启用，无效角色返回字段级 422。
 *   - 重置密码单独一个对话框：重置成功后明确提示「该用户的登录会话已失效、
 *     下次登录必须修改密码」—— 这不是文案修辞，而是 session_version+1 的真实效果。
 *   - 列表与响应中没有任何密码哈希，只显示是否已设置密码（hasPassword）。
 */
export function UserTable({
  initial,
  roles,
  canWrite,
  currentUserId,
}: {
  initial: UserListData;
  roles: RoleRow[];
  canWrite: boolean;
  currentUserId: number;
}) {
  const toast = useToast();

  const [rows, setRows] = useState<UserRow[]>(initial.rows);
  const [total, setTotal] = useState(initial.total);
  const [page, setPage] = useState(initial.page);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [roleId, setRoleId] = useState('');
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [editing, setEditing] = useState<UserRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [resetting, setResetting] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

  const pageSize = initial.pageSize;

  const load = useCallback(
    async (nextPage: number, nextKeyword: string, nextStatus: string, nextRoleId: string) => {
      setLoading(true);
      setListError(null);
      try {
        const params = new URLSearchParams({ page: String(nextPage), pageSize: String(pageSize) });
        if (nextKeyword) params.set('keyword', nextKeyword);
        if (nextStatus) params.set('status', nextStatus);
        if (nextRoleId) params.set('roleId', nextRoleId);
        const data = await api.get<UserListData>(`/api/system/users?${params.toString()}`);
        setRows(data.rows);
        setTotal(data.total);
        setPage(data.page);
      } catch (caught) {
        setListError(errorMessage(caught, '加载用户列表失败。'));
      } finally {
        setLoading(false);
      }
    },
    [pageSize],
  );

  const skipFirstEffect = useRef(true);
  useEffect(() => {
    if (skipFirstEffect.current) {
      skipFirstEffect.current = false;
      return;
    }
    void load(page, keyword, status, roleId);
  }, [page, keyword, status, roleId, load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFieldError({});
    setFormOpen(true);
  };

  const openEdit = (row: UserRow) => {
    setEditing(row);
    setForm({
      username: row.username,
      displayName: row.displayName,
      employeeNo: row.employeeNo ?? '',
      email: row.email ?? '',
      phone: row.phone ?? '',
      department: row.department ?? '',
      status: row.status,
      roleIds: row.roles.map((role) => role.id),
      newPassword: '',
    });
    setFormError(null);
    setFieldError({});
    setFormOpen(true);
  };

  const submitForm = async () => {
    setSaving(true);
    setFormError(null);
    setFieldError({});

    const payload: Record<string, unknown> = {
      username: form.username.trim(),
      displayName: form.displayName.trim(),
      employeeNo: form.employeeNo.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      department: form.department.trim() || null,
      status: form.status,
      roleIds: form.roleIds,
    };
    if (!editing && form.newPassword) payload.newPassword = form.newPassword;

    try {
      if (editing) {
        await api.put('/api/system/users', { id: editing.id, ...payload });
        toast.success(`用户「${payload.displayName as string}」已更新。`);
      } else {
        await api.post('/api/system/users', payload);
        toast.success(`用户「${payload.displayName as string}」已创建。`);
        setNotice(
          form.newPassword
            ? `已创建账号「${form.username.trim()}」。首次登录必须修改初始密码。`
            : `已创建账号「${form.username.trim()}」，尚未设置密码；请使用「重置密码」为该账号设置登录密码。`,
        );
      }
      setFormOpen(false);
      await load(editing ? page : 1, keyword, status, roleId);
    } catch (caught) {
      setFieldError(fieldErrors(caught));
      setFormError(errorMessage(caught, '保存失败，请稍后重试。'));
    } finally {
      setSaving(false);
    }
  };

  const toggleRole = (id: number) => {
    setForm((previous) => ({
      ...previous,
      roleIds: previous.roleIds.includes(id)
        ? previous.roleIds.filter((item) => item !== id)
        : [...previous.roleIds, id],
    }));
  };

  const submitReset = async () => {
    if (!resetting) return;
    if (newPassword !== repeatPassword) {
      setResetError('两次输入的新密码不一致。');
      return;
    }
    setResetBusy(true);
    setResetError(null);
    try {
      await api.put('/api/system/users', { id: resetting.id, newPassword });
      const name = resetting.displayName;
      setResetting(null);
      setNewPassword('');
      setRepeatPassword('');
      setNotice(
        `已重置「${name}」的登录密码：该用户的登录会话已全部失效（session_version 已递增），` +
          '需要重新登录，且下次登录时必须修改密码。',
      );
      toast.success(`已重置「${name}」的密码，该用户的登录会话已失效。`);
      await load(page, keyword, status, roleId);
    } catch (caught) {
      setResetError(errorMessage(caught, '重置密码失败，请稍后重试。'));
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <>
      <section className="p-panel">
        <div className="p-panel__head">
          <h2>账号清单</h2>
          {canWrite ? (
            <button type="button" className="u-btn u-btn--primary u-btn--small" onClick={openCreate}>
              新建用户
            </button>
          ) : null}
        </div>
        <div className="p-panel__body">
          {notice ? (
            <div className="u-notice u-notice--info u-mb" role="status">
              {notice}
            </div>
          ) : null}

          <div className="u-row" style={{ marginBottom: 12 }}>
            <label className="u-field" style={{ marginBottom: 0, minWidth: 220 }}>
              <span className="u-field__label">关键字</span>
              <input
                className="u-input"
                value={keyword}
                placeholder="登录名 / 姓名 / 工号 / 邮箱 / 部门"
                onChange={(event) => {
                  setKeyword(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label className="u-field" style={{ marginBottom: 0, minWidth: 150 }}>
              <span className="u-field__label">角色</span>
              <select
                className="u-select"
                value={roleId}
                onChange={(event) => {
                  setRoleId(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">全部</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="u-field" style={{ marginBottom: 0, minWidth: 130 }}>
              <span className="u-field__label">状态</span>
              <select
                className="u-select"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">全部</option>
                <option value="active">启用</option>
                <option value="disabled">停用</option>
              </select>
            </label>
            <button
              type="button"
              className="u-btn u-btn--small"
              style={{ marginTop: 18 }}
              onClick={() => void load(page, keyword, status, roleId)}
              disabled={loading}
            >
              刷新
            </button>
          </div>

          {listError ? (
            <div className="u-notice u-notice--danger u-mb" role="alert">
              {listError}
            </div>
          ) : null}

          <div className="u-table-wrap">
            <table className="u-table">
              <thead>
                <tr>
                  <th>登录名</th>
                  <th>姓名</th>
                  <th>工号</th>
                  <th>部门</th>
                  <th>角色</th>
                  <th>状态</th>
                  <th>密码状态</th>
                  <th>最近登录</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((row) => (
                    <tr key={row.id}>
                      <td className="u-num u-nowrap">
                        {row.username}
                        {row.id === currentUserId ? (
                          <span className="u-tag u-tag--info" style={{ marginLeft: 6 }}>
                            当前登录
                          </span>
                        ) : null}
                      </td>
                      <td>{row.displayName}</td>
                      <td className="u-num">{row.employeeNo ?? '无数据'}</td>
                      <td>{row.department ?? '无数据'}</td>
                      <td>
                        <div className="u-row" style={{ gap: 4 }}>
                          {row.roles.length ? (
                            row.roles.map((role) => (
                              <span className="u-tag" key={role.id}>
                                {role.name}
                              </span>
                            ))
                          ) : (
                            <span className="u-xs u-faint">未分配角色</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`u-tag ${row.status === 'active' ? 'u-tag--success' : 'u-tag--danger'}`}>
                          {STATUS_LABELS[row.status] ?? row.status}
                        </span>
                      </td>
                      <td className="u-nowrap">
                        {row.hasPassword ? (
                          row.mustResetPassword ? (
                            <span className="u-tag u-tag--pending">待首次改密</span>
                          ) : (
                            <span className="u-tag u-tag--success">已设置</span>
                          )
                        ) : (
                          <span className="u-tag u-tag--medium">未设置密码</span>
                        )}
                      </td>
                      <td className="u-num u-nowrap">{row.lastLoginAt ?? '无数据'}</td>
                      <td className="u-nowrap">
                        {canWrite ? (
                          <>
                            <button
                              type="button"
                              className="u-btn u-btn--small"
                              onClick={() => openEdit(row)}
                            >
                              编辑
                            </button>{' '}
                            <button
                              type="button"
                              className="u-btn u-btn--small"
                              onClick={() => {
                                setResetting(row);
                                setNewPassword('');
                                setRepeatPassword('');
                                setResetError(null);
                              }}
                            >
                              重置密码
                            </button>
                          </>
                        ) : (
                          <span className="u-xs u-faint">只读</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9}>
                      <div className="u-empty">当前没有符合条件的账号。</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} disabled={loading} />
        </div>
      </section>

      <Modal
        open={formOpen}
        title={editing ? `编辑用户：${editing.displayName}` : '新建用户'}
        width={680}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <button type="button" className="u-btn u-btn--small" onClick={() => setFormOpen(false)}>
              取消
            </button>
            <button
              type="button"
              className="u-btn u-btn--primary u-btn--small"
              onClick={submitForm}
              disabled={saving}
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </>
        }
      >
        {formError ? (
          <div className="u-notice u-notice--danger u-mb" role="alert">
            {formError}
          </div>
        ) : null}

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
          <label className="u-field">
            <span className="u-field__label">登录名 *</span>
            <input
              className="u-input"
              value={form.username}
              aria-invalid={fieldError.username ? 'true' : undefined}
              placeholder="例如 qe_zhang"
              onChange={(event) => setForm({ ...form, username: event.target.value })}
            />
            {fieldError.username ? <span className="u-field__error">{fieldError.username}</span> : null}
            <span className="u-field__hint">字母开头，可含数字、点、下划线、短横线</span>
          </label>
          <label className="u-field">
            <span className="u-field__label">姓名 *</span>
            <input
              className="u-input"
              value={form.displayName}
              aria-invalid={fieldError.displayName ? 'true' : undefined}
              placeholder="例如 张工"
              onChange={(event) => setForm({ ...form, displayName: event.target.value })}
            />
            {fieldError.displayName ? (
              <span className="u-field__error">{fieldError.displayName}</span>
            ) : null}
          </label>
          <label className="u-field">
            <span className="u-field__label">工号</span>
            <input
              className="u-input"
              value={form.employeeNo}
              aria-invalid={fieldError.employeeNo ? 'true' : undefined}
              onChange={(event) => setForm({ ...form, employeeNo: event.target.value })}
            />
            {fieldError.employeeNo ? <span className="u-field__error">{fieldError.employeeNo}</span> : null}
          </label>
          <label className="u-field">
            <span className="u-field__label">部门</span>
            <input
              className="u-input"
              value={form.department}
              onChange={(event) => setForm({ ...form, department: event.target.value })}
            />
          </label>
          <label className="u-field">
            <span className="u-field__label">邮箱（通知收件地址）</span>
            <input
              className="u-input"
              value={form.email}
              aria-invalid={fieldError.email ? 'true' : undefined}
              placeholder="例如 zhang.quality@ppr.local"
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
            {fieldError.email ? <span className="u-field__error">{fieldError.email}</span> : null}
            <span className="u-field__hint">未配置邮箱的账号不会收到预警通知</span>
          </label>
          <label className="u-field">
            <span className="u-field__label">手机号</span>
            <input
              className="u-input"
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
            />
          </label>
        </div>

        <label className="u-field" style={{ maxWidth: 220 }}>
          <span className="u-field__label">账号状态</span>
          <select
            className="u-select"
            value={form.status}
            disabled={editing?.id === currentUserId}
            onChange={(event) =>
              setForm({ ...form, status: event.target.value as 'active' | 'disabled' })
            }
          >
            <option value="active">启用</option>
            <option value="disabled">停用</option>
          </select>
          <span className="u-field__hint">
            {editing?.id === currentUserId
              ? '不能停用当前登录账号'
              : '停用后该账号无法登录，且已签发的会话立即失效'}
          </span>
        </label>

        <div className="u-field">
          <span className="u-field__label">角色分配</span>
          <div className="u-row">
            {roles.map((role) => (
              <label className="u-row" key={role.id} style={{ gap: 6, marginRight: 12 }}>
                <input
                  type="checkbox"
                  checked={form.roleIds.includes(role.id)}
                  onChange={() => toggleRole(role.id)}
                />
                <span className="u-small">
                  {role.name}
                  <span className="u-faint u-xs">（{role.code}）</span>
                </span>
              </label>
            ))}
          </div>
          {fieldError.roleIds ? <span className="u-field__error">{fieldError.roleIds}</span> : null}
          <span className="u-field__hint">
            角色决定可访问的页面与操作；权限变更在下一次请求即生效
          </span>
        </div>

        {!editing ? (
          <label className="u-field">
            <span className="u-field__label">初始密码（可选）</span>
            <input
              className="u-input"
              type="password"
              value={form.newPassword}
              aria-invalid={fieldError.newPassword ? 'true' : undefined}
              autoComplete="new-password"
              placeholder="至少 8 位，含大小写字母/数字/符号中的两类"
              onChange={(event) => setForm({ ...form, newPassword: event.target.value })}
            />
            {fieldError.newPassword ? (
              <span className="u-field__error">{fieldError.newPassword}</span>
            ) : null}
            <span className="u-field__hint">
              留空则不设置密码，该账号需管理员重置密码后才能登录；设置后首次登录必须修改密码
            </span>
          </label>
        ) : (
          <p className="u-xs u-faint">
            修改密码请使用列表中的「重置密码」操作（重置会强制该用户重新登录）。
          </p>
        )}
      </Modal>

      <Modal
        open={resetting !== null}
        title={resetting ? `重置密码：${resetting.displayName}` : '重置密码'}
        width={520}
        onClose={() => setResetting(null)}
        footer={
          <>
            <button type="button" className="u-btn u-btn--small" onClick={() => setResetting(null)}>
              取消
            </button>
            <button
              type="button"
              className="u-btn u-btn--danger u-btn--small"
              onClick={submitReset}
              disabled={resetBusy}
            >
              {resetBusy ? '重置中…' : '确认重置'}
            </button>
          </>
        }
      >
        {resetting ? (
          <>
            <div className="u-notice u-notice--warning u-mb">
              重置后「{resetting.username}」的<strong>所有登录会话立即失效</strong>
              （服务端 session_version 递增），该用户必须重新登录，且下次登录时必须修改密码。
            </div>
            <label className="u-field">
              <span className="u-field__label">新密码 *</span>
              <input
                className="u-input"
                type="password"
                value={newPassword}
                autoComplete="new-password"
                placeholder="至少 8 位，含大小写字母/数字/符号中的两类"
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>
            <label className="u-field">
              <span className="u-field__label">确认新密码 *</span>
              <input
                className="u-input"
                type="password"
                value={repeatPassword}
                autoComplete="new-password"
                onChange={(event) => setRepeatPassword(event.target.value)}
              />
            </label>
            {resetError ? (
              <div className="u-notice u-notice--danger" role="alert">
                {resetError}
              </div>
            ) : null}
          </>
        ) : null}
      </Modal>
    </>
  );
}
