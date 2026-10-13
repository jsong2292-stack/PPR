/**
 * Next.js 配置。
 *
 * 按项目要求打开 `typescript.ignoreBuildErrors`：构建（next build）不因类型错误中断。
 * ESLint 在 Next 16 已不再通过 next.config 配置，因此这里不再声明 `eslint` 字段
 * （旧字段会触发 “Unrecognized key(s) in object: 'eslint'” 警告）。
 * 类型与规范检查请单独执行 `pnpm typecheck`。
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // 不开启 output: 'standalone'：本项目用自定义 Server（tsx 运行 server/main.ts），
  // standalone 只服务于 `next start` 的兜底场景，而它与自定义 Server 同时存在时
  // `next start` 会打印「does not work with output: standalone」的误导性告警。
  // 生产部署请用 `pnpm start`（见 docs/DEPLOY.md）。

  typescript: { ignoreBuildErrors: true },

  // 这些包包含原生或动态 require 逻辑，不应被服务端打包器内联
  serverExternalPackages: ['mysql2', 'xlsx', 'bcryptjs'],

  // 关闭图片优化管线：本项目不使用 next/image，避免要求 sharp 依赖
  images: { unoptimized: true },

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
