import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * public 目录的文件清单会在生产构建时固化，运行时新增的上传文件必须通过动态路由读取，
   * 否则会出现「构建前上传的图片正常、构建后新上传的图片 404」。
   */
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/uploads/:filename',
          destination: '/api/uploads/:filename',
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },

  // udoc-viewer 内含 WASM，需要参与转译
  transpilePackages: ['@docmentis/udoc-viewer'],

  // mysql2 为原生 Node 驱动，交由运行时从 node_modules 解析，避免被打包
  serverExternalPackages: ['mysql2'],

  /**
   * 注意：构建通过不代表类型正确。
   * 提交前请手动执行 `pnpm ts-check`（或 `pnpm validate`）。
   */
  typescript: {
    ignoreBuildErrors: true,
  },

  productionBrowserSourceMaps: false,

  // 关闭 React StrictMode，避免副作用（轮询 / 埋点）被重复触发
  reactStrictMode: false,

  // 关闭开发环境左下角悬浮指示器
  devIndicators: false,

  images: {
    // 如使用外部图床 / CDN，在此处按需追加域名
    remotePatterns: [],
  },
};

export default nextConfig;
