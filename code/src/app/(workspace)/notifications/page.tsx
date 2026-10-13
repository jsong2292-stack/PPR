import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { NotificationList } from '@/components/notification/NotificationList';
import { requirePermission } from '@/lib/auth/session';
import { listNotifications } from '@/lib/services/archiveService';
import { fmtCount } from '@/lib/format';

export const metadata: Metadata = { title: '通知记录' };
export const dynamic = 'force-dynamic';

/**
 * 通知记录（服务端页面）。
 *
 * 通知采用「先落库、再外发」的策略：规则命中后先把通知与收件人写入数据库，
 * 再尝试邮件外发；外发失败只更新投递状态与失败原因，不回滚记录。
 * 因此本页始终能看到「发出过什么」，邮件网关故障不会让预警丢失。
 *
 * 未配置 SMTP（NOTIFY_TRANSPORT=db）时投递状态为「未发送（未配置邮件通道）」，
 * 这是明确的「没配通道」而不是「发送失败」，便于现场判断该去配通道还是查网关。
 */
export default async function NotificationsPage() {
  const user = await requirePermission('notification:read');
  const initial = await listNotifications({ page: 1, pageSize: 20 });

  return (
    <>
      <PageHeader
        title="通知记录"
        description="预警通知的发送记录与回执状态。通知先落库再外发，外发失败不影响记录留存。"
        meta={
          <>
            <span className="u-tag u-tag--info">通知 {fmtCount(initial.total)} 条</span>
            <span className="u-tag">通道：邮件（数据库留痕）</span>
          </>
        }
        actions={
          <Link className="u-btn" href="/monitor">
            返回质量监控
          </Link>
        }
      />

      <NotificationList
        initial={initial}
        canSend={user.permissions.includes('notification:send')}
      />
    </>
  );
}
