'use client';

/**
 * 数据源管理通用表格面板（客户端组件）。
 *
 * 职责：
 *   - 渲染服务端首屏传入的数据（SSR），后续交互（关键字 / 分页 / 筛选 / 详情）走接口
 *   - 分页与关键字一律通过查询参数表达，并同步回地址栏，刷新与分享链接可复现
 *   - 数值缺失统一显示「无数据」（useMemo 不参与），绝不显示 0
 *
 * 之所以由页面传入列定义，是因为六类数据源列差异较大，而交互行为完全一致：
 * 把「列」当数据、把「行为」当组件，避免六个页面各写一套表格逻辑。
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, errorMessage } from '@/lib/client/api';
import { NO_DATA, fmt } from '@/lib/format';

export interface DataTableColumn {
  /** 取值键，支持 'metrics.outer_diameter' 这样的嵌套路径 */
  key: string;
  label: string;
  kind?: 'text' | 'number' | 'datetime' | 'date' | 'time' | 'tag' | 'bool';
  digits?: number;
  /** 缺失时的展示文案，默认「无数据」 */
  fallback?: string;
  /** 取值 → 展示文案（枚举/状态列） */
  map?: Record<string, string>;
  /** tag 列的颜色语义 */
  tone?: Record<string, 'normal' | 'medium' | 'high' | 'error' | 'info'>;
  align?: 'left' | 'right';
}

export interface DataTableFilter {
  /** 查询参数名 */
  name: string;
  label: string;
  options: Array<{ value: string; label: string }>;
}

export interface DataTableDetailConfig {
  title: string;
  fields: Array<{
    key: string;
    label: string;
    kind?: DataTableColumn['kind'];
    digits?: number;
    map?: Record<string, string>;
    tone?: DataTableColumn['tone'];
    fallback?: string;
  }>;
  /** 长表指标值：从 row[metrics.key] 中按键取值，缺失显示「无数据」 */
  metrics?: {
    key: string;
    unit?: string;
    digits?: number;
    labels: Record<string, string>;
  };
  /** 子表（如工艺记录的温区值数组） */
  list?: {
    key: string;
    title: string;
    emptyText?: string;
    columns: Array<{
      key: string;
      label: string;
      kind?: DataTableColumn['kind'];
      digits?: number;
      fallback?: string;
    }>;
  };
}

export interface DataTablePanelProps {
  /** 资源键，与 /api/datasource/:resource 一致 */
  resource: string;
  columns: DataTableColumn[];
  initialRows: Array<Record<string, unknown>>;
  initialTotal: number;
  initialPage: number;
  initialPageSize: number;
  initialKeyword?: string;
  initialFilters?: Record<string, string>;
  searchPlaceholder?: string;
  filters?: DataTableFilter[];
  rowKey?: string;
  emptyText?: string;
  detail?: DataTableDetailConfig;
}

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200];

