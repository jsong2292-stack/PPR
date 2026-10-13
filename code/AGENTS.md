# 通用平台脚手架 - 项目上下文

> 本文件是给 AI 编码助手（及新开发者）的速查手册。
> 本仓库由「日丰 AI 应用社区」抽取而来，只保留与业务无关的通用基础设施。

## 项目概览

- **项目名称**：日丰通用平台脚手架（`rifeng_platform_demo`）
- **定位**：新项目的起点。已内置认证、SSO、用户管理、系统设置、文件上传/预览、消息通知、导航与页脚、数据库访问层
- **数据库**：MySQL 直连（`mysql2` 连接池 + 原生 SQL）
- **认证**：本地账号密码 + JWT Session Cookie；可选 OAuth 2.0 单点登录
- **文件存储**：默认本地磁盘 `public/uploads`；兼容 MinIO（标准 S3 API），按环境变量自动切换
- **端口**：9001

## 技术栈

| 技术 | 版本 | 说明 |
|------|------|------|
| Node.js | 20 / 24 | `.coze` 声明 nodejs-24 |
| Next.js | 16.1.1 | App Router + 自定义 Server |
| React | 19.2.3 | 运行时 |
| TypeScript | 5.x | 构建时忽略 TS 报错，见 `next.config.ts` |
| Tailwind CSS | 4.x | 样式框架 |
| shadcn/ui | latest | `src/components/ui/` 共 50+ 组件 |
| MySQL | 8.0+ | `mysql2` 3.x 直连（utf8mb4） |
| drizzle-orm | 0.45 | **仅用于 schema 类型定义**，运行时不用 ORM |
| tsup | 8.x | 打包 `src/server.ts` → `dist/server.js` |
| 认证 | jsonwebtoken + bcryptjs | JWT Session + 密码哈希 |
| 文档预览 | `@docmentis/udoc-viewer` | 纯前端预览 PDF/DOCX/PPTX/SVG/图片 |
| pnpm | 9+ | 包管理器（`preinstall` 强制） |

## 目录结构

```
├── scripts/
│   ├── init-db.sql          # 建表 DDL（唯一权威来源）
│   ├── init-db.js           # 执行 init-db.sql + migrations
│   ├── migrate.js           # 增量迁移执行器
│   ├── migrations/          # 增量迁移（必须幂等）
│   ├── reset-db.sql         # 开发环境重置（危险）
│   └── build.sh dev.sh start.sh validate.sh prepare.sh
├── public/uploads/          # 运行时上传目录
├── src/
│   ├── server.ts            # 自定义 Server：环境校验 + 服务端登录拦截
│   ├── app/                 # 页面 + API
│   ├── components/
│   │   ├── ui/              # shadcn/ui 组件 + 文件预览组件
│   │   ├── layout/          # Navbar、SiteFooter
│   │   ├── auth/            # AuthGuard
│   │   ├── upload/          # FileUploader、ImageUploader
│   │   ├── common/          # DisableDevTools
│   │   └── home/Reveal.tsx  # 滚动淡入
│   ├── hooks/               # use-mobile / use-toast / use-auto-save
│   ├── lib/
│   │   ├── auth.ts          # ★ JWT / 密码 / 冻结 / 权限校验
│   │   ├── auth-client.tsx  # ★ 前端认证上下文
│   │   ├── oauth-config.ts  # ★ 单点登录配置与 OAuth 流程
│   │   ├── system-config.ts # ★ system_config 读写
│   │   ├── message.ts       # ★ 站内通知
│   │   ├── upload.ts        # ★ 上传常量与本地路径工具
│   │   ├── file-storage.ts   # ★ 本地磁盘 / MinIO 适配层
│   │   ├── site-config.ts   # ★ 站点/导航/页脚配置（换皮入口）
│   │   ├── api.ts           # 统一响应与错误处理
│   │   ├── sanitize.ts      # XSS 过滤
│   │   ├── env.ts           # 环境变量校验
│   │   └── utils.ts         # cn()
│   └── storage/database/
│       ├── mysql-client.ts  # ★ 连接池 + query/queryOne/queryAll/transaction
│       ├── db.ts            # 连接检查等高层封装
│       ├── db-service.ts    # 表级辅助（raw/rawOne）
│       └── shared/schema.ts # 表结构类型（drizzle，仅类型）
├── nginx/nginx.conf
├── Dockerfile / docker-compose.yml
├── drizzle.config.ts
└── .env.example
```

## 页面路由

