'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pagination } from '@/components/common/Pagination';
import { Modal } from '@/components/feedback/Modal';
import { useToast } from '@/components/feedback/Toast';
import { api, errorMessage } from '@/lib/client/api';
import { RISK_LABELS, type RiskType } from '@/lib/types';

interface NotificationListItem {
  id: number;
  code: string;
  subject: string;
  status: string;
  channel: string;
  triggerMode: string;
  attemptCount: number;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
  eventCode: string | null;
  riskType: string | null;
  batchNo: string | null;
  recipientCount: number;
}

interface NotificationListData {
  total: number;
  page: number;
  pageSize: number;
  rows: NotificationListItem[];
}

interface NotificationDetail {
  notification: {
    id: number;
    code: string;
    subject: string;
    body: string;
    status: string;
    channel: string;
    triggerMode: string;
    attemptCount: number;
    errorMessage: string | null;
    sentAt: string | null;
    createdAt: string;
  };
  recipients: Array<{
    id: number;
    recipientName: string;
    recipientAddress: string | null;
    deliveryStatus: string;
    readAt: string | null;
    ackStatus: string;
    ackAt: string | null;
    ackComment: string | null;
  }>;
}

/**
 * 通知状态文案。
 * 取值与 GET /api/notifications 的 status 过滤枚举保持一致：
 * pending / sent / failed / simulated / cancelled（queued、skipped 为历史取值，保留兜底）。
 */
const STATUS_LABELS: Record<string, string> = {
  pending: '待发送',
  sent: '已发送',
  failed: '发送失败',
  simulated: '模拟发送',
  cancelled: '未发送（未配置邮件通道）',
  // 历史/兼容取值
  queued: '待发送',
  skipped: '未发送（未配置邮件通道）',
};

const STATUS_TONES: Record<string, string> = {
  pending: 'u-tag--pending',
  sent: 'u-tag--success',
  failed: 'u-tag--danger',
  simulated: 'u-tag--info',
  cancelled: 'u-tag--medium',
  queued: 'u-tag--pending',
  skipped: 'u-tag--medium',
};

const DELIVERY_LABELS: Record<string, string> = {
  queued: '待投递',
  pending: '待投递',
  sent: '已投递',
  failed: '投递失败',
  skipped: '未投递（无通道）',
};

const TRIGGER_LABELS: Record<string, string> = {
  manual: '人工触发',
  auto: '规则自动触发',
};

const ACK_LABELS: Record<string, string> = {
  pending: '待确认',
  acknowledged: '已确认',
  rejected: '已拒绝',
};

/**
 * 通知列表与发送（客户端组件）。
 *
 * 发送只要求填写事件编号：收件人由服务端按风险等级选角色
 * （error/high → 质量工程师 + 质量负责人 + 工艺工程师；其余 → 质量工程师），
 * 并跳过未配置邮箱的账号。这里不提供收件人勾选，因为通知发送权限
 * （notification:send）与用户管理权限（system:read）是分开的，
 * 能在本页发通知的角色不一定有权列出全部用户。
 */
