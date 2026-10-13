import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: {
    default: 'PPR 质量智能分析助手',
    template: '%s · PPR 质量智能分析助手',
  },
  description:
    '面向 PPR 管材挤出过程的异常预警、结构化诊断、工程师验证与 8D 闭环管理平台。',
  applicationName: 'PPR Quality Copilot',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#173b76',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
