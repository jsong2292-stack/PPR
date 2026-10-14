# ==========================================
# 通用平台脚手架 - Docker 镜像构建文件
# ==========================================

# 注意：构建脚本使用 bash，且 runner 阶段使用 Debian 版 addgroup/adduser 语法，
# 因此基础镜像必须是 Debian 系（alpine 无 bash 且用户创建参数不同）。
FROM node:20-bookworm-slim AS base

# corepack 下载 pnpm 二进制时默认走 registry.npmjs.org，国内服务器上极易超时失败。
# 允许通过 --build-arg NPM_REGISTRY=... 覆盖为内网/国内镜像。
ARG NPM_REGISTRY=https://registry.npmmirror.com
ENV COREPACK_NPM_REGISTRY=$NPM_REGISTRY \
    npm_config_registry=$NPM_REGISTRY

# ---------- 依赖安装 ----------
FROM base AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* .npmrc* ./
RUN pnpm install --frozen-lockfile || pnpm install

# ---------- 构建 ----------
FROM base AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# NEXT_PUBLIC_* 在构建期被内联进客户端产物，只能通过 --build-arg 注入
ARG NEXT_PUBLIC_SITE_NAME
ARG NEXT_PUBLIC_SITE_NAME_EN
ARG NEXT_PUBLIC_SITE_LOGO_TEXT
ARG NEXT_PUBLIC_SITE_DESCRIPTION
ARG NEXT_PUBLIC_SITE_COPYRIGHT
ARG NEXT_PUBLIC_SITE_OWNER
ENV NEXT_PUBLIC_SITE_NAME=$NEXT_PUBLIC_SITE_NAME \
    NEXT_PUBLIC_SITE_NAME_EN=$NEXT_PUBLIC_SITE_NAME_EN \
    NEXT_PUBLIC_SITE_LOGO_TEXT=$NEXT_PUBLIC_SITE_LOGO_TEXT \
    NEXT_PUBLIC_SITE_DESCRIPTION=$NEXT_PUBLIC_SITE_DESCRIPTION \
    NEXT_PUBLIC_SITE_COPYRIGHT=$NEXT_PUBLIC_SITE_COPYRIGHT \
    NEXT_PUBLIC_SITE_OWNER=$NEXT_PUBLIC_SITE_OWNER

RUN pnpm run build

# ---------- 运行 ----------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=9010
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nextjs

# 保留 pnpm 依赖（运行 dist/server.js 需要 node_modules）
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/scripts ./scripts

# 上传目录需要可写（也可挂载数据卷）
RUN mkdir -p /app/public/uploads && chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 9010

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:9010/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/server.js"]