export function NotificationList({
  initial,
  canSend,
}: {
  initial: NotificationListData;
  canSend: boolean;
}) {
  const toast = useToast();

  const [rows, setRows] = useState<NotificationListItem[]>(initial.rows);
  const [total, setTotal] = useState(initial.total);
  const [page, setPage] = useState(initial.page);
  const [status, setStatus] = useState('');
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [eventCode, setEventCode] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendOk, setSendOk] = useState<string | null>(null);

  const [detail, setDetail] = useState<NotificationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const pageSize = initial.pageSize;

  const load = useCallback(
    async (nextPage: number, nextStatus: string, nextKeyword: string) => {
      setLoading(true);
      setListError(null);
      try {
        const params = new URLSearchParams({ page: String(nextPage), pageSize: String(pageSize) });
        if (nextStatus) params.set('status', nextStatus);
        if (nextKeyword) params.set('keyword', nextKeyword);
        const data = await api.get<NotificationListData>(`/api/notifications?${params.toString()}`);
        setRows(data.rows);
        setTotal(data.total);
        setPage(data.page);
      } catch (caught) {
        setListError(errorMessage(caught, '加载通知记录失败。'));
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
    void load(page, status, keyword);
  }, [page, status, keyword, load]);

  const openDetail = async (id: number) => {
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    try {
      setDetail(await api.get<NotificationDetail>(`/api/notifications/${id}`));
    } catch (caught) {
      setDetailError(errorMessage(caught, '加载通知详情失败。'));
    } finally {
      setDetailLoading(false);
    }
  };

  const submitSend = async () => {
    const code = eventCode.trim();
    if (!code) {
      setSendError('请先填写预警事件编号。');
      return;
    }
    setSending(true);
    setSendError(null);
    setSendOk(null);
    try {
      const result = await api.post<{
        code: string;
        recipients: number;
        delivery: { status: string; error: string | null };
      }>('/api/notifications', { eventCode: code });
      const deliveryLabel = STATUS_LABELS[result.delivery.status] ?? result.delivery.status;
      const noChannel = ['cancelled', 'skipped'].includes(result.delivery.status);
      setSendOk(
        `通知 ${result.code} 已生成，收件人 ${result.recipients} 人；投递结果：${deliveryLabel}` +
          (result.delivery.error ? `（${result.delivery.error}）` : '') +
          (noChannel
            ? '。当前未配置 SMTP，通知已落库，可由人工外发。'
            : '。'),
      );
      toast.success(`通知 ${result.code} 已生成。`);
      setEventCode('');
      await load(1, status, keyword);
    } catch (caught) {
      setSendError(errorMessage(caught, '发送通知失败。'));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <section className="p-panel">
        <div className="p-panel__head">
          <div>
            <h2>生成并发送通知</h2>
            <div className="u-xs u-faint u-mt">
              按风险等级自动选择收件角色：数据报错 / 高风险 → 质量工程师 + 质量负责人 + 工艺工程师；其余 → 质量工程师。
              未配置邮箱的账号会被跳过。
            </div>
          </div>
        </div>
        <div className="p-panel__body">
          {canSend ? (
            <>
              <label className="u-field" style={{ maxWidth: 420 }}>
                <span className="u-field__label">预警事件编号</span>
                <input
                  className="u-input"
                  value={eventCode}
                  placeholder="例如 QE-12121D0032-20261009-001"
                  onChange={(event) => setEventCode(event.target.value)}
                />
                <span className="u-field__hint">可在「质量监控与预警」的待处理事件列表复制</span>
              </label>
              <button
                type="button"
                className="u-btn u-btn--primary"
                onClick={submitSend}
                disabled={sending}
              >
                {sending ? '生成中…' : '生成通知'}
              </button>
            </>
          ) : (
            <div className="u-notice u-notice--info">
              当前账号没有「notification:send」权限，只能查看通知记录，不能发起通知。
            </div>
          )}

          {sendOk ? <div className="u-notice u-notice--info u-mt">{sendOk}</div> : null}
          {sendError ? (
            <div className="u-notice u-notice--danger u-mt" role="alert">
              {sendError}
            </div>
          ) : null}
        </div>
      </section>

      <section className="p-panel">
        <div className="p-panel__head">
          <h2>通知记录</h2>
          <span className="u-xs u-faint">共 {total} 条</span>
        </div>
        <div className="p-panel__body">
          <div className="u-row" style={{ marginBottom: 12 }}>
            <label className="u-field" style={{ marginBottom: 0, minWidth: 240 }}>
              <span className="u-field__label">关键字</span>
              <input
                className="u-input"
                value={keyword}
                placeholder="通知编号 / 主题 / 批次号"
                onChange={(event) => {
                  setKeyword(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label className="u-field" style={{ marginBottom: 0, minWidth: 180 }}>
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
                <option value="pending">待发送</option>
                <option value="sent">已发送</option>
                <option value="failed">发送失败</option>
                <option value="simulated">模拟发送</option>
                <option value="cancelled">未发送（未配置邮件通道）</option>
              </select>
            </label>
            <button
              type="button"
              className="u-btn u-btn--small"
              style={{ marginTop: 18 }}
              onClick={() => void load(page, status, keyword)}
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
                  <th>通知编号</th>
                  <th>主题</th>
                  <th>事件编号</th>
                  <th>批次</th>
                  <th>风险</th>
                  <th>触发方式</th>
                  <th>状态</th>
                  <th>收件人</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((row) => (
                    <tr key={row.id}>
                      <td className="u-num u-nowrap">{row.code}</td>
                      <td>{row.subject}</td>
                      <td className="u-num u-nowrap">{row.eventCode ?? '无数据'}</td>
                      <td className="u-num">{row.batchNo ?? '无数据'}</td>
                      <td>
                        {row.riskType ? (
                          <span className={`u-tag u-tag--${row.riskType}`}>
                            {RISK_LABELS[row.riskType as RiskType] ?? row.riskType}
                          </span>
                        ) : (
                          '无数据'
                        )}
                      </td>
                      <td>{TRIGGER_LABELS[row.triggerMode] ?? row.triggerMode}</td>
                      <td>
                        <span className={`u-tag ${STATUS_TONES[row.status] ?? ''}`}>
                          {STATUS_LABELS[row.status] ?? row.status}
                        </span>
                        {row.errorMessage ? (
                          <div className="u-xs u-faint u-mt">{row.errorMessage}</div>
                        ) : null}
                      </td>
                      <td className="u-num">{row.recipientCount} 人</td>
                      <td className="u-num u-nowrap">{row.createdAt}</td>
                      <td>
                        <button
                          type="button"
                          className="u-btn u-btn--small"
                          onClick={() => void openDetail(row.id)}
                        >
                          详情
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10}>
                      <div className="u-empty">
                        当前没有通知记录。可在上方填写事件编号生成通知，或等待规则引擎命中后自动生成。
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
        title={detail ? `通知详情 ${detail.notification.code}` : '通知详情'}
        width={760}
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
            <p className="u-small u-strong">{detail.notification.subject}</p>
            <p className="u-xs u-faint u-mt">
              状态：{STATUS_LABELS[detail.notification.status] ?? detail.notification.status} · 渠道：
              {detail.notification.channel} · 触发方式：
              {TRIGGER_LABELS[detail.notification.triggerMode] ?? detail.notification.triggerMode} · 尝试次数：
              {detail.notification.attemptCount} · 发送时间：{detail.notification.sentAt ?? '无数据'}
            </p>
            {detail.notification.errorMessage ? (
              <div className="u-notice u-notice--warning u-mt">{detail.notification.errorMessage}</div>
            ) : null}

            <div className="u-divider" />
            <h3 className="u-small u-strong u-mb">通知正文（落库快照）</h3>
            <pre
              className="u-small"
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                background: 'var(--c-surface-alt)',
                padding: 10,
                borderRadius: 6,
                margin: 0,
              }}
            >
              {detail.notification.body}
            </pre>

            <div className="u-divider" />
            <h3 className="u-small u-strong u-mb">收件人与回执</h3>
            <div className="u-table-wrap">
              <table className="u-table">
                <thead>
                  <tr>
                    <th>收件人</th>
                    <th>收件地址</th>
                    <th>投递状态</th>
                    <th>阅读时间</th>
                    <th>确认状态</th>
                    <th>确认说明</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.recipients.length ? (
                    detail.recipients.map((recipient) => (
                      <tr key={recipient.id}>
                        <td>{recipient.recipientName}</td>
                        <td className="u-num">{recipient.recipientAddress ?? '无数据'}</td>
                        <td>{DELIVERY_LABELS[recipient.deliveryStatus] ?? recipient.deliveryStatus}</td>
                        <td className="u-num">{recipient.readAt ?? '无数据'}</td>
                        <td>{ACK_LABELS[recipient.ackStatus] ?? recipient.ackStatus}</td>
                        <td>{recipient.ackComment ?? '无数据'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6}>
                        <div className="u-empty">该通知没有收件人记录。</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </Modal>
    </>
  );
}