| 路径 | 说明 |
|------|------|
| `/` | 首页（能力清单，接入业务后可删除） |
| `/login`、`/register` | 登录 / 注册 |
| `/install` | 安装向导（数据库自检 → 数据表检查 → 创建管理员） |
| `/user/profile`、`/user/password`、`/user/messages` | 个人资料 / 修改密码 / 消息通知 |
| `/messages` | 私信会话 |
| `/search` | 全站搜索（示例：按用户搜索） |
| `/admin`、`/admin/users`、`/admin/settings` | 后台概览 / 用户管理 / 系统设置 |
| `/demo/upload`、`/demo/preview` | 上传与预览示例页（可删除） |

## API 一览

### 认证（`src/app/api/auth/`）

| 接口 | 说明 |
|------|------|
| `POST /api/auth/login` | `{ username, password, remember }` |
| `POST /api/auth/logout` | 清除 Session |
| `GET /api/auth/me` | 当前用户（未登录返回 `{ user: null }`） |
| `POST /api/auth/register` | 注册（受 `enable_register` 开关控制） |
| `GET /api/auth/register/status` | 注册开关状态 |
| `GET /api/auth/oauth/status` | SSO 配置状态 + 是否自动跳转 |
| `GET /api/auth/oauth/login` | 跳转 OAuth 授权端点 |
| `GET /api/auth/oauth/callback` | 授权回调，换取 token 并下发 Session |

### 用户

`GET/PUT /api/user/profile`、`PUT /api/user/password`、`GET /api/users`（检索联系人）

### 消息

`GET/POST /api/user/messages`、`GET /api/user/messages/unread-count`、`POST /api/user/messages/read-all`、`POST /api/user/messages/[id]/read`、`DELETE /api/user/messages/[id]`、`GET/POST /api/messages/conversations`、`GET/POST /api/messages/[id]`

### 文件

`POST /api/upload`、`GET|HEAD /api/uploads/[filename]`（支持 Range）、`GET /api/files`

### 配置与系统

`GET/PUT /api/config`、`GET /api/config/max-file-size`、`GET/PUT /api/admin/config`、`GET/PATCH/DELETE /api/admin/users`、`GET /api/admin/stats`、`GET/POST/PUT /api/admin/notifications`、`GET/POST/PUT /api/admin/init`、`GET /api/health`、`GET /api/test-db`

### 安装

`GET /api/install/status`、`POST /api/install/test-db`、`POST /api/install/create-tables`、`POST /api/install/init-data`

## 数据库

连接串优先 `MYSQL_URL`，其次 `DATABASE_URL`（也支持 `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_DATABASE` 分项变量）。连接池在 `src/storage/database/mysql-client.ts`（connectionLimit 10、idle 30s、连接超时 10s）。

```ts
import { query, queryOne, queryAll, transaction } from '@/storage/database/mysql-client';

const rows = await queryAll<User>('SELECT * FROM users WHERE status = $1', ['active']);
```

> 占位符：客户端**兼容 `$1, $2` 形式**（内部自动转换为 MySQL 的 `?` 并复制重复参数），新代码建议直接使用 `?`。
> MySQL 不支持 `RETURNING`，需要回读时改用 `insertId` 二次查询；`users.id` 为应用层生成的 UUID。

| 表 | 用途 |
|----|------|
| `users` | 用户（角色、状态、登录失败计数、SSO 外部标识） |
| `follows` | 关注关系 |
| `messages` | 站内通知 |
| `conversations` / `private_messages` | 私信 |
| `uploaded_files` | 上传文件记录 |
| `user_behaviors` | 行为埋点 |
| `audits` | 操作审计 |
| `system_config` | 系统配置（key-value） |
| `health_check` | 探活 |

> 字段以 `scripts/init-db.sql` 为准；`shared/schema.ts` 只提供类型。

### 系统配置项

| key | 默认值 | 说明 |
|-----|--------|------|
| `enable_register` | `true` | 是否开放注册 |
| `enable_file_upload` | `true` | 是否开放上传 |
| `enable_file_preview` | `true` | 是否启用预览 |
| `max_file_size` | `500` | 上传大小上限（MB） |
| `enable_sso_auto_login` | `false` | 未登录是否自动跳转 SSO |

## 认证与授权

1. **本地账号**：`bcryptjs` 哈希，JWT 存于 HttpOnly Cookie（默认名 `session`，7 天；勾选记住我后使用完整有效期，否则 1 天）
2. **单点登录**：标准 OAuth 2.0 授权码流程，提供方完全由 `OAUTH_*` 环境变量决定；
   按 `external_id` 匹配用户，未命中则按 `email` 关联本地账号，仍没有则自动建号

服务端工具：`generateToken` / `verifyToken` / `setSessionCookie` / `clearSessionCookie` / `getCurrentUser` / `requireUser` / `requireAdmin`

