import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: '无访问权限' };

export default function NoPermissionPage() {
  return (
    <div className="p-login">
      <div className="p-login__card">
        <h1 className="p-login__title">当前账号没有可访问的模块</h1>
        <p className="p-muted u-mb">
          该账号尚未分配任何角色，因此无法进入质量工作台。
          请联系系统管理员在「用户与角色」中分配角色后重新登录。
        </p>
        <Link className="u-btn u-btn--primary u-btn--block" href="/login">
          返回登录
        </Link>
      </div>
    </div>
  );
}
