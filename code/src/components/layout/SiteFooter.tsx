'use client';

/**
 * 全站页脚（通用版）
 *
 * 品牌信息与栏目来自 src/lib/site-config.ts 的 siteConfig，
 * 换项目时只需修改配置。
 */
import Link from 'next/link';
import { siteConfig } from '@/lib/site-config';

export default function SiteFooter() {
  // 触发 Navbar 展开顶部搜索框（事件名与 Navbar 保持一致）
  const openTopSearch = () => {
    window.dispatchEvent(new Event('rf:open-search'));
  };

  return (
    <footer className="relative z-[1] mt-16 border-t border-gray-200 bg-white pb-6 pt-12 text-sm text-gray-500">
      <div className="mx-auto w-full max-w-[1240px] px-4 sm:px-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-[1.6fr_repeat(2,1fr)] lg:gap-8">
          {/* 品牌区 */}
          <div>
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
                <span className="text-sm font-bold text-white">{siteConfig.logoText}</span>
              </span>
              <span className="flex flex-col leading-tight">
                <span className="text-base font-bold text-gray-900">{siteConfig.name}</span>
                <span className="text-[10.5px] uppercase tracking-wider text-gray-400">
                  {siteConfig.nameEn}
                </span>
              </span>
            </div>
            <p className="max-w-[36ch] leading-normal">{siteConfig.footerNote}</p>
          </div>

          {/* 配置化栏目 */}
          {siteConfig.footerColumns.map((column) => (
            <div key={column.title}>
              <h4 className="mb-3 text-sm font-semibold text-gray-900">{column.title}</h4>
              {column.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block py-1 transition-colors hover:text-gray-900"
                >
                  {link.label}
                </Link>
              ))}
              {column.title === siteConfig.footerColumns[0]?.title && (
                <button
                  type="button"
                  onClick={openTopSearch}
                  className="flex w-full items-center gap-1.5 py-1 text-left transition-colors hover:text-gray-900"
                >
                  <svg
                    className="h-[15px] w-[15px] shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  站内搜索
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap justify-between gap-4 border-t border-gray-200 pt-4 text-[12.5px] text-gray-400">
          <span>{siteConfig.copyright}</span>
          {siteConfig.owner && <span>{siteConfig.owner}</span>}
        </div>
      </div>
    </footer>
  );
}
