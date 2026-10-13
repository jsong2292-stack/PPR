import type { Metadata } from 'next';
import { Toaster } from '@/components/ui/sonner';
import Navbar from '@/components/layout/Navbar';
import SiteFooter from '@/components/layout/SiteFooter';
import { AuthProvider } from '@/lib/auth-client';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { DisableDevTools } from '@/components/common/DisableDevTools';
import { siteConfig } from '@/lib/site-config';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: [...siteConfig.keywords],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="scroll-smooth" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className="antialiased min-h-screen bg-white text-gray-900">
        <DisableDevTools />
        <AuthProvider>
          <AuthGuard>
            <div className="flex min-h-screen flex-col">
              <Navbar />
              <main className="flex-1">{children}</main>
              <SiteFooter />
            </div>
          </AuthGuard>
        </AuthProvider>
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
