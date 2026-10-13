import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { requirePermission } from '@/lib/auth/session';
import { listReports } from '@/lib/services/reportService';
import { fmtCount, NO_DATA } from '@/lib/format';
import {
  REPORT_STATUS_LABELS,
  RISK_LABELS,
  type ReportStatus,
  type RiskType,
} from '@/lib/types';

export const metadata: Metadata = { title: '8D 报告工作台' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

/**
 * 8D 报告列表（服务端页面）。
 *
 * 列表本身不做任何「是否可定稿」的推断：必填缺失数量由后端按
 * is_required 字段统计后返回（missingRequired），前端只如实展示。
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; keyword?: string }>;
}) {
  await requirePermission('report:read');
  const query = await searchParams;

  const page = Math.max(1, Number(query.page) || 1);
  const status =
    query.status === 'draft' || query.status === 'finalized' ? query.status : undefined;
  const keyword = query.keyword?.trim() || undefined;

  const result = await listReports({ page, pageSize: PAGE_SIZE, status, keyword });
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  const draftCount = result.rows.filter((row) => row.status === 'draft').length;
  const finalizedCount = result.rows.filter((row) => row.status === 'finalized').length;
  const missingTotal = result.rows.reduce((sum, row) => sum + row.missingRequired, 0);

  return (
    <>
      <PageHeader
        title="8D 报告工作台"
        description="8D 是现场质量问题的标准处理格式，D1–D8 缺一不可。报告只继承「工程师已确认」的结论作为根本原因，未确认的假设不会进入定稿内容。"
        meta={
          <>
            <span className="u-tag u-tag--info">报告总数 {fmtCount(result.total)}</span>
            <span className="u-tag u-tag--pending">本页草稿 {fmtCount(draftCount)}</span>
            <span className="u-tag u-tag--normal">本页已定稿 {fmtCount(finalizedCount)}</span>
            {missingTotal > 0 ? (
              <span className="u-tag u-tag--medium">本页必填缺失合计 {fmtCount(missingTotal)} 项</span>
            ) : null}
          </>
        }
        actions={
          <Link className="u-btn" href="/diagnosis">
            从异常诊断生成报告
          </Link>
        }
      />

      <section className="p-panel u-mb">
        <div className="p-panel__head">
          <h2>筛选</h2>
          <span className="u-xs u-faint">按报告编号 / 批次号 / 事件编号模糊匹配</span>
        </div>
        <div className="p-panel__body">
          <form className="u-row" action="/reports" method="get">
            <label className="u-field" style={{ flex: '1 1 260px' }}>
              <span className="u-field__label">关键词</span>
              <input
                className="u-input"
                type="text"
                name="keyword"
                defaultValue={keyword ?? ''}
                placeholder="8D-… / 批次号 / QE-…"
                autoComplete="off"
              />
            </label>
            <label className="u-field">
              <span className="u-field__label">状态</span>
              <select className="u-select" name="status" defaultValue={status ?? ''}>
                <option value="">全部</option>
                <option value="draft">草稿</option>
                <option value="finalized">已定稿</option>
              </select>
            </label>
            <button className="u-btn u-btn--primary" type="submit">
              查询
            </button>
            <Link className="u-btn" href="/reports">
              重置
            </Link>
          </form>
        </div>
      </section>

      <section className="p-panel">
        <div className="p-panel__head">
          <h2>报告清单</h2>
          <span className="u-xs u-faint">
            第 {fmtCount(result.page)} / {fmtCount(totalPages)} 页 · 每页 {fmtCount(PAGE_SIZE)} 条
          </span>
        </div>
        <div className="u-table-wrap">
          <table className="u-table">
            <thead>
              <tr>
                <th>报告编号</th>
                <th>事件编号</th>
                <th>批次</th>
                <th>异常指标</th>
                <th>风险</th>
                <th>状态</th>
                <th>版本</th>
                <th>必填项</th>
                <th>最近保存</th>
                <th>定稿时间</th>
                <th>负责人</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.length ? (
                result.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="u-num">{row.code}</td>
                    <td className="u-num">{row.eventCode}</td>
                    <td className="u-num">{row.batchNo}</td>
                    <td>{row.metricName}</td>
                    <td>
                      <span className={`u-tag u-tag--${row.riskType}`}>
                        {RISK_LABELS[row.riskType as RiskType]}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`u-tag u-tag--${
                          row.status === 'finalized' ? 'normal' : 'pending'
                        }`}
                      >
                        {REPORT_STATUS_LABELS[row.status as ReportStatus] ?? row.status}
                      </span>
                    </td>
                    <td className="u-num">v{row.versionNo}</td>
                    <td>
                      {row.status === 'finalized' ? (
                        <span className="u-tag u-tag--normal">已定稿</span>
                      ) : row.missingRequired > 0 ? (
                        <span className="u-tag u-tag--medium">
                          缺 {row.missingRequired} 项必填
                        </span>
                      ) : (
                        <span className="u-tag u-tag--normal">必填已齐</span>
                      )}
                    </td>
                    <td className="u-num">{row.savedAt ?? NO_DATA}</td>
                    <td className="u-num">{row.finalizedAt ?? NO_DATA}</td>
                    <td>{row.ownerName ?? NO_DATA}</td>
                    <td>
                      <Link className="u-btn u-btn--small" href={`/reports/${row.id}`}>
                        打开
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={12}>
                    <div className="u-empty">
                      {keyword || status
                        ? '没有符合条件的 8D 报告，请调整筛选条件。'
                        : '还没有 8D 报告。请在「异常诊断」中确认结论后生成报告。'}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="p-panel__body">
          <div className="u-row u-row--between">
            <span className="u-xs u-faint">
              「必填缺失」由后端按 D1–D3 等必填字段的实际内容统计；缺失项不填满，定稿会被拒绝。
            </span>
            <span className="u-row">
              {page > 1 ? (
                <Link className="u-btn u-btn--small" href={pageHref(page - 1, status, keyword)}>
                  上一页
                </Link>
              ) : (
                <span className="u-btn u-btn--small" aria-disabled="true">
                  上一页
                </span>
              )}
              {page < totalPages ? (
                <Link className="u-btn u-btn--small" href={pageHref(page + 1, status, keyword)}>
                  下一页
                </Link>
              ) : (
                <span className="u-btn u-btn--small" aria-disabled="true">
                  下一页
                </span>
              )}
            </span>
          </div>
        </div>
      </section>

      <section className="p-panel u-mt">
        <div className="p-panel__head">
          <h2>定稿规则</h2>
        </div>
        <div className="p-panel__body">
          <div className="u-checklist">
            <div className="p-checklist__item" data-ok="false">
              <i>·</i>
              <span>D1 小组成员、D2 问题描述、D3 临时遏制措施必须填写，缺一项都不能定稿。</span>
            </div>
            <div className="p-checklist__item" data-ok="false">
              <i>·</i>
              <span>
                必须至少有 1 条工程师「已确认」的根因结论，结论要在「异常诊断」页面逐条确认或否决。
              </span>
            </div>
            <div className="p-checklist__item" data-ok="false">
              <i>·</i>
              <span>已定稿报告的所有文本框只读；需要修改时必须填写原因后「重新打开」，版本记录全部保留。</span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function pageHref(page: number, status?: string, keyword?: string): string {
  const params = new URLSearchParams();
  params.set('page', String(page));
  if (status) params.set('status', status);
  if (keyword) params.set('keyword', keyword);
  return `/reports?${params.toString()}`;
}
