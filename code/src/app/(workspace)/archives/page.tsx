import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { ArchiveList } from '@/components/archive/ArchiveList';
import { requirePermission } from '@/lib/auth/session';
import { listArchives } from '@/lib/services/archiveService';
import { fmtCount } from '@/lib/format';

export const metadata: Metadata = { title: '分析归档' };
export const dynamic = 'force-dynamic';

/**
 * 分析归档（服务端页面）。
 *
 * 归档是「冻结快照」：归档当时的结论、依据与工程师判定被复制进
 * analysis_archive_conclusion，之后不再随源数据变化，用于现场复查时回答
 * 「当时依据什么数据、得出了什么结论」。
 *
 * 页面首屏由服务端直接读库渲染（刷新即可看到数据），
 * 过滤、翻页与「按事件编号归档」由 ArchiveList 走接口完成。
 */
export default async function ArchivesPage() {
  const user = await requirePermission('analysis:read');
  const initial = await listArchives({ page: 1, pageSize: 20 });

  return (
    <>
      <PageHeader
        title="分析归档"
        description="已归档的分析快照：保留归档当时的结论、依据与工程师记录，不随源数据变化。归档要求该事件的结论已逐条确认或否决。"
        meta={
          <>
            <span className="u-tag u-tag--info">已归档 {fmtCount(initial.total)} 份</span>
            <span className="u-tag">冻结后不可修改</span>
          </>
        }
        actions={
          <>
            <Link className="u-btn" href="/diagnosis">
              异常诊断与验证
            </Link>
            <Link className="u-btn" href="/reports">
              8D 报告
            </Link>
          </>
        }
      />

      <div className="u-notice u-notice--info u-mb">
        归档会把当前结论冻结成历史记录，因此要求该事件的所有结论都已「确认」或「否决」。
        仍存在待确认结论时会拒绝归档，并提示还有多少条待确认 —— 请先到异常诊断页逐条判定。
      </div>

      <ArchiveList
        initial={initial}
        canArchive={user.permissions.includes('analysis:archive')}
      />
    </>
  );
}
