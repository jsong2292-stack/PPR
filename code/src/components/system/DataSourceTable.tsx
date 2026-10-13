'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pagination } from '@/components/common/Pagination';
import { Modal } from '@/components/feedback/Modal';
import { useToast } from '@/components/feedback/Toast';
import { api, errorMessage, fieldErrors } from '@/lib/client/api';
import type { DataSourceRow } from '@/lib/services/systemService';

interface DataSourceListData {
  total: number;
  page: number;
  pageSize: number;
  rows: DataSourceRow[];
  systemTypes: Array<{ value: string; label: string }>;
}

interface FormState {
  code: string;
  name: string;
  systemType: string;
  description: string;
  status: 'enabled' | 'disabled';
  sortNo: string;
}

const EMPTY_FORM: FormState = {
  code: '',
  name: '',
  systemType: 'manual',
  description: '',
  status: 'enabled',
  sortNo: '0',
};

const STATUS_LABELS: Record<string, string> = { enabled: '启用', disabled: '停用' };

/**
 * 数据来源表格（客户端组件）。
 *
 * 增删改都走 /api/system/data-sources：
 *   - 新增来源固定 is_simulated = 0（接口强制），因此列表里只会出现真实来源；
 *   - 删除前服务端会检查引用，仍有业务数据引用时返回 409 与引用清单，
 *     这里把该提示原样展示，并建议改为「停用」而不是物理删除；
 *   - 编码全局唯一（包括模拟来源占用的编码），冲突时给出字段级提示。
 */
