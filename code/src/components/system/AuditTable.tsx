'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pagination } from '@/components/common/Pagination';
import { api, errorMessage } from '@/lib/client/api';
import type { AuditRow } from '@/lib/services/systemService';

interface AuditListData {
  total: number;
  page: number;
  pageSize: number;
  rows: AuditRow[];
  facets: AuditFacets;
}

interface AuditFacets {
  modules: Array<{ value: string; label: string }>;
  actions: Array<{ value: string; label: string }>;
}

/** 首屏由服务端渲染的数据（facets 由页面单独传入） */
interface AuditInitial {
  total: number;
  page: number;
  pageSize: number;
  rows: AuditRow[];
}

/**
 * 操作日志表格（客户端组件，只读）。
 *
 * 过滤维度与接口一致：模块 / 动作 / 时间范围 / 关键字。
 * 下拉选项来自接口返回的 facets（库里实际出现过的取值），
 * 避免前端写死枚举后与后端取值脱节。
 * 每行的「明细」用于展开 detail_json（结构化改动前后），
 * 表格本身不提供任何写操作 —— 审计日志只能由业务动作产生。
 */
export function AuditTable({
  initial,
  facets,
}: {
  initial: AuditInitial;
  facets: AuditFacets;
}) {
  const [rows, setRows] = useState<AuditRow[]>(initial.rows);
  const [total, setTotal] = useState(initial.total);
  const [page, setPage] = useState(initial.page);
  const [module, setModule] = useState('');
  const [actionType, setActionType] = useState('');
  const [keyword, setKeyword] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [options, setOptions] = useState(facets);

  const pageSize = initial.pageSize;

  const load = useCallback(
    async (query: {
      page: number;
      module: string;
      actionType: string;
      keyword: string;
      from: string;
      to: string;
    }) => {
      setLoading(true);
      setListError(null);
      try {
        const params = new URLSearchParams({
          page: String(query.page),
          pageSize: String(pageSize),
        });
        if (query.module) params.set('module', query.module);
        if (query.actionType) params.set('actionType', query.actionType);
        if (query.keyword) params.set('keyword', query.keyword);
        if (query.from) params.set('from', query.from);
        if (query.to) params.set('to', query.to);
        const data = await api.get<AuditListData>(`/api/system/audit?${params.toString()}`);
        setRows(data.rows);
        setTotal(data.total);
        setPage(data.page);
        setOptions(data.facets);
      } catch (caught) {
        setListError(errorMessage(caught, '加载操作日志失败。'));
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
    void load({ page, module, actionType, keyword, from, to });
  }, [page, module, actionType, keyword, from, to, load]);

  return (
    <section className="p-panel">
      <div className="p-panel__head">
        <h2>审计记录</h2>
        <span className="u-xs u-faint">共 {total} 条</span>
      </div>
      <div className="p-panel__body">
        <div className="u-row" style={{ marginBottom: 12 }}>
          <label className="u-field" style={{ marginBottom: 0, minWidth: 220 }}>
            <span className="u-field__label">关键字</span>
            <input
              className="u-input"
              value={keyword}
              placeholder="操作说明 / 对象 / 操作人"
              onChange={(event) => {
                setKeyword(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="u-field" style={{ marginBottom: 0, minWidth: 160 }}>
            <span className="u-field__label">模块</span>
            <select
              className="u-select"
              value={module}
              onChange={(event) => {
                setModule(event.target.value);
                setPage(1);
              }}
            >
              <option value="">全部</option>
              {options.modules.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="u-field" style={{ marginBottom: 0, minWidth: 160 }}>
            <span className="u-field__label">动作</span>
            <select
              className="u-select"
              value={actionType}
              onChange={(event) => {
                setActionType(event.target.value);
                setPage(1);
              }}
            >
              <option value="">全部</option>
              {options.actions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="u-field" style={{ marginBottom: 0, minWidth: 160 }}>
            <span className="u-field__label">开始日期</span>
            <input
              className="u-input"
              type="date"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="u-field" style={{ marginBottom: 0, minWidth: 160 }}>
            <span className="u-field__label">结束日期</span>
            <input
              className="u-input"
              type="date"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <button
            type="button"
            className="u-btn u-btn--small"
            style={{ marginTop: 18 }}
            onClick={() => void load({ page, module, actionType, keyword, from, to })}
            disabled={loading}
          >
            刷新
          </button>
          <button
            type="button"
            className="u-btn u-btn--small"
            style={{ marginTop: 18 }}
            onClick={() => {
              setModule('');
              setActionType('');
              setKeyword('');
              setFrom('');
              setTo('');
              setPage(1);
            }}
            disabled={loading}
          >
            清空条件
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
                <th>时间</th>
                <th>操作人</th>
                <th>模块</th>
                <th>动作</th>
                <th>对象</th>
                <th>说明</th>
                <th>来源 IP</th>
                <th>明细</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td className="u-num u-nowrap">{row.createdAt}</td>
                    <td className="u-nowrap">
                      {row.userName ?? '系统任务'}
                      {row.username ? <div className="u-xs u-faint">{row.username}</div> : null}
                    </td>
                    <td className="u-nowrap">
                      <span className="u-tag">{row.moduleLabel}</span>
                    </td>
                    <td className="u-nowrap">{row.actionLabel}</td>
                    <td className="u-num u-nowrap">
                      {row.targetType ?? '—'}
                      {row.targetId ? `#${row.targetId}` : ''}
                    </td>
                    <td>{row.detail ?? '无数据'}</td>
                    <td className="u-num u-nowrap">{row.ipAddress ?? '无数据'}</td>
                    <td style={{ minWidth: 120 }}>
                      {row.detailJson ? (
                        <details>
                          <summary className="u-small u-muted">查看结构化明细</summary>
                          <pre
                            className="u-xs"
                            style={{
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-all',
                              background: 'var(--c-surface-alt)',
                              padding: 8,
                              borderRadius: 6,
                              marginTop: 6,
                            }}
                          >
                            {JSON.stringify(row.detailJson, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        <span className="u-xs u-faint">无</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8}>
                    <div className="u-empty">当前筛选条件下没有操作日志。</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} disabled={loading} />
        <p className="u-xs u-faint u-mt">
          审计日志不可修改、不可删除。密码相关内容只记录「发生了改密/重置」这一事实，不记录任何口令内容。
        </p>
      </div>
    </section>
  );
}
