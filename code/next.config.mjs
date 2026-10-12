/**
 * Next.js 配置。
 *
 * 按项目要求打开 `typescript.ignoreBuildErrors` 与 `eslint.ignoreDuringBuilds`：
 * 构建（next build）不因类型或 lint 失败而中断。类型问题请单独跑 `pnpm typecheck`。
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  outputFileTracingRoot: process.cwd(),
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ['mysql2', 'xlsx', 'bcryptjs'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
};

export default nextConfig;
