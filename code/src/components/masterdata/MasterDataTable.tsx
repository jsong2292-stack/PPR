'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { MasterColumn, MasterField } from '@/lib/masterdata/resources';
import { ApiError, api, errorMessage, fieldErrors } from '@/lib/client/api';
import { Modal } from '@/components/feedback/Modal';
import { useToast } from '@/components/feedback/Toast';
import {
  MasterDataForm,
  defaultFormValues,
  rowToFormValues,
  type MasterFormValue,
  type MasterFormValues,
} from './MasterDataForm';

/**
 * 主数据列表（客户端）。
 *
 * 页面（服务端组件）从资源配置里取出 columns / fields 传进来，
 * 本组件负责：拼查询串 → 请求接口 → 渲染表格 / 分页 / 新增 / 编辑 / 删除。
 *
 * 权限来源：**由服务端页面通过 props 传入**（页面内 `requirePermission('masterdata:read')`
 * 拿到会话用户后用 `can(user, 'masterdata:write' | 'masterdata:delete')` 计算）。
 * 这样首屏就按权限渲染，不需要额外请求 /api/auth/session，也不会出现按钮先显示后隐藏的抖动。
 * 前端隐藏按钮只是体验层面，真正的鉴权仍在接口侧（withApi 的 permission 声明）。
 *
 */

const PAGE_SIZE = 20;

interface MasterRow {
  id: number;
  [key: string]: unknown;
}

interface ListResponse {
  rows: MasterRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface Notice {
  tone: 'danger' | 'warning' | 'info';
  text: string;
}

/** 枚举列的展示文案（与资源配置里的取值保持一致） */
const VALUE_LABELS: Record<string, Record<string, string>> = {
  metricRole: {
    primary: 'primary（参与判定）',
    raw: 'raw（原始测点）',
    derived: 'derived（计算指标）',
  },
  limitType: {
    demo: 'demo（额定参数试运行）',
    internal: 'internal（企业内控标准）',
    standard: 'standard（国家/行业标准）',
  },
  calibrationStatus: {
    demo: '阈值待现场标定',
    pending_field_validation: '待现场验证',
    validated: '已标定',
  },
};

const STATUS_LABELS: Record<string, string> = {
  enabled: '启用',
  disabled: '停用',
};

const DEFAULT_EMPTY = '—';

export function MasterDataTable({
  resourceKey,
  singular,
  plural,
  columns,
  fields,
  canWrite,
  canDelete,
}: {
  /** 资源配置 key，同时作为 REST 路径片段（如 'equipment-types'） */
  resourceKey: string;
  singular: string;
  plural: string;
  columns: MasterColumn[];
  fields: MasterField[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  const toast = useToast();

  const [rows, setRows] = useState<MasterRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // inputKeyword 是输入框的值，keyword 是已提交、真正参与查询的值
  const [inputKeyword, setInputKeyword] = useState('');
  const [keyword, setKeyword] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  const [notice, setNotice] = useState<Notice | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<MasterRow | null>(null);
  const [formValues, setFormValues] = useState<MasterFormValues>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<MasterRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setLoadError(null);
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(PAGE_SIZE),
        });
        if (keyword) params.set('keyword', keyword);
        const data = await api.get<ListResponse>(
          `/api/masterdata/${resourceKey}?${params.toString()}`,
          { signal },
        );
        setRows(data.rows ?? []);
        setTotal(data.total ?? 0);
      } catch (caught) {
        if ((caught as { name?: string })?.name === 'AbortError') return;
        setLoadError(errorMessage(caught, `加载${plural}列表失败。`));
        setRows([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [resourceKey, page, keyword, plural],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, reloadToken]);

  const refresh = useCallback(() => setReloadToken((value) => value + 1), []);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    setPage(1);
    setKeyword(inputKeyword.trim());
    refresh();
  }

  function resetSearch() {
    setInputKeyword('');
    setKeyword('');
    setPage(1);
    refresh();
  }

