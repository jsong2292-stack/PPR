'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pagination } from '@/components/common/Pagination';
import { Modal } from '@/components/feedback/Modal';
import { useToast } from '@/components/feedback/Toast';
import { api, errorMessage } from '@/lib/client/api';
import { RISK_LABELS, type RiskType } from '@/lib/types';

interface ArchiveListItem {
  id: number;
  code: string;
  riskType: string;
  ruleCode: string;
  batchNo: string;
  eventCode: string;
  metricName: string | null;
  eventTime: string;
  totalConclusions: number;
  confirmedCount: number;
  rejectedCount: number;
  pendingCount: number;
  archivedAt: string;
  archivedByName: string | null;
  remark: string | null;
}

interface ArchiveListData {
  total: number;
  page: number;
  pageSize: number;
  rows: ArchiveListItem[];
}

interface ArchiveConclusion {
  seq: number;
  hypothesis: string;
  rootCauseCategory: string | null;
  observation: string | null;
  mechanism: string | null;
  missingEvidence: string[];
  validationActions: string | null;
  validationMethod: string | null;
  validationResult: string | null;
  engineerComment: string | null;
  actualFinding: string | null;
  finalAction: string | null;
  engineerDecision: string;
  decidedAt: string | null;
  analysisGeneratedAt: string | null;
}

interface ArchiveDetail {
  archive: ArchiveListItem & { frozen: boolean };
  conclusions: ArchiveConclusion[];
}

const DECISION_LABELS: Record<string, string> = {
  confirmed: '工程师已确认',
  rejected: '工程师已否决',
  pending: '待工程师确认',
};

const DECISION_TONES: Record<string, string> = {
  confirmed: 'u-tag--confirmed',
  rejected: 'u-tag--rejected',
  pending: 'u-tag--pending',
};

/**
 * 归档列表与归档操作（客户端组件）。
 *
 * 两种数据来源分工明确：
 *   - 列表与详情走接口（GET /api/archives、/api/archives/:id），过滤与翻页不需要刷新整页；
 *   - 「按事件编号归档」调 POST /api/archives，把后端的 400/409 中文提示**原样**展示：
 *     例如「还有 N 条结论处于「待工程师确认」状态…」或「该事件已归档（归档编号 …）」。
 *     这类提示直接决定现场下一步做什么，前端不做二次包装或改写成通用文案。
 */