export function DataSourceTable({
  initial,
  canWrite,
}: {
  initial: DataSourceListData;
  canWrite: boolean;
}) {
  const toast = useToast();

  const [rows, setRows] = useState<DataSourceRow[]>(initial.rows);
  const [total, setTotal] = useState(initial.total);
  const [page, setPage] = useState(initial.page);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [systemType, setSystemType] = useState('');
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [editing, setEditing] = useState<DataSourceRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<DataSourceRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const pageSize = initial.pageSize;
  const systemTypes = initial.systemTypes;

  const load = useCallback(
    async (nextPage: number, nextKeyword: string, nextStatus: string, nextType: string) => {
      setLoading(true);
      setListError(null);
      try {
        const params = new URLSearchParams({ page: String(nextPage), pageSize: String(pageSize) });
        if (nextKeyword) params.set('keyword', nextKeyword);
        if (nextStatus) params.set('status', nextStatus);
        if (nextType) params.set('systemType', nextType);
        const data = await api.get<DataSourceListData>(`/api/system/data-sources?${params.toString()}`);
        setRows(data.rows);
        setTotal(data.total);
        setPage(data.page);
      } catch (caught) {
        setListError(errorMessage(caught, '加载数据来源失败。'));
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
    void load(page, keyword, status, systemType);
  }, [page, keyword, status, systemType, load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, sortNo: String((rows.at(-1)?.sortNo ?? 0) + 10) });
    setFormError(null);
    setFieldError({});
    setFormOpen(true);
  };

  const openEdit = (row: DataSourceRow) => {
    setEditing(row);
    setForm({
      code: row.code,
      name: row.name,
      systemType: row.systemType,
      description: row.description ?? '',
      status: row.status,
      sortNo: String(row.sortNo),
    });
    setFormError(null);
    setFieldError({});
    setFormOpen(true);
  };

  const submitForm = async () => {
    setSaving(true);
    setFormError(null);
    setFieldError({});
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      systemType: form.systemType,
      description: form.description.trim() || null,
      status: form.status,
      sortNo: Number(form.sortNo || 0),
    };
    try {
      if (editing) {
        await api.put('/api/system/data-sources', { id: editing.id, ...payload });
        toast.success(`数据来源「${payload.name}」已更新。`);
      } else {
        await api.post('/api/system/data-sources', payload);
        toast.success(`数据来源「${payload.name}」已新增。`);
      }
      setFormOpen(false);
      await load(editing ? page : 1, keyword, status, systemType);
    } catch (caught) {
      setFieldError(fieldErrors(caught));
      setFormError(errorMessage(caught, '保存失败，请稍后重试。'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.del(`/api/system/data-sources?id=${deleting.id}`);
      toast.success(`数据来源「${deleting.name}」已删除。`);
      setDeleting(null);
      await load(page, keyword, status, systemType);
    } catch (caught) {
      // 409：仍有业务数据引用；提示里带有引用条数，原样展示
      setDeleteError(errorMessage(caught, '删除失败，请稍后重试。'));
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <>
      <section className="p-panel">
        <div className="p-panel__head">
          <h2>来源清单</h2>
          {canWrite ? (
            <button type="button" className="u-btn u-btn--primary u-btn--small" onClick={openCreate}>
              新增数据来源
            </button>
          ) : null}
        </div>
        <div className="p-panel__body">
          <div className="u-row" style={{ marginBottom: 12 }}>
            <label className="u-field" style={{ marginBottom: 0, minWidth: 220 }}>
              <span className="u-field__label">关键字</span>
              <input
                className="u-input"
                value={keyword}
                placeholder="编码 / 名称 / 说明"
                onChange={(event) => {
                  setKeyword(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label className="u-field" style={{ marginBottom: 0, minWidth: 150 }}>
              <span className="u-field__label">系统类型</span>
              <select
                className="u-select"
                value={systemType}
                onChange={(event) => {
                  setSystemType(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">全部</option>
                {systemTypes.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
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
                <option value="enabled">启用</option>
                <option value="disabled">停用</option>
              </select>
            </label>
            <button
              type="button"
              className="u-btn u-btn--small"
              style={{ marginTop: 18 }}
              onClick={() => void load(page, keyword, status, systemType)}
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
                  <th>来源编码</th>
                  <th>来源名称</th>
                  <th>系统类型</th>
                  <th>说明</th>
                  <th>排序</th>
                  <th>状态</th>
                  <th>被引用数据</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((row) => (
                    <tr key={row.id}>
                      <td className="u-num u-nowrap">{row.code}</td>
                      <td>{row.name}</td>
                      <td>{row.systemTypeLabel}</td>
                      <td>{row.description ?? '无数据'}</td>
                      <td className="u-num">{row.sortNo}</td>
                      <td>
                        <span className={`u-tag ${row.status === 'enabled' ? 'u-tag--success' : 'u-tag--danger'}`}>
                          {STATUS_LABELS[row.status] ?? row.status}
                        </span>
                      </td>
                      <td className="u-num">{row.usageCount} 条</td>
                      <td className="u-num u-nowrap">{row.updatedAt}</td>
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
                              className="u-btn u-btn--small u-btn--danger"
                              onClick={() => {
                                setDeleting(row);
                                setDeleteError(null);
                              }}
                            >
                              删除
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
                      <div className="u-empty">当前没有符合条件的数据来源。</div>
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
        title={editing ? `编辑数据来源：${editing.name}` : '新增数据来源'}
        width={620}
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
            <span className="u-field__label">来源编码 *</span>
            <input
              className="u-input"
              value={form.code}
              aria-invalid={fieldError.code ? 'true' : undefined}
              placeholder="例如 lims_real"
              onChange={(event) => setForm({ ...form, code: event.target.value })}
            />
            {fieldError.code ? <span className="u-field__error">{fieldError.code}</span> : null}
            <span className="u-field__hint">字母开头，可含数字、下划线、短横线；全局唯一</span>
          </label>
          <label className="u-field">
            <span className="u-field__label">来源名称 *</span>
            <input
              className="u-input"
              value={form.name}
              aria-invalid={fieldError.name ? 'true' : undefined}
              placeholder="例如 LIMS 实验室系统"
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
            {fieldError.name ? <span className="u-field__error">{fieldError.name}</span> : null}
          </label>
          <label className="u-field">
            <span className="u-field__label">系统类型</span>
            <select
              className="u-select"
              value={form.systemType}
              onChange={(event) => setForm({ ...form, systemType: event.target.value })}
            >
              {systemTypes.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="u-field">
            <span className="u-field__label">状态</span>
            <select
              className="u-select"
              value={form.status}
              onChange={(event) =>
                setForm({ ...form, status: event.target.value as 'enabled' | 'disabled' })
              }
            >
              <option value="enabled">启用</option>
              <option value="disabled">停用</option>
            </select>
            <span className="u-field__hint">停用后不再用于新数据录入，历史数据仍保留来源</span>
          </label>
        </div>

        <label className="u-field">
          <span className="u-field__label">说明</span>
          <textarea
            className="u-textarea"
            value={form.description}
            maxLength={255}
            placeholder="例如：LIMS 检验数据接口，每日 08:00 同步"
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
          {fieldError.description ? (
            <span className="u-field__error">{fieldError.description}</span>
          ) : null}
        </label>

        <label className="u-field" style={{ maxWidth: 200 }}>
          <span className="u-field__label">排序号</span>
          <input
            className="u-input"
            type="number"
            value={form.sortNo}
            onChange={(event) => setForm({ ...form, sortNo: event.target.value })}
          />
          {fieldError.sortNo ? <span className="u-field__error">{fieldError.sortNo}</span> : null}
        </label>

        <p className="u-xs u-faint">
          新增的来源固定为生产来源（is_simulated = 0）。标记为模拟来源的记录不会出现在本页，避免把联调数据当成生产数据源维护。
        </p>
      </Modal>

      <Modal
        open={deleting !== null}
        title="删除数据来源"
        width={560}
        onClose={() => setDeleting(null)}
        footer={
          <>
            <button type="button" className="u-btn u-btn--small" onClick={() => setDeleting(null)}>
              取消
            </button>
            <button
              type="button"
              className="u-btn u-btn--danger u-btn--small"
              onClick={confirmDelete}
              disabled={deleteBusy}
            >
              {deleteBusy ? '删除中…' : '确认删除'}
            </button>
          </>
        }
      >
        {deleting ? (
          <>
            <p className="u-small">
              确认删除数据来源「{deleting.name}」（{deleting.code}）？
            </p>
            <p className="u-small u-muted u-mt">
              当前被 {deleting.usageCount} 条业务数据引用。
              若仍有引用，系统会拒绝删除并列出引用明细 —— 请改为把状态设为「停用」。
            </p>
          </>
        ) : null}
        {deleteError ? (
          <div className="u-notice u-notice--danger u-mt" role="alert">
            {deleteError}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
