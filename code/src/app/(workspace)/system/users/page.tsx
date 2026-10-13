import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/PageHeader';
import { UserTable } from '@/components/system/UserTable';
import { requirePermission } from '@/lib/auth/session';
import { listRoles, listUsers } from '@/lib/services/systemService';

export const metadata: Metadata = { title: '用户与角色' };
export const dynamic = 'force-dynamic';

/**
 * 用户与角色（服务端页面）。
 *
 * 页面与接口都不返回密码哈希，只显示「是否已设置密码」。
 * 密码重置由 auth 服务完成：写哈希 + must_reset_password=1 + session_version+1，
 * 该用户所有已签发的登录令牌立即失效（必须重新登录并修改密码）。
 */
export default async function SystemUsersPage() {
  const user = await requirePermission('system:read');
  const [initial, roles] = await Promise.all([
    listUsers({ page: 1, pageSize: 20 }),
    listRoles(),
  ]);

  return (
    <>
      <PageHeader
        title="用户与角色"
        description="账号、角色与登录状态管理。角色决定可访问的页面与操作；重置密码会立即使该用户的所有登录会话失效。"
        meta={
          <>
            <span className="u-tag u-tag--info">账号 {initial.total} 个</span>
            <span className="u-tag">可分配角色 {roles.length} 个</span>
          </>
        }
      />

      <div className="u-notice u-notice--info u-mb">
        系统不保存也不显示明文密码。管理员只能「重置」密码：重置后该用户当前所有登录会话立即失效，
        下次登录必须自行修改密码。权限变更（角色调整）在下一次请求即生效，无需重新登录。
      </div>

      <UserTable
        initial={initial}
        roles={roles}
        canWrite={user.permissions.includes('system:write')}
        currentUserId={user.userId}
      />
    </>
  );
}
