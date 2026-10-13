import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { ReportEditor } from '@/components/reports/ReportEditor';
import { can, requirePermission } from '@/lib/auth/session';
import { loadReport } from '@/lib/services/reportService';
import { fmt, NO_DATA } from '@/lib/format';
import { REPORT_STATUS_LABELS, RISK_LABELS, type ReportStatus, type RiskType } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `8D 报告 #${id}` };
}

/**
 * 8D 报告详情（服务端取数 → 客户端表单）。
 *
 * 取数放在服务端：D1–D8 内容、已确认结论、版本记录都是一次性数据，
 * 客户端只负责编辑与写操作，避免首屏再发一次请求。
 * 每个写操作成功后都会重新拉取详情，保证版本记录与内容一致。
 */
export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission('report:read');
  const { id } = await params;
  const reportId = Number(id);
  if (!Number.isInteger(reportId) || reportId <= 0) notFound();

  const detail = await loadReport(reportId);
  if (!detail) notFound();

  const { report } = detail;

  return (
    <>
      <PageHeader
        title={`8D 报告 ${report.code}`}
        description="D1–D8 八个小节缺一不可；根本原因只能引用工程师已确认的结论，系统预填内容必须人工核对后才能定稿。"
        meta={
          <>
            <span
              className={`u-tag u-tag--${report.status === 'finalized' ? 'normal' : 'pending'}`}
            >
              {REPORT_STATUS_LABELS[report.status as ReportStatus] ?? report.status}
            </span>
            <span className={`u-tag u-tag--${report.riskType}`}>
              {RISK_LABELS[report.riskType as RiskType]}
            </span>
            <span className="u-tag u-tag--info">事件 {report.eventCode}</span>
            <span className="u-tag">批次 {report.batchNo}</span>
            <span className="u-tag">版本 v{report.versionNo}</span>
            <span className="u-tag u-tag--medium">阈值待现场标定</span>
          </>
        }
        actions={
          <>
            <Link className="u-btn" href={`/diagnosis?event=${report.eventCode}`}>
              回到异常诊断
            </Link>
            <Link className="u-btn" href="/reports">
              报告列表
            </Link>
          </>
        }
      />

      <div className="u-notice u-notice--info u-mb">
        异常指标 {report.metricName} · 窗口 {report.windowStartTime ?? '—'} ~ {report.windowEndTime} ·
        影响长度{' '}
        {report.affectedLengthM === null
          ? '无法估算（缺少该批次线速度记录）'
          : `${fmt(report.affectedLengthM, 1)} m`}{' '}
        · 负责人 {report.ownerName ?? NO_DATA} · 创建时间 {report.createdAt}
        {report.reviewerNote ? ` · 复核说明：${report.reviewerNote}` : ''}
      </div>

      <ReportEditor
        detail={detail}
        permissions={{
          canWrite: can(user, 'report:write'),
          canFinalize: can(user, 'report:finalize'),
        }}
      />
    </>
  );
}
