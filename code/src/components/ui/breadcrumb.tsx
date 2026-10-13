'use client';

import Link from 'next/link';
import { ChevronRight, ArrowLeft, Home } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  showBackButton?: boolean;
}

export function Breadcrumb({ items, showBackButton = true }: BreadcrumbProps) {
  const handleGoBack = () => {
    if (typeof window !== 'undefined') {
      window.history.back();
    }
  };

  return (
    <nav className="flex items-center gap-3 mb-6">
      {/* 返回上一页按钮 */}
      {showBackButton && (
        <button
          onClick={handleGoBack}
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300 transition-all shadow-sm"
          title="返回上一页"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      )}

      {/* 面包屑导航 */}
      <div className="flex items-center gap-1.5 text-sm">
        {/* 首页 */}
        <Link
          href="/"
          className="flex items-center gap-1 text-gray-500 hover:text-blue-600 transition-colors"
        >
          <Home className="h-4 w-4" />
          <span className="hidden sm:inline">首页</span>
        </Link>

        {/* 其他项 */}
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <ChevronRight className="h-4 w-4 text-gray-300" />
            {item.href && index < items.length - 1 ? (
              <Link
                href={item.href}
                className="text-gray-500 hover:text-blue-600 transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span className={`font-medium truncate max-w-[200px] ${
                index === items.length - 1 ? 'text-gray-900' : 'text-gray-500'
              }`}>
                {item.label}
              </span>
            )}
          </div>
        ))}
      </div>
    </nav>
  );
}