/** 按 'a.b' 路径取值 */
function pick(row: Record<string, unknown>, key: string): unknown {
  if (!key.includes('.')) return row[key];
  let current: unknown = row;
  for (const part of key.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function isMissing(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

/** 单元格渲染：所有分支都把「缺数据」渲染成文案，而不是 0 / 空 */
function renderCell(value: unknown, column: DataTableColumn) {
  const fallback = column.fallback ?? NO_DATA;
  if (isMissing(value)) return <span className="u-faint">{fallback}</span>;

  switch (column.kind) {
    case 'number':
      return <span className="u-num">{fmt(value, column.digits ?? 2, fallback)}</span>;
    case 'date':
      return <span className="u-num">{String(value).slice(0, 10)}</span>;
    case 'time':
      return <span className="u-num">{String(value).slice(0, 5)}</span>;
    case 'datetime':
      return <span className="u-num">{String(value).replace('T', ' ').slice(0, 19)}</span>;
    case 'bool':
      return <span className="u-tag">{Number(value) === 1 ? '是' : '否'}</span>;
    case 'tag': {
      const raw = String(value);
      const label = column.map?.[raw] ?? raw;
      const tone = column.tone?.[raw];
      return <span className={tone ? `u-tag u-tag--${tone}` : 'u-tag'}>{label}</span>;
    }
    default: {
      const raw = String(value);
      if (column.map) return <span>{column.map[raw] ?? raw}</span>;
      return <span>{raw}</span>;
    }
  }
}

export function DataTablePanel({
  resource,
  columns,
  initialRows,
  initialTotal,
  initialPage,
  initialPageSize,
  initialKeyword = '',
  initialFilters = {},
  searchPlaceholder = '输入编号或名称搜索',
  filters = [],
  rowKey = 'id',
  emptyText = '没有符合条件的数据。',
  detail,
}: DataTablePanelProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [rows, setRows] = useState(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [keyword, setKeyword] = useState(initialKeyword);
  const [filterValues, setFilterValues] = useState<Record<string, string>>(initialFilters);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [detailId, setDetailId] = useState<unknown>(null);
  const [detailRow, setDetailRow] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const syncUrl = useCallback(
    (next: {
      page: number;
      pageSize: number;
      keyword: string;
      filters: Record<string, string>;
    }) => {
      const params = new URLSearchParams();
      if (next.keyword) params.set('keyword', next.keyword);
      for (const [name, value] of Object.entries(next.filters)) {
        if (value) params.set(name, value);
      }
      if (next.page > 1) params.set('page', String(next.page));
      if (next.pageSize !== 20) params.set('pageSize', String(next.pageSize));
      const queryString = params.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const load = useCallback(
    async (
      next: {
        page: number;
        pageSize: number;
        keyword: string;
        filters: Record<string, string>;
      },
      options?: { sync?: boolean },
    ) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set('page', String(next.page));
        params.set('pageSize', String(next.pageSize));
        if (next.keyword) params.set('keyword', next.keyword);
        for (const [name, value] of Object.entries(next.filters)) {
          if (value) params.set(name, value);
        }
        const data = await api.get<{
          rows: Array<Record<string, unknown>>;
          total: number;
          page: number;
          pageSize: number;
        }>(`/api/datasource/${resource}?${params.toString()}`);
        setRows(data.rows ?? []);
        setTotal(Number(data.total ?? 0));
        setPage(Number(data.page ?? next.page));
        setPageSize(Number(data.pageSize ?? next.pageSize));
        setDetailId(null);
        setDetailRow(null);
        if (options?.sync !== false) syncUrl(next);
      } catch (caught) {
        setError(errorMessage(caught, '加载数据失败。'));
        setRows([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [resource, syncUrl],
  );

  // 首屏没有服务端数据时（部分资源无法在此页做分页查询），按当前查询参数补拉一次
  useEffect(() => {
    if (initialRows.length === 0) {
      void load(
        {
          page: initialPage,
          pageSize: initialPageSize,
          keyword: initialKeyword,
          filters: initialFilters,
        },
        { sync: false },
      );
    }
    // 只在挂载时执行；后续交互由用户操作驱动
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applySearch = useCallback(() => {
    void load({ page: 1, pageSize, keyword: keyword.trim(), filters: filterValues });
  }, [filterValues, keyword, load, pageSize]);

  const changePage = useCallback(
    (nextPage: number) => {
      if (nextPage < 1 || nextPage > totalPages || nextPage === page) return;
      void load({ page: nextPage, pageSize, keyword: keyword.trim(), filters: filterValues });
    },
    [filterValues, keyword, load, page, pageSize, totalPages],
  );

  const changePageSize = useCallback(
    (nextSize: number) => {
      // 单页最大 200 条（服务端 paginationSchema 同样限制）
      const size = Math.min(200, Math.max(1, nextSize));
      setPageSize(size);
      void load({ page: 1, pageSize: size, keyword: keyword.trim(), filters: filterValues });
    },
    [filterValues, keyword, load],
  );

  const changeFilter = useCallback(
    (name: string, value: string) => {
      const next = { ...filterValues, [name]: value };
      setFilterValues(next);
      void load({ page: 1, pageSize, keyword: keyword.trim(), filters: next });
    },
    [filterValues, keyword, load, pageSize],
  );

  const toggleDetail = useCallback(
    async (row: Record<string, unknown>) => {
      if (!detail) return;
      const id = row[rowKey];
      if (detailId === id) {
        setDetailId(null);
        setDetailRow(null);
        return;
      }
      setDetailId(id);
      setDetailRow(null);
      setDetailError(null);
      setDetailLoading(true);
      try {
        const data = await api.get<{ row: Record<string, unknown> }>(
          `/api/datasource/${resource}?id=${encodeURIComponent(String(id))}`,
        );
        setDetailRow(data.row ?? null);
      } catch (caught) {
        setDetailError(errorMessage(caught, '加载详情失败。'));
      } finally {
        setDetailLoading(false);
      }
    },
    [detail, detailId, resource, rowKey],
  );

  const handleRefresh = useCallback(() => {
    void load({ page, pageSize, keyword: keyword.trim(), filters: filterValues });
  }, [filterValues, keyword, load, page, pageSize]);

  const columnCount = columns.length;
  const detailMetrics = useMemo(() => {
    if (!detail?.metrics || !detailRow) return [];
    const bucket = pick(detailRow, detail.metrics.key);
    if (!bucket || typeof bucket !== 'object') return [];
    return Object.entries(detail.metrics.labels).map(([code, label]) => {
      const value = (bucket as Record<string, unknown>)[code];
      return { code, label, value: isMissing(value) ? null : value };
    });
  }, [detail, detailRow]);

  const detailRows = useMemo(() => {
    if (!detail?.list || !detailRow) return [];
    const bucket = pick(detailRow, detail.list.key);
    return Array.isArray(bucket) ? (bucket as Array<Record<string, unknown>>) : [];
  }, [detail, detailRow]);

  return (
    <section className="p-panel">
      <div className="p-panel__head">
        <div className="u-row">
          <form
            className="u-row"
            onSubmit={(event) => {
              event.preventDefault();
              applySearch();
            }}
          >
            <input
              className="u-input"
              style={{ width: 240 }}
              type="search"
              value={keyword}
              placeholder={searchPlaceholder}
              aria-label="关键字搜索"
              onChange={(event) => setKeyword(event.target.value)}
            />
            <button className="u-btn u-btn--primary" type="submit" disabled={loading}>
              搜索
            </button>
          </form>
          {filters.map((filter) => (
            <select
              key={filter.name}
              className="u-select"
              style={{ width: 160 }}
              aria-label={filter.label}
              value={filterValues[filter.name] ?? ''}
              onChange={(event) => changeFilter(filter.name, event.target.value)}
            >
              <option value="">{filter.label}（全部）</option>
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ))}
        </div>
        <div className="u-row">
          <span className="u-xs u-faint">
            共 {total} 条 · 第 {page} / {totalPages} 页
          </span>
          <select
            className="u-select"
            style={{ width: 110 }}
            aria-label="每页条数"
            value={pageSize}
            onChange={(event) => changePageSize(Number(event.target.value))}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                每页 {size} 条
              </option>
            ))}
          </select>
          <button
            className="u-btn u-btn--small"
            type="button"
            onClick={handleRefresh}
            disabled={loading}
          >
            {loading ? '加载中…' : '刷新'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="p-panel__body">
          <div className="u-notice u-notice--danger">{error}</div>
        </div>
      ) : null}

      <div className="u-table-wrap">
        <table className="u-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} style={column.align === 'right' ? { textAlign: 'right' } : undefined}>
                  {column.label}
                </th>
              ))}
              {detail ? <th style={{ width: 72 }}>明细</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row, index) => {
                const id = row[rowKey] ?? index;
                const expanded = detail ? detailId === row[rowKey] : false;
                return (
                  <Fragment key={String(id)}>
                    <tr
                      onClick={detail ? () => void toggleDetail(row) : undefined}
                      style={detail ? { cursor: 'pointer' } : undefined}
                    >
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          style={column.align === 'right' ? { textAlign: 'right' } : undefined}
                        >
                          {renderCell(pick(row, column.key), column)}
                        </td>
                      ))}
                      {detail ? (
                        <td>
                          <button className="u-btn u-btn--small" type="button">
                            {expanded ? '收起' : '查看'}
                          </button>
                        </td>
                      ) : null}
                    </tr>
                    {expanded ? (
                      <tr>
                        <td colSpan={columnCount + 1} style={{ background: 'var(--c-surface-alt)' }}>
                          <div className="u-small">
                            <div className="u-row u-row--between u-mb">
                              <strong>{detail?.title}</strong>
                              <span className="u-xs u-faint">编号 {String(id)}</span>
                            </div>
                            {detailLoading ? (
                              <div className="u-empty">加载中…</div>
                            ) : detailError ? (
                              <div className="u-notice u-notice--danger">{detailError}</div>
                            ) : detailRow ? (
                              <>
                                <dl className="u-small">
                                  {detail?.fields.map((field) => {
                                    const value = pick(detailRow, field.key);
                                    const column: DataTableColumn = {
                                      key: field.key,
                                      label: field.label,
                                      kind: field.kind,
                                      digits: field.digits,
                                      map: field.map,
                                      tone: field.tone,
                                      fallback: field.fallback,
                                    };
                                    return (
                                      <div
                                        key={field.key}
                                        className="u-row u-row--between"
                                        style={{ alignItems: 'baseline' }}
                                      >
                                        <span className="u-faint u-xs">{field.label}</span>
                                        <span>{renderCell(value, column)}</span>
                                      </div>
                                    );
                                  })}
                                </dl>
                                {detail?.metrics ? (
                                  <>
                                    <div className="u-divider" />
                                    <div className="u-strong u-small u-mb">指标值明细</div>
                                    <div className="u-table-wrap">
                                      <table className="u-table">
                                        <thead>
                                          <tr>
                                            <th>指标</th>
                                            <th>取值</th>
                                            <th>状态</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {detailMetrics.length ? (
                                            detailMetrics.map((metric) => (
                                              <tr key={metric.code}>
                                                <td>{metric.label}</td>
                                                <td className="u-num">
                                                  {metric.value === null
                                                    ? NO_DATA
                                                    : `${fmt(metric.value, detail.metrics?.digits ?? 3)}${
                                                        detail.metrics?.unit
                                                          ? ` ${detail.metrics.unit}`
                                                          : ''
                                                      }`}
                                                </td>
                                                <td>
                                                  {metric.value === null ? (
                                                    <span className="u-tag">无数据</span>
                                                  ) : (
                                                    <span className="u-tag u-tag--normal">已记录</span>
                                                  )}
                                                </td>
                                              </tr>
                                            ))
                                          ) : (
                                            <tr>
                                              <td colSpan={3}>
                                                <div className="u-empty">
                                                  该记录没有指标值行，全部按「无数据」处理。
                                                </div>
                                              </td>
                                            </tr>
                                          )}
                                        </tbody>
                                      </table>
                                    </div>
                                  </>
                                ) : null}
                                {detail?.list ? (
                                  <>
                                    <div className="u-divider" />
                                    <div className="u-strong u-small u-mb">{detail.list.title}</div>
                                    <div className="u-table-wrap">
                                      <table className="u-table">
                                        <thead>
                                          <tr>
                                            {detail.list.columns.map((column) => (
                                              <th key={column.key}>{column.label}</th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {detailRows.length ? (
                                            detailRows.map((item, itemIndex) => (
                                              <tr key={String(item.id ?? itemIndex)}>
                                                {detail.list?.columns.map((column) => (
                                                  <td key={column.key}>
                                                    {renderCell(pick(item, column.key), column)}
                                                  </td>
                                                ))}
                                              </tr>
                                            ))
                                          ) : (
                                            <tr>
                                              <td colSpan={detail.list.columns.length}>
                                                <div className="u-empty">
                                                  {detail.list.emptyText ??
                                                    '该记录没有子表明细，按「无数据」处理。'}
                                                </div>
                                              </td>
                                            </tr>
                                          )}
                                        </tbody>
                                      </table>
                                    </div>
                                  </>
                                ) : null}
                              </>
                            ) : (
                              <div className="u-empty">未找到该记录。</div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            ) : (
              <tr>
                <td colSpan={columnCount + (detail ? 1 : 0)}>
                  <div className="u-empty">{emptyText}</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="p-panel__body">
        <div className="u-row u-row--between">
          <span className="u-xs u-faint">
            单页最多 200 条；分页与关键字通过查询参数保存，可直接复制地址栏链接。
          </span>
          <div className="u-row">
            <button
              className="u-btn u-btn--small"
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => changePage(page - 1)}
            >
              上一页
            </button>
            <button
              className="u-btn u-btn--small"
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => changePage(page + 1)}
            >
              下一页
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