  function openCreate() {
    setEditingRow(null);
    setFormValues(defaultFormValues(fields));
    setFormErrors({});
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(row: MasterRow) {
    setEditingRow(row);
    setFormValues(rowToFormValues(fields, row));
    setFormErrors({});
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm() {
    if (saving) return;
    setFormOpen(false);
    setEditingRow(null);
    setFormErrors({});
    setFormError(null);
  }

  function changeField(key: string, value: MasterFormValue) {
    setFormValues((previous) => ({ ...previous, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setFormErrors({});
    setFormError(null);
    setNotice(null);
    try {
      if (editingRow) {
        await api.put(`/api/masterdata/${resourceKey}/${editingRow.id}`, formValues);
        toast.success(`${singular}「${rowTitle(editingRow)}」已保存。`);
      } else {
        await api.post(`/api/masterdata/${resourceKey}`, formValues);
        toast.success(`已新增${singular}。`);
      }
      setFormOpen(false);
      setEditingRow(null);
      refresh();
    } catch (caught) {
      // 422：字段级错误标到对应输入框；没有字段归属的提示放到表单顶部
      const { _: general, ...fieldMap } = fieldErrors(caught);
      setFormErrors(fieldMap);
      setFormError(
        general ?? (Object.keys(fieldMap).length ? null : errorMessage(caught, '保存失败，请稍后重试。')),
      );
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.del(`/api/masterdata/${resourceKey}/${pendingDelete.id}`);
      toast.success(`${singular}「${rowTitle(pendingDelete)}」已删除。`);
      setPendingDelete(null);
      // 删掉当前页最后一条时回退一页，避免停在空页
      if (rows.length === 1 && page > 1) setPage((value) => value - 1);
      else refresh();
    } catch (caught) {
      const message = errorMessage(caught, '删除失败，请稍后重试。');
      if (caught instanceof ApiError && caught.status === 409) {
        // 409：仍被其他数据引用。服务端的说明原样展示，并补上引用来源与条数（extra 字段）
        const reference = typeof caught.extra?.reference === 'string' ? caught.extra.reference : null;
        const count = typeof caught.extra?.count === 'number' ? caught.extra.count : null;
        const detail =
          reference && count !== null ? `${message}（引用来源：${reference}，共 ${count} 条）` : message;
        setDeleteError(detail);
        setNotice({ tone: 'danger', text: detail });
      } else {
        setDeleteError(message);
        setNotice({ tone: 'danger', text: message });
      }
    } finally {
      setDeleting(false);
    }
  }

  const lastPageStart = (page - 1) * PAGE_SIZE + 1;
  const lastPageEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <>
      {notice ? (
        <div className={`u-notice u-notice--${notice.tone} u-mb`}>
          <div className="u-row u-row--between">
            <span>{notice.text}</span>
            <button
              type="button"
              className="u-btn u-btn--ghost u-btn--small"
              onClick={() => setNotice(null)}
            >
              知道了
            </button>
          </div>
        </div>
      ) : null}

      <section className="p-panel">
        <div className="p-panel__head">
          <div>
            <h2>{plural}列表</h2>
            <div className="u-xs u-faint u-mt">
              共 {total} 条 · 按关键字匹配编码 / 名称 / 说明；删除前会检查是否存在引用数据
            </div>
          </div>
          {canWrite ? (
            <button type="button" className="u-btn u-btn--primary u-btn--small" onClick={openCreate}>
              新增{singular}
            </button>
          ) : (
            <span className="u-tag">只读权限</span>
          )}
        </div>

        <div className="p-panel__body">
          <form className="u-search u-mb" onSubmit={submitSearch} role="search">
            <input
              className="u-input"
              type="search"
              value={inputKeyword}
              placeholder={`搜索${plural}：编码 / 名称 / 说明`}
              aria-label={`搜索${plural}`}
              onChange={(event) => setInputKeyword(event.target.value)}
            />
            <button type="submit" className="u-btn u-btn--small">
              搜索
            </button>
            {keyword ? (
              <button type="button" className="u-btn u-btn--small u-btn--ghost" onClick={resetSearch}>
                重置
              </button>
            ) : null}
          </form>

          {loadError ? <div className="u-notice u-notice--danger u-mb">{loadError}</div> : null}

          <div className="u-table-wrap">
            <table className="u-table">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      style={column.width ? { width: column.width } : undefined}
                      className={column.align === 'right' ? 'u-num' : undefined}
                    >
                      {column.label}
                    </th>
                  ))}
                  {canWrite || canDelete ? <th>操作</th> : null}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={columns.length + (canWrite || canDelete ? 1 : 0)}>
                      <div className="u-empty">加载中…</div>
                    </td>
                  </tr>
                ) : rows.length ? (
                  rows.map((row) => (
                    <tr key={row.id}>
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          className={column.align === 'right' ? 'u-num' : undefined}
                        >
                          {renderCell(column, row[column.key])}
                        </td>
                      ))}
                      {canWrite || canDelete ? (
                        <td>
                          <div className="u-row">
                            {canWrite ? (
                              <button
                                type="button"
                                className="u-btn u-btn--small"
                                onClick={() => openEdit(row)}
                              >
                                编辑
                              </button>
                            ) : null}
                            {canDelete ? (
                              <button
                                type="button"
                                className="u-btn u-btn--small u-btn--danger"
                                onClick={() => {
                                  setDeleteError(null);
                                  setPendingDelete(row);
                                }}
                              >
                                删除
                              </button>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={columns.length + (canWrite || canDelete ? 1 : 0)}>
                      <div className="u-empty">
                        {keyword
                          ? `没有匹配「${keyword}」的${plural}。可清空关键字后重试。`
                          : `暂无${plural}数据，可通过「新增${singular}」录入。`}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="u-row u-row--between u-mt">
            <span className="u-small u-muted">
              {total ? `第 ${lastPageStart}–${lastPageEnd} 条 / 共 ${total} 条` : '共 0 条'}
            </span>
            <div className="u-row">
              <button
                type="button"
                className="u-btn u-btn--small"
                disabled={loading || page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                上一页
              </button>
              <span className="u-small u-muted">
                第 {page} / {totalPages} 页
              </span>
              <button
                type="button"
                className="u-btn u-btn--small"
                disabled={loading || page >= totalPages}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              >
                下一页
              </button>
            </div>
          </div>
        </div>
      </section>

      <Modal
        open={formOpen}
        title={editingRow ? `编辑${singular}` : `新增${singular}`}
        onClose={closeForm}
        width={720}
        dismissible={!saving}
        footer={
          <>
            <button type="button" className="u-btn" onClick={closeForm} disabled={saving}>
              取消
            </button>
            <button
              type="submit"
              form="master-data-form"
              className="u-btn u-btn--primary"
              disabled={saving}
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </>
        }
      >
        <MasterDataForm
          fields={fields}
          values={formValues}
          errors={formErrors}
          generalError={formError}
          disabled={saving}
          onSubmit={save}
          onChange={changeField}
        />
      </Modal>

      <Modal
        open={pendingDelete !== null}
        title={`删除${singular}`}
        onClose={() => {
          if (!deleting) {
            setPendingDelete(null);
            setDeleteError(null);
          }
        }}
        width={520}
        dismissible={!deleting}
        footer={
          <>
            <button
              type="button"
              className="u-btn"
              disabled={deleting}
              onClick={() => {
                setPendingDelete(null);
                setDeleteError(null);
              }}
            >
              取消
            </button>
            <button
              type="button"
              className="u-btn u-btn--danger"
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {deleting ? '删除中…' : '确认删除'}
            </button>
          </>
        }
      >
        {pendingDelete ? (
          <>
            <p className="u-small">
              确认删除{singular}「<strong>{rowTitle(pendingDelete)}</strong>」？
              带软删除标记的主数据会被置为停用并移出列表；若仍被其他数据引用，服务端会拒绝删除并说明引用来源。
            </p>
            {deleteError ? (
              <div className="u-notice u-notice--danger u-mt">{deleteError}</div>
            ) : null}
          </>
        ) : null}
      </Modal>
    </>
  );
}

/** 行标题：优先名称，其次编码，最后 id —— 用于删除确认与提示文案 */
function rowTitle(row: MasterRow): string {
  for (const key of ['name', 'specName', 'metricName', 'code']) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      return String(value);
    }
  }
  return String(row.id);
}

/** 单元格渲染：枚举走文案映射，空值统一显示占位符 */
function renderCell(column: MasterColumn, value: unknown) {
  if (value === null || value === undefined || value === '') {
    return <span className="u-faint">{DEFAULT_EMPTY}</span>;
  }

  if (typeof value === 'boolean') return value ? '是' : '否';

  const text = String(value);

  if (column.key === 'status') {
    const label = STATUS_LABELS[text] ?? text;
    return (
      <span className={text === 'enabled' ? 'u-tag u-tag--success' : 'u-tag'}>{label}</span>
    );
  }

  const mapped = VALUE_LABELS[column.key]?.[text];
  return mapped ?? text;
}