前端：`AuthProvider`（`src/lib/auth-client.tsx`）+ `AuthGuard`

### 双层路由守卫

| 层 | 文件 | 行为 |
|----|------|------|
| 服务端 | `src/server.ts` | 无有效 Session 时 302 到 `/login` 或 SSO；放行 `/api`、`/_next`、静态资源、健康检查、RSC 请求 |
| 客户端 | `src/components/auth/AuthGuard.tsx` | 兜底跳转，`/login`、`/register`、`/install` 等公开路径直接放行 |

公开路径定义在 `src/lib/site-config.ts` 的 `PUBLIC_PATHS`。

## 开发规范

### 数据库
- 统一从 `@/storage/database/mysql-client` 导入，禁止自行创建连接池
- 使用参数化查询（`$1, $2` 或 `?`）防注入，禁止拼接 SQL；`key` 为 MySQL 保留字，务必加反引号
- 多步写操作使用 `transaction()` 包裹
- 时间统一以 UTC 存储，连接层 `timezone: 'Z'`，时间计算尽量交给 SQL（`NOW()` / `DATE_ADD`）

### UI
- 优先复用 `src/components/ui/` 下的 shadcn/ui 组件
- 业务组件按领域放到 `src/components/<领域>/`
- 类名合并使用 `cn()`

### Hydration
- 严禁在 JSX 中直接使用 `typeof window`、`Date.now()`、`Math.random()`
- 必须 `'use client'` + `useEffect` + `useState`，动态内容仅在客户端挂载后渲染
- 严禁非法 HTML 嵌套（如 `<p>` 嵌套 `<div>`）

### API
- 路由放在 `src/app/api/`，使用 Route Handlers
- 统一响应：成功 `{ success: true, ... }`，失败 `{ error }`；辅助函数见 `src/lib/api.ts`
- 管理类接口统一放在 `src/app/api/admin/` 下
- 用户输入内容需经 `isomorphic-dompurify` 过滤（`src/lib/sanitize.ts`）

### 提交流程

```bash
pnpm validate   # ts-check + lint:build，提交前必跑
```

> `next.config.ts` 设置了 `typescript.ignoreBuildErrors: true`，**构建通过不代表类型正确**。

## 常用命令

```bash
pnpm dev          # 开发（scripts/dev.sh，端口 9001，自动清理端口占用）
pnpm build        # 生产构建（next build + tsup）
pnpm start        # 生产启动（node dist/server.js）
pnpm validate     # ts-check + lint
pnpm db:init      # 建表 + 迁移
pnpm db:migrate   # 仅执行增量迁移
pnpm db:generate  # 按 schema.ts 生成迁移草稿（需人工复核）
```

## 环境变量

必需：`MYSQL_URL`（或 `DATABASE_URL`）、`JWT_SECRET`

常用可选：`PORT`、`SESSION_COOKIE_NAME`、`SESSION_TTL_DAYS`、`NEXT_PUBLIC_APP_URL`、`MAX_FILE_SIZE`、`UPLOAD_BASE_PATH`、`NEXT_PUBLIC_SITE_*`、`OAUTH_*`

完整示例见 `.env.example`。

## 常见问题

**数据库连接失败** → 检查连接串；访问 `/api/test-db` 或 `/install` 自检。

**本地模式新上传的文件 404** → `public` 目录清单在构建时固化，运行时文件必须经 `/uploads/:filename`（`next.config.ts` 中 rewrite 到 `/api/uploads/:filename`）。

**MinIO 上传失败** → 检查 `MINIO_ENDPOINT`、Access Key、Secret Key、桶名与桶权限；设置 `FILE_STORAGE_DRIVER=local` 可强制回退本地磁盘。

**上传失败** → 检查 `public/uploads` 是否存在且可写，以及 `enable_file_upload` 开关与 `max_file_size` 配置。

**认证失败** → 核对 `OAUTH_REDIRECT_URI` 与 OAuth 后台登记地址是否一致；`JWT_SECRET` 变更会使既有 Session 全部失效。

**端口占用** → `scripts/dev.sh` 会自动清理 9001 端口（Linux `ss`、macOS `lsof`）。

## 待办 / 已知限制

- `src/lib/oauth-config.ts` 的 `stateStore` 使用进程内存：多实例部署需替换为 Redis
- 私有 MinIO 文件通过 `/api/storage/[...key]` 动态签名后 307 跳转；如需绕过应用服务，可配置公开桶或 CDN 的 `MINIO_PUBLIC_URL`
- `src/app/api/admin/init/route.ts` 的 `PUT` 重置密码接口未加权限校验，生产环境应改为 CLI 脚本或补充鉴权