export function ArchiveList({
  initial,
  canArchive,
}: {
  initial: ArchiveListData;
  canArchive: boolean;
}) {
  const toast = useToast();

  const [rows, setRows] = useState<ArchiveListItem[]>(initial.rows);
  const [total, setTotal] = useState(initial.total);
  const [page, setPage] = useState(initial.page);
  const [keyword, setKeyword] = useState('');
  const [riskType, setRiskType] = useState('');
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [eventCode, setEventCode] = useState('');
  const [remark, setRemark] = useState('');
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveOk, setArchiveOk] = useState<string | null>(null);

  const [detail, setDetail] = useState<ArchiveDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const pageSize = initial.pageSize;

  const load = useCallback(
    async (nextPage: number, nextKeyword: string, nextRiskType: string) => {
      setLoading(true);
      setListError(null);
      try {
        const params = new URLSearchParams({ page: String(nextPage), pageSize: String(pageSize) });
        if (nextKeyword) params.set('keyword', nextKeyword);
        if (nextRiskType) params.set('riskType', nextRiskType);
        const data = await api.get<ArchiveListData>(`/api/archives?${params.toString()}`);
        setRows(data.rows);
        setTotal(data.total);
        setPage(data.page);
      } catch (caught) {
        setListError(errorMessage(caught, '加载归档列表失败。'));
      } finally {
        setLoading(false);
      }
    },
    [pageSize],
  );

  // 首屏数据由服务端渲染，跳过挂载时的那次 effect，只在筛选/翻页变化时重新请求
  const skipFirstEffect = useRef(true);
  useEffect(() => {
    if (skipFirstEffect.current) {
      skipFirstEffect.current = false;
      return;
    }
    void load(page, keyword, riskType);
  }, [page, keyword, riskType, load]);

  const openDetail = async (id: number) => {
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    try {
      setDetail(await api.get<ArchiveDetail>(`/api/archives/${id}`));
    } catch (caught) {
      setDetailError(errorMessage(caught, '加载归档详情失败。'));
    } finally {
      setDetailLoading(false);
    }
  };

  const submitArchive = async () => {
    const code = eventCode.trim();
    if (!code) {
      setArchiveError('请先填写要归档的事件编号（例如 QE-12121D0032-20261009-001）。');
      return;
    }
    setArchiving(true);
    setArchiveError(null);
    setArchiveOk(null);
    try {
      const result = await api.post<{ code: string; conclusions: number; confirmed: number; rejected: number }>(
        '/api/archives',
        { eventCode: code, remark: remark.trim() || null },
      );
      setArchiveOk(
        `归档成功：${result.code}，已冻结 ${result.conclusions} 条结论（确认 ${result.confirmed} / 否决 ${result.rejected}）。`,
      );
      toast.success(`事件 ${code} 已归档（${result.code}）。`);
      setEventCode('');
      setRemark('');
      await load(1, keyword, riskType);
    } catch (caught) {
      // 400/409 的中文提示原样展示（含「还有 N 条结论待确认」）
      setArchiveError(errorMessage(caught, '归档失败，请稍后重试。'));
    } finally {
      setArchiving(false);
    }
  };

  return (
    <>
      <section className="p-panel">
        <div className="p-panel__head">
          <div>
            <h2>按事件编号归档</h2>
            <div className="u-xs u-faint u-mt">
              填写预警事件编号 → 系统校验该事件结论是否已全部确认/否决 → 冻结为归档快照
            </div>
          </div>
        </div>
        <div className="p-panel__body">
          {canArchive ? (
            <>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(220px, 2fr) minmax(220px, 3fr)' }}>
                <label className="u-field">
                  <span className="u-field__label">事件编号</span>
                  <input
                    className="u-input"
                    value={eventCode}
                    placeholder="例如 QE-12121D0032-20261009-001"
                    onChange={(event) => setEventCode(event.target.value)}
                  />
                  <span className="u-field__hint">可在「质量监控与预警」的待处理事件列表复制</span>
                </label>
                <label className="u-field">
                  <span className="u-field__label">归档备注（可选）</span>
                  <input
                    className="u-input"
                    value={remark}
                    maxLength={500}
                    placeholder="例如：现场已复核，随 8D 报告一并归档"
                    onChange={(event) => setRemark(event.target.value)}
                  />
                  <span className="u-field__hint">备注会一起冻结进归档记录</span>
                </label>
              </div>
              <div className="u-row">
                <button
                  type="button"
                  className="u-btn u-btn--primary"
                  onClick={submitArchive}
                  disabled={archiving}
                >
                  {archiving ? '归档中…' : '执行归档'}
                </button>
                <span className="u-xs u-faint">
                  归档不可修改、不可删除；同一事件只能归档一次。
                </span>
              </div>
            </>
          ) : (
            <div className="u-notice u-notice--info">
              当前账号没有「analysis:archive」权限，只能查看归档记录，不能执行归档。
            </div>
          )}

          {archiveOk ? <div className="u-notice u-notice--info u-mt">{archiveOk}</div> : null}
          {archiveError ? (
            <div className="u-notice u-notice--danger u-mt" role="alert">
              {archiveError}
            </div>
          ) : null}
        </div>
      </section>

      <section className="p-panel">
        <div className="p-panel__head">
          <h2>归档记录</h2>
          <span className="u-xs u-faint">共 {total} 条</span>
        </div>
        <div className="p-panel__body">
          <div className="u-row" style={{ marginBottom: 12 }}>
            <label className="u-field" style={{ marginBottom: 0, minWidth: 240 }}>
              <span className="u-field__label">关键字</span>
              <input
                className="u-input"
                value={keyword}
                placeholder="归档案号 / 批次号 / 事件编号"
                onChange={(event) => {
                  setKeyword(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label className="u-field" style={{ marginBottom: 0, minWidth: 160 }}>
              <span className="u-field__label">风险等级</span>
              <select
                className="u-select"
                value={riskType}
                onChange={(event) => {
                  setRiskType(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">全部</option>
                <option value="medium">中风险</option>
                <option value="high">高风险</option>
                <option value="error">数据报错</option>
              </select>
            </label>
            <button
              type="button"
              className="u-btn u-btn--small"
              style={{ marginTop: 18 }}
              onClick={() => void load(page, keyword, riskType)}
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
                  <th>归档案号</th>
                  <th>事件编号</th>
                  <th>批次</th>
                  <th>规则</th>
                  <th>风险</th>
                  <th>异常指标</th>
                  <th>结论（确认/否决）</th>
                  <th>归档时间</th>
                  <th>归档人</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((row) => (
                    <tr key={row.id}>
                      <td className="u-num u-nowrap">{row.code}</td>
                      <td className="u-num u-nowrap">{row.eventCode}</td>
                      <td className="u-num">{row.batchNo}</td>
                      <td className="u-nowrap">
                        <span className="u-tag">{row.ruleCode}</span>
                      </td>
                      <td>
                        <span className={`u-tag u-tag--${row.riskType}`}>
                          {RISK_LABELS[row.riskType as RiskType] ?? row.riskType}
                        </span>
                      </td>
                      <td>{row.metricName ?? '无数据'}</td>
                      <td className="u-num u-nowrap">
                        {row.totalConclusions} 条（{row.confirmedCount}/{row.rejectedCount}）
                      </td>
                      <td className="u-num u-nowrap">{row.archivedAt}</td>
                      <td>{row.archivedByName ?? '无数据'}</td>
                      <td>
                        <button
                          type="button"
                          className="u-btn u-btn--small"
                          onClick={() => void openDetail(row.id)}
                        >
                          查看快照
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10}>
                      <div className="u-empty">
                        当前没有归档记录。填写事件编号并执行归档后，这里会显示冻结的结论快照。
                      </div>
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
        open={detail !== null || detailLoading || detailError !== null}
        title={detail ? `归档快照 ${detail.archive.code}` : '归档快照'}
        width={880}
        onClose={() => {
          setDetail(null);
          setDetailError(null);
        }}
        footer={
          <button
            type="button"
            className="u-btn u-btn--small"
            onClick={() => {
              setDetail(null);
              setDetailError(null);
            }}
          >
            关闭
          </button>
        }
      >
        {detailLoading ? <div className="u-empty">加载中…</div> : null}
        {detailError ? <div className="u-notice u-notice--danger">{detailError}</div> : null}
        {detail ? (
          <>
            <div className="u-notice u-notice--info u-mb">
              本页数据为归档时点冻结的快照，不随源数据变化。归档时间：
              {detail.archive.archivedAt} · 归档人：{detail.archive.archivedByName ?? '无数据'}
              {detail.archive.remark ? ` · 备注：${detail.archive.remark}` : ''}
            </div>

            {detail.conclusions.length ? (
              detail.conclusions.map((item) => (
                <div key={item.seq} className="p-conclusion">
                  <div className="p-conclusion__head">
                    <span className="p-conclusion__rank">#{item.seq + 1}</span>
                    <span className={`u-tag ${DECISION_TONES[item.engineerDecision] ?? ''}`}>
                      {DECISION_LABELS[item.engineerDecision] ?? item.engineerDecision}
                    </span>
                  </div>
                  <div className="p-conclusion__body">
                    <p className="u-small u-strong">{item.hypothesis}</p>
                    {item.rootCauseCategory ? (
                      <p className="u-xs u-faint u-mt">类别：{item.rootCauseCategory}</p>
                    ) : null}
                    {item.observation ? (
                      <p className="u-small u-mt">观察事实：{item.observation}</p>
                    ) : null}
                    {item.mechanism ? (
                      <p className="u-small u-mt">机理背景：{item.mechanism}</p>
                    ) : null}
                    {item.missingEvidence.length ? (
                      <p className="u-small u-mt">缺失资料：{item.missingEvidence.join('；')}</p>
                    ) : null}
                    {item.validationMethod ? (
                      <p className="u-small u-mt">验证方法：{item.validationMethod}</p>
                    ) : null}
                    {item.validationResult ? (
                      <p className="u-small u-mt">验证结果：{item.validationResult}</p>
                    ) : null}
                    {item.engineerComment ? (
                      <p className="u-small u-mt">工程师备注：{item.engineerComment}</p>
                    ) : null}
                    {item.actualFinding ? (
                      <p className="u-small u-mt">实际发现：{item.actualFinding}</p>
                    ) : null}
                    {item.finalAction ? (
                      <p className="u-small u-mt">最终处置：{item.finalAction}</p>
                    ) : null}
                    <p className="u-xs u-faint u-mt">
                      判定时间：{item.decidedAt ?? '无数据'} · 结论生成时间：
                      {item.analysisGeneratedAt ?? '无数据'}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="u-empty">该归档没有结论快照。</div>
            )}
          </>
        ) : null}
      </Modal>
    </>
  );
}
