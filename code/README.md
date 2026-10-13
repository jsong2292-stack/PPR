# PPR 质量智能分析助手

面向 PPR 管材挤出过程的质量数据服务：样管抽检台账、产品与设备数采数据、R1–R5 预警规则、异常诊断与验证、8D 报告与历史归档。

本项目是**前后端分离的真实服务**：Next.js App Router 提供页面与接口，自定义 Node Server 负责启动前置检查、请求日志与优雅退出，全部业务数据存放在 MySQL，浏览器不再保存任何业务数据。

本文件面向接手本项目的工程师与运维，说明技术栈、本地启动、目录结构、功能模块、角色权限与业务规则。部署步骤见 `docs/DEPLOY.md`，分层与扩展方式见 `docs/ARCHITECTURE.md`。

---

## 1. 技术栈

| 类别 | 选型 | 版本 | 说明 |
| --- | --- | --- | --- |
| 运行时 | Node.js | 20.x / 24.x | `package.json` 的 `engines.node` 为 `>=20.9.0 <25`；部署平台声明 `nodejs-24`（`runtime.txt`） |
| 包管理器 | pnpm | 9 及以上（本项目锁定 12.5.1） | `packageManager: pnpm@12.5.1`、`engines.pnpm >= 9`；由 `scripts/check-toolchain.mjs` 与 `.npmrc` 的 `package-manager-strict=true` 强制 |
| Web 框架 | Next.js | 16.1.1 | App Router + 自定义 Server（`server/main.ts`） |
| UI 库 | React / React DOM | 19.2.3 | 全部为 Server Component 壳 + 少量客户端组件 |
| 语言 | TypeScript | 5.9.3 | `next.config.mjs` 中 `typescript.ignoreBuildErrors: true`，构建不因类型错误中断 |
| 数据库驱动 | mysql2 | 3.15.3 | 连接池、`dateStrings`、`decimalNumbers: false` |
| 鉴权 | jose | 6.1.0 | JWT HS256 + httpOnly Cookie |
| 口令哈希 | bcryptjs | 3.0.3 | 默认代价因子 10（`BCRYPT_ROUNDS`） |
| 校验 | zod | 4.1.13 | 请求体 / 查询参数校验 |
| 图表 | echarts | 5.6.0 | 前端图表依赖 |
| 表格解析 | xlsx | 0.18.5 | Excel 批量导入 |
| 数据库 | MySQL | 8.0.16+ | 库名 `ppr_quality`；`utf8mb4` / `utf8mb4_0900_ai_ci`，InnoDB |
| 开发运行器 | tsx | 4.20.6 | `dev` / `start` / 全部 `*.ts` 脚本均通过 tsx 运行 |
| 环境变量注入 | cross-env | 10.1.0 | 保证 `NODE_ENV` 在 Windows 下也可设置 |

> 注意：`tsx` 与 `cross-env` 属于 `devDependencies`，但 `pnpm start` 依赖它们。生产部署时**不能**用 `pnpm install --prod` 裁剪开发依赖，否则 `pnpm start` 无法运行。详见 `docs/DEPLOY.md`。

### 版本约束的强制方式

约束在三处生效，缺一不可：

1. `package.json` 的 `engines`（Node `>=20.9.0 <25`、pnpm `>=9`）；
2. `.npmrc` 的 `engine-strict=true`、`package-manager-strict=true`，让 pnpm 自身拒绝不满足 `engines` 的环境；
3. `scripts/check-toolchain.mjs`（挂在 `preinstall` / `postinstall`），显式放行 Node 主版本 **20 与 24**，并在检测到 npm / yarn 时直接失败，避免产出与部署环境不一致的依赖树。CI 等特殊场景可用 `SKIP_TOOLCHAIN_CHECK=1` 跳过。

---

## 2. 快速开始

### 2.1 前置条件

- Node.js 20.x 或 24.x（推荐 24，与部署声明一致）
- pnpm 9 及以上
- 本地可用的 MySQL 8.0.16 及以上实例（默认按 `127.0.0.1:3306` 连接；开发环境通常为 Docker 容器）

```bash
node -v            # v24.x
corepack enable    # 或 npm i -g pnpm
pnpm -v            # >= 9
```

### 2.2 安装依赖与初始化本地库

```bash
pnpm install
pnpm setup:local
```

`pnpm setup:local` 使用管理员账号连库，一次完成四件事：

1. 创建数据库 `ppr_quality`（不存在时，字符集 `utf8mb4` / `utf8mb4_0900_ai_ci`）；
2. 创建应用账号 `ppr_app`（仅 `SELECT / INSERT / UPDATE / DELETE`）与迁移账号 `ppr_migrator`（含本库 DDL 权限），口令随机生成；
3. 生成 `.env.local`（含随机口令与 `AUTH_SECRET`，文件权限 `0600`，已被 `.gitignore` 排除）；
4. 打印下一步命令。

支持参数（默认值来自环境变量或硬编码，可按需覆盖）：

```bash
pnpm setup:local --user root --password root
pnpm setup:local --host 127.0.0.1 --port 3306 --database ppr_quality
pnpm setup:local --force      # 已存在 .env.local 时重新生成并重置数据库账号口令
```

`.env.local` 已存在且未加 `--force` 时，脚本只提示并退出，不会改动数据库账号口令。

> 生产环境不要使用 `setup:local`。生产由 DBA 建库建账号，再执行 `pnpm db:migrate`，见 `docs/DEPLOY.md`。

### 2.3 建立表结构与基础数据

```bash
pnpm db:migrate
```

迁移执行器按文件名顺序应用 `db/migrations/*.sql`，并把文件名与 sha256 前 16 位校验和写入 `schema_migration` 表。

```bash
pnpm db:migrate --status     # 只列出待执行 / 已应用 / 校验失败，不执行
pnpm db:migrate --dry-run    # 打印将要执行的迁移，不连接数据库
```

迁移完成后建议立刻做一次数据库自检：

```bash
pnpm db:check
pnpm db:smoke
```

### 2.4 启动

```bash
pnpm dev      # 开发：tsx watch server/main.ts，NODE_ENV=development
pnpm build    # 生产构建：next build
pnpm start    # 生产运行：NODE_ENV=production tsx server/main.ts
```

启动后访问 `http://127.0.0.1:3000`。未登录会被重定向到 `/login`。

首次启动时，自定义 Server 会执行管理员账号引导：

- 配置了 `BOOTSTRAP_ADMIN_PASSWORD` → 用该口令写入管理员账号（bcrypt 哈希），可立即登录；
- 未配置且管理员从未设置过口令 → 生成一次性随机口令并打印到**启动日志**，同时置 `must_reset_password=1`，强制首次登录后改密。

启动后规则引擎的定时扫描随之注册（`ENABLE_RULE_SCHEDULER`），服务关闭时会先停止扫描再收尾。

### 2.5 自检、冒烟与账号维护

```bash
pnpm db:check                          # 数据库连通性、迁移记录、表/视图齐全性、基础数据、应用账号应无 DDL 权限
pnpm db:smoke                          # 17 项数据库不变量检查（去重键、窗口、限值、结论与 8D 完整性等）
pnpm smoke                             # 端到端 HTTP 冒烟（需服务已在运行）
pnpm smoke -- --base http://127.0.0.1:3000 --user admin --password '<口令>'
pnpm db:admin --list                   # 列出全部账号与角色
pnpm db:admin --reset admin            # 重置口令（未指定 --password 时生成强随机口令并打印一次）
pnpm db:admin --reset admin --password '<新口令>'
pnpm db:admin --disable <username>     # 停用账号
pnpm db:admin --enable  <username>     # 启用账号
pnpm db:admin --grant <username> <roleCode>   # 追加角色
```

`db:check` 以应用账号实测连接，并验证「应用账号执行 DDL 应被拒绝」；`db:smoke` 只读校验数据模型不变量，部署完数据库即可运行；`smoke` 按真实用户操作顺序走一遍链路（健康检查 → 登录 → 主数据 7 类 → 抽检详情 → 诊断 → 8D 生成/保存/定稿校验 → 通知 → 归档前置校验 → 系统接口）。

`db:admin --reset` 会把 `session_version` 加一，使该账号所有已签发的会话立即失效。重置口令属于敏感操作，请不要把口令写入工单或聊天记录。

---

## 3. 环境变量

`.env.example` 是变量清单来源；`pnpm setup:local` 生成的 `.env.local` 覆盖本地开发所需项。加载顺序由 `src/lib/env.ts`（基于 `@next/env`）控制：`.env` < `.env.local` < `.env.${NODE_ENV}` < `.env.${NODE_ENV}.local`，**已存在的真实环境变量优先级最高**，适合容器与 CI 注入。

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `NODE_ENV` | 选填 | `development` | `production` 时启用 JSON 行日志、Cookie `secure`、AUTH_SECRET 长度强校验 |
| `HOST` | 选填 | 生产 `0.0.0.0` / 开发 `127.0.0.1` | HTTP 监听地址 |
| `PORT` | 选填 | `3000` | HTTP 监听端口 |
| `APP_URL` | 选填 | `http://127.0.0.1:${PORT}` | 对外可访问地址，用于日志、邮件正文与导出链接 |
| `SHUTDOWN_TIMEOUT_MS` | 选填 | `10000` | 优雅退出等待上限（毫秒）。收到 SIGTERM 后最多等这么久，再由编排系统强制结束 |
| `DB_HOST` | 必填 | 无 | MySQL 主机 |
| `DB_PORT` | 选填 | `3306` | MySQL 端口 |
| `DB_NAME` | 必填 | 无 | 数据库名，应为 `ppr_quality` |
| `DB_USER` | 必填 | 无 | 应用账号，只有 DML 权限（`ppr_app`） |
| `DB_PASSWORD` | 必填 | 无 | 应用账号口令。**禁止使用 `change-me` 等示例值** |
| `DB_MIGRATION_USER` | 选填 | 空 | 迁移账号（`ppr_migrator`）。留空则迁移回退到应用账号，要求该账号已获 DDL 授权 |
| `DB_MIGRATION_PASSWORD` | 选填 | 空 | 迁移账号口令，规则同上 |
| `DB_CONNECTION_LIMIT` | 选填 | `10` | 连接池上限 |
| `DB_TIMEZONE` | 选填 | `+08:00` | 现场时区。连接池在每条连接建立时执行 `SET time_zone = '<该值>'`，与驱动的时区解析保持一致；两者不一致会让 `created_at` / `updated_at` 等 DATETIME 偏移。详见 `docs/DEPLOY.md` 第 4.5 节 |
| `DB_SSL` | 选填 | `false` | 是否启用 TLS。开启后使用 `rejectUnauthorized: false`，生产应改用可信 CA |
| `DB_SLOW_QUERY_MS` | 选填 | `1000` | 慢请求告警阈值（毫秒），同时作为 HTTP 慢请求阈值 |
| `AUTH_SECRET` | 必填 | 无 | JWT 签名密钥。**生产环境必须 ≥ 32 字符**，否则启动即失败。禁止使用示例值 |
| `SESSION_TTL_HOURS` | 选填 | `12` | 会话有效期（小时） |
| `SESSION_COOKIE_NAME` | 选填 | `ppr_session` | 会话 Cookie 名 |
| `BCRYPT_ROUNDS` | 选填 | `10` | bcrypt 代价因子 |
| `BOOTSTRAP_ADMIN_USERNAME` | 选填 | `admin` | 引导管理员账号名；为空则跳过引导逻辑 |
| `BOOTSTRAP_ADMIN_PASSWORD` | 选填 | 空 | 首次部署用于设置管理员口令。**创建成功后必须从环境中移除** |
| `BOOTSTRAP_ADMIN_NAME` | 选填 | `系统管理员` | 引导管理员显示名 |
| `ENABLE_RULE_SCHEDULER` | 选填 | `true` | 规则引擎定时扫描开关：启动时注册，优雅退出时停止；多实例部署时可用它只让部分实例开启 |
| `RULE_SCAN_INTERVAL_SECONDS` | 选填 | `300` | 规则扫描间隔（秒） |
| `RULE_SCAN_LOOKBACK_HOURS` | 选填 | `72` | 规则扫描回溯窗口（小时） |
| `RULE_SCAN_BATCH_SIZE` | 选填 | `500` | 单次扫描最大处理记录数 |
| `NOTIFY_TRANSPORT` | 选填 | `db` | `db` 只落库（通知状态记为 `cancelled`，`error_message` 说明未配置 SMTP，可人工外发）；`smtp` 落库后尝试投递，需额外安装 `nodemailer` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | 选填 | `465` / `true` / 空 | SMTP 投递参数，仅 `NOTIFY_TRANSPORT=smtp` 时使用 |
| `MAX_UPLOAD_MB` | 选填 | `20` | 上传文件大小上限（MB） |
| `LOG_LEVEL` | 选填 | 生产 `info` / 开发 `debug` | 日志级别：`debug` / `info` / `warn` / `error` |
| `LOG_REQUESTS` | 选填 | 生产关 / 开发开 | 是否记录每条 HTTP 请求（静态资源始终跳过） |
| `SKIP_DB_STARTUP_CHECK` | 选填 | 无 | 仅当值为字面量 `1` 时跳过启动时数据库连通性检查（仅用于无库的静态构建校验）。`.env.example` 里的 `false` 不会触发跳过 |
| `SKIP_TOOLCHAIN_CHECK` | 选填 | 无 | 仅当值为字面量 `1` 时跳过 `preinstall` / `postinstall` 工具链检查。`.env.example` 里的 `0` 不会触发跳过 |

`.env.example` 已覆盖上表全部变量（含 `SHUTDOWN_TIMEOUT_MS`、`DB_SLOW_QUERY_MS`、`SESSION_COOKIE_NAME`、`BCRYPT_ROUNDS`、`RULE_SCAN_BATCH_SIZE`、`LOG_LEVEL`、`LOG_REQUESTS`、`SKIP_DB_STARTUP_CHECK`、`SKIP_TOOLCHAIN_CHECK`）。

`.env.example` 中的 `DB_PASSWORD`、`DB_MIGRATION_PASSWORD`、`AUTH_SECRET`、`BOOTSTRAP_ADMIN_PASSWORD` 都标注为「必须替换」，其值 `change-me` 只是格式示例，**不能用于任何真实环境**。

---

## 4. 可用脚本

以下为 `package.json` 中声明且**脚本文件确实存在**的命令：

| 命令 | 实际执行 | 说明 |
| --- | --- | --- |
| `pnpm setup:local` | `tsx scripts/setup-local.ts` | 本地建库、建账号、生成 `.env.local`（仅开发环境） |
| `pnpm db:migrate` | `tsx scripts/db-migrate.ts` | 应用迁移，支持 `--status` / `--dry-run` |
| `pnpm db:check` | `tsx scripts/db-check.ts` | 部署自检：应用账号连通性、迁移记录、表/视图齐全性、基础数据是否就绪、应用账号执行 DDL 应被拒绝 |
| `pnpm db:smoke` | `tsx scripts/db-smoke.ts` | 数据库不变量检查（17 项）：去重键、窗口起点≤终点、正常风险不落事件、限值上下限、已确认结论必须有确认人与时间、8D 必须 D1–D8 齐全等 |
| `pnpm smoke` | `tsx scripts/smoke-e2e.ts` | 端到端 HTTP 冒烟，支持 `--base` / `--user` / `--password` |
| `pnpm db:admin` | `tsx scripts/db-admin.ts` | 账号维护：`--list` / `--reset <user> [--password]` / `--disable` / `--enable` / `--grant <user> <role>` |
| `pnpm dev` | `cross-env NODE_ENV=development tsx watch --clear-screen=false server/main.ts` | 开发模式，文件变更自动重启 |
| `pnpm build` | `next build` | 生产构建 |
| `pnpm start` | `cross-env NODE_ENV=production tsx server/main.ts` | 生产运行 |
| `pnpm typecheck` | `tsc --noEmit --pretty false` | 类型检查（本项目唯一的静态类型防线） |
| `pnpm preinstall` | `node scripts/check-toolchain.mjs` | 安装前工具链检查（由 pnpm 自动触发） |
| `pnpm postinstall` | `node scripts/check-toolchain.mjs --post` | 安装后工具链检查（由 pnpm 自动触发） |

### 关于 lint

`package.json` 中**已不再提供 `lint` 脚本**：Next.js 16 移除了 `next lint`，继续保留只会让人误以为有 ESLint 检查。静态检查统一使用：

```bash
pnpm typecheck
```

由于 `next.config.mjs` 设了 `typescript.ignoreBuildErrors: true`（`next build` 不会因类型错误中断），`typecheck` 是唯一的类型防线，**必须在 CI 里执行**。

数据库层另有不经过 pnpm 脚本的手工工具：`db/tools/smoke-test.sql`（全链路写入并 `ROLLBACK`，用于核对唯一键与生成列）、`db/tools/gen-seed.mjs`（按脚本重新生成 0002 的基线数据）。

---

## 5. 目录结构

```
PPR/code
├── package.json               # 依赖、脚本、engines、packageManager
├── runtime.txt                # 部署运行时声明：nodejs-24
├── .npmrc                     # engine-strict / package-manager-strict 等
├── .env.example               # 环境变量样例（复制后填写真实值）
├── next.config.mjs            # Next 配置：ignoreBuildErrors、安全响应头、外部依赖白名单
├── tsconfig.json              # 路径别名 @/* -> src/*
│
├── server/                    # 自定义 Server（Next 之外的最外层）
│   ├── main.ts                # 进程入口：启动 / 记录失败 / 设置退出码
│   ├── index.ts               # startServer()：建 HTTP Server、监听、关闭
│   ├── startup.ts             # 启动前置检查：配置校验 + 数据库连通性 + 管理员引导
│   ├── shutdown.ts            # SIGTERM/SIGINT 与未捕获异常处理
│   ├── next-app.ts            # 创建 Next 应用实例（dev / production 分支显式传入）
│   ├── request-logger.ts      # 请求日志与慢请求告警
│   └── bootstrap/admin.ts     # 首次部署的管理员账号引导
│
├── src/
│   ├── app/                   # App Router：页面与 Route Handler
│   │   ├── layout.tsx         # 根布局（metadata、viewport、全局样式）
│   │   ├── page.tsx           # 入口页：按登录态重定向
│   │   ├── login/             # 登录页与登录表单
│   │   ├── account/password/  # 修改密码页（在工作台布局之外）
│   │   ├── no-permission/     # 无任何角色时的提示页
│   │   ├── (workspace)/       # 工作台布局（服务端登录校验 + 侧边栏外框）
│   │   └── api/               # Route Handler：auth / health / masterdata / monitor / events / diagnosis / reports / archives / notifications / datasource / system
│   ├── components/            # 布局、反馈组件（Sidebar / UserMenu / Toast / Modal 等）
│   ├── config/navigation.ts   # 导航结构：全部页面的单一来源
│   ├── lib/                   # 领域层
│   │   ├── config.ts  env.ts  db.ts  logger.ts  errors.ts  api.ts
│   │   ├── audit.ts  format.ts  validation.ts  types.ts  route-helpers.ts
│   │   ├── analysis/rules.ts  # R1–R5 判定实现（阈值全部来自数据库）
│   │   ├── auth/              # permissions.ts / session.ts / service.ts
│   │   ├── masterdata/        # resources.ts（字段/列/校验/权限配置）/ service.ts（通用 CRUD）
│   │   ├── repositories/      # 数据访问：alertEvent / batch / diagnosis / inspection / metric
│   │   ├── services/          # 应用服务：ruleEngine / ruleScheduler / monitor / analysisEngine / reportService / archiveService / ruleAdmin / system
│   │   └── client/api.ts      # 浏览器端 API 客户端
│   └── styles/globals.css     # 全局样式
│
├── db/
│   ├── schema.sql             # 42 表 + 4 视图的完整结构（重建用，会 DROP）
│   ├── README.md              # 数据库设计说明（逐表、ER 图、设计决策）
│   ├── migrations/            # 迁移：0001_schema / 0002_seed / 0003_platform_baseline / 0004_rule_wording / 0005_trend_params_and_samples / 0006_rule_param_alignment
│   └── tools/                 # gen-seed.mjs、smoke-test.sql
│
└── scripts/
    ├── setup-local.ts         # 本地环境初始化
    ├── db-migrate.ts          # 迁移执行器（schema_migration 台账 + 校验和）
    ├── db-check.ts            # 部署自检（连通性 / 迁移 / 表视图 / 基础数据 / DDL 权限）
    ├── db-smoke.ts            # 17 项数据库不变量检查
    ├── db-admin.ts            # 账号维护（列表 / 重置口令 / 停启用 / 授权）
    ├── smoke-e2e.ts           # 端到端 HTTP 冒烟
    ├── check-toolchain.mjs    # Node / pnpm 版本与包管理器检查
    └── lib/db-utils.ts        # 脚本侧一次性连接、SQL 拆分、幂等执行
```

---

## 6. 功能模块清单

页面清单与 `src/config/navigation.ts` 完全一致（共 22 个导航项、4 个分组）。侧边栏只渲染当前账号拥有对应权限的入口。

**实现状态**：导航项、页面文件与接口**全部落地并逐项验证通过**——22 个导航页面（外加登录、修改口令、无权限三个非导航页）均返回 200，23 个接口路由全部可用，`pnpm smoke` 的 27 项端到端检查全绿。

页面与接口的对应关系见第 6 节与第 6.5 节；每个模块的权限要求、数据来源与业务约束在各自小节中说明。

### 质量工作台

| 路径 | 名称 | 需要权限 | 实现状态 |
| --- | --- | --- | --- |
| `/monitor` | 质量监控与预警 | `monitor:read` | 已完成：批次 × 时间风险网格、抽检详情面板、待处理事件表、阈值标定状态说明 |
| `/diagnosis` | 异常诊断与验证| `analysis:read` | 已完成：事件选择 / 分层证据 / 结论判定 / 趋势与工艺对照图 |
| `/reports` | 8D 报告工作台| `report:read` | 已完成：8D 列表与 `/reports/[id]` 编辑、定稿校验、版本时间线 |
| `/archives` | 历史分析| `analysis:read` | 已完成：归档列表、按事件编号归档、冻结结论快照查看 |
| `/notifications` | 通知记录| `notification:read` | 已完成：通知记录、按事件生成通知、投递状态与失败原因 |

### 基础主数据

| 路径 | 名称 | 需要权限 | 实现状态 |
| --- | --- | --- | --- |
| `/masterdata/categories` | 产品类别| `masterdata:read` | 已完成：列表 / 搜索 / 分页 / 新增 / 编辑 / 删除（含引用冲突提示） |
| `/masterdata/specs` | 产品规格| `masterdata:read` | 已完成：列表 / 搜索 / 分页 / 新增 / 编辑 / 删除（含引用冲突提示） |
| `/masterdata/equipment-types` | 设备类型| `masterdata:read` | 已完成：列表 / 搜索 / 分页 / 新增 / 编辑 / 删除（含引用冲突提示） |
| `/masterdata/equipment` | 设备台账| `masterdata:read` | 已完成：列表 / 搜索 / 分页 / 新增 / 编辑 / 删除（含引用冲突提示） |
| `/masterdata/lines` | 产线与工段| `masterdata:read` | 已完成：列表 / 搜索 / 分页 / 新增 / 编辑 / 删除（含引用冲突提示） |
| `/masterdata/metrics` | 质量指标与影响因素| `masterdata:read` | 已完成：列表 / 搜索 / 分页 / 新增 / 编辑 / 删除（含标定状态展示） |

### 数据源管理

| 路径 | 名称 | 需要权限 | 实现状态 |
| --- | --- | --- | --- |
| `/datasource/batches` | 批次基础信息| `datasource:read` | 已完成：批次列表与筛选、明细查看 |
| `/datasource/products` | 产品数据| `datasource:read` | 已完成：产品数据列表与筛选、明细查看 |
| `/datasource/readings` | 设备采集数据| `datasource:read` | 已完成：采集数据列表与筛选、明细查看 |
| `/datasource/inspections` | 样管抽检记录| `datasource:read` | 已完成：抽检记录与指标值明细（缺失指标显示「无数据」） |
| `/datasource/process` | 工艺过程记录| `datasource:read` | 已完成：工艺过程记录与温区/速度明细 |
| `/datasource/production-events` | 生产事件记录| `datasource:read` | 已完成：生产事件列表与筛选、明细查看 |
| `/datasource/import` | Excel 批量导入| `datasource:import` | 已完成：模板下载、上传校验、逐行错误展示、导入批次留痕 |

### 系统管理

| 路径 | 名称 | 需要权限 | 实现状态 |
| --- | --- | --- | --- |
| `/system/users` | 用户与角色| `system:read` | 已完成：用户与角色维护、重置口令（旧会话立即失效） |
| `/system/rules` | 预警规则| `system:read` | 已完成：R1–R5 阈值参数键值维护、参数白名单校验、标定状态 |
| `/system/data-sources` | 数据来源字典| `system:read` | 已完成：数据来源字典维护（模拟来源隔离、被引用时禁止删除） |
| `/system/audit` | 操作日志| `system:read` | 已完成：操作日志查询（按模块 / 动作 / 时间 / 关键字过滤） |

### 6.5 不在导航中的页面与接口

页面：

| 路径 | 说明 |
| --- | --- |
| `/` | 入口页：未登录 → `/login`；无任何权限 → `/no-permission`；否则 → `/monitor` |
| `/login` | 登录页，已登录用户会被重定向 |
| `/account/password` | 修改密码，刻意放在工作台布局之外，首登强制改密时不暴露任何业务导航 |
| `/no-permission` | 账号未分配任何角色时的提示页 |

已完成接口（括号内为声明权限）：

| 接口 | 方法与权限 | 说明 |
| --- | --- | --- |
| `/api/health` | GET（公开） | 健康检查，供探针使用 |
| `/api/auth/*` | 登录 / 登出 / 会话 / 改密（公开，改密需登录） | 会话与口令 |
| `/api/masterdata/:resource` | GET `masterdata:read`、POST `masterdata:write` | 7 类主数据：`categories` / `specs` / `equipment-types` / `equipment` / `lines` / `metrics` / `spec-limits`；支持 `?options=1` 取下拉选项 |
| `/api/masterdata/:resource/:id` | GET `masterdata:read`、PUT `masterdata:write`、DELETE `masterdata:delete` | 单条主数据的读写与软删除（含引用检查） |
| `/api/monitor/inspections/:id` | GET `monitor:read` | 抽检记录详情（含触发事件与数据核对结论） |
| `/api/events` | GET / PATCH `monitor:read` | 预警事件列表与处置状态更新 |
| `/api/diagnosis` | GET `analysis:read`、POST `analysis:generate`、PATCH `analysis:verify` | 诊断结论生成 / 查询 / 工程师验证 |
| `/api/reports` | GET `report:read`、POST `report:write` | 8D 报告列表与生成 |
| `/api/reports/:id` | GET / POST `report:read` | 报告详情、保存草稿与定稿校验 |
| `/api/archives` | GET `analysis:read`、POST `analysis:archive` | 归档列表与创建 |
| `/api/archives/:id` | GET `analysis:read` | 归档详情（冻结快照） |
| `/api/notifications` | GET `notification:read`、POST `notification:send` | 通知记录列表与生成（落库，可按配置尝试 SMTP 外发） |
| `/api/notifications/:id` | GET `notification:read` | 通知详情与回执 |
| `/api/datasource/:resource` | GET `datasource:read` | 数据源管理列表与明细（batches/products/readings/inspections/process/production-events） |
| `/api/datasource/import`、`/api/datasource/import/template` | POST / GET `datasource:import` | Excel 服务端逐行校验与整批写入（任一行有错整批拒绝）、中文表头模板下载 |
| `/api/system/rules` | GET `system:read`、PUT `system:write` | R1–R5 规则与阈值参数维护 |
| `/api/system/data-sources` | GET `system:read`、POST/PUT/DELETE `system:write` | 数据来源字典维护 |
| `/api/system/users` | GET `system:read`、POST/PUT `system:write` | 用户与角色维护 |
| `/api/system/audit` | GET `system:read` | 操作日志查询 |

---

## 7. 角色与权限

权限判定代码位于 `src/lib/auth/permissions.ts`，角色定义同时存在于数据库 `sys_role`（可扩展）。判定规则是「资源:动作」，未知角色一律拒绝。

### 6 个角色

| 角色编码 | 显示名 | 定位 |
| --- | --- | --- |
| `admin` | 系统管理员 | 账号、角色、字典与规则维护；拥有全部权限 |
| `quality_manager` | 质量负责人 | 8D 报告定稿与结案确认、结论验证与归档 |
| `quality_engineer` | 质量工程师 | 异常诊断、结论验证与 8D 报告编制 |
| `production_leader` | 生产领班 | 现场状态确认与临时处置执行 |
| `equipment_engineer` | 设备工程师 | 设备与工艺参数核查 |
| `viewer` | 只读查看 | 只读权限 |

### 权限矩阵

`Y` 表示该角色拥有该权限。

| 权限 | admin | quality_manager | quality_engineer | production_leader | equipment_engineer | viewer |
| --- | --- | --- | --- | --- | --- | --- |
| `masterdata:read` | Y | Y | Y | Y | Y | Y |
| `masterdata:write` | Y | - | - | - | - | - |
| `masterdata:delete` | Y | - | - | - | - | - |
| `datasource:read` | Y | Y | Y | Y | Y | Y |
| `datasource:write` | Y | - | Y | Y | Y | - |
| `datasource:delete` | Y | - | - | - | - | - |
| `datasource:import` | Y | - | Y | Y | - | - |
| `monitor:read` | Y | Y | Y | Y | Y | Y |
| `analysis:read` | Y | Y | Y | Y | Y | Y |
| `analysis:generate` | Y | - | Y | - | - | - |
| `analysis:verify` | Y | Y | Y | - | - | - |
| `analysis:archive` | Y | Y | Y | - | - | - |
| `report:read` | Y | Y | Y | Y | Y | Y |
| `report:write` | Y | Y | Y | - | - | - |
| `report:finalize` | Y | Y | - | - | - | - |
| `notification:read` | Y | Y | Y | Y | Y | - |
| `notification:send` | Y | Y | Y | - | - | - |
| `system:read` | Y | Y | - | - | - | - |
| `system:write` | Y | - | - | - | - | - |

要点：

- 主数据的写 / 删与系统写操作**只有 `admin`** 拥有；其他角色一律只读主数据。
- `report:finalize`（8D 定稿）只有 `admin` 与 `quality_manager`。
- `viewer` 不拥有 `notification:read`，因此侧边栏对 `viewer` 会隐藏「通知记录」。

---

## 8. 业务规则 R1–R5

规则定义存放在数据库 `alert_rule` 表，按 `evaluate_order`（即「顺序判断」）从小到大依次判定，**第一条命中即为结论**。判定实现位于 `src/lib/analysis/rules.ts`，配置（顺序、阈值、启停、标定状态）来自数据库，现场调整阈值不需要改代码。当前所有规则的 `calibration_status` 均为 **`demo`**：**阈值尚未经现场标定**，不得作为合格判定或工艺结论的依据。

阈值来源必须逐个规则区分——`params_json` 并非每一条规则都读取：

| 顺序 | 编码 | 规则名称 | 风险类型 | `rule_category` | 阈值来源 | 命中含义 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | R1 | 数据记录差异待核对 | `error` | `data_consistency` | **不读取 `params_json`**。容差来自每条 `data_consistency_check.tolerance_value` | 同一指标在两条来源记录中的差值超过该条核对的容差，或核对结论尚未确认。只提示核对原始记录，不构成产品不合格结论 |
| 2 | R2 | 原始测量数据错误或样管规格匹配待核对 | `error` | `data_validity` | **不读取 `params_json`**。物理关系与规格偏差比例写死在 `rules.ts` | 测量值不满足基本物理关系（最大外径小于最小外径、最小壁厚大于最大壁厚、非正值），或与当前规格公称尺寸差异过大。用于拦截录入与匹配问题 |
| 3 | R3 | 规格限值对照 | `medium` | `spec_limit` | **不读取 `params_json`**。上下限来自 `metric_spec_limit` 表 | 测量值落在规格上下限之外。当前限值状态为待现场确认，不构成正式合格判定 |
| 4 | R4 | 连续抽检点趋势变化待复核 | `medium` | `trend` | `params_json`：`consecutive=3`、`minimum_change_mm=0.015`、`maximum_gap_minutes=240` | 同一批次、同一规格的连续可比较点同向变化幅度超过阈值，且相邻间隔不超过上限。趋势窗口固定为「同一生产日」，需人工复核；停机 / 换规格状态由 `production_event` 提供 |
| 5 | R5 | 未命中预警规则 | `normal` | `fallback` | 无 | 兜底规则（`is_terminal=1`）：R1–R4 均未命中。仅表示按当前规则集未发现问题，不代表产品已完成正式合格判定 |

`alert_rule.params_json` 只接受规则实现真正读取的键：R1 / R2 / R3 / R5 不接受任何键（必须为空对象），R4 只接受上表 4 个键。写入其他键（例如历史种子中的 `tolerance_mm`、`match_window_minutes`）会被 `PUT /api/system/rules` 以 422 拒绝并说明原因。迁移 `0006` 已把这几类死键从库中清除。

**阈值标定状态必须如实说明**：R3 的规格上下限与 R4 的趋势幅度 / 间隔，都要由现场数据标定后才能把 `calibration_status` 改为 `validated`；在此之前界面会持续显示「阈值待现场标定」（`CALIBRATION_LABELS` 把 `demo` 与 `pending_field_validation` 都展示为同一文案）。

**实现状态（已接入运行时）**：

- 判定实现：`src/lib/analysis/rules.ts`（R1–R5，按 `evaluate_order` 顺序执行，第一条命中即返回）。
- 引擎：`src/lib/services/ruleEngine.ts` 加载数据库规则、构建判定上下文（抽检记录、批次窗口、规格限值、生产事件、数据核对记录）、扫描抽检记录并以 `INSERT ... ON DUPLICATE KEY` 落事件，事件编号形如 `QE-{批次号}-{YYYYMMDD}-{序号}`。
- 调度：`src/lib/services/ruleScheduler.ts` 按 `ENABLE_RULE_SCHEDULER` / `RULE_SCAN_INTERVAL_SECONDS` / `RULE_SCAN_LOOKBACK_HOURS` / `RULE_SCAN_BATCH_SIZE` 定时扫描，服务启动时注册（`server/index.ts`），优雅退出时先停止（`stopRuleScheduler()`）再收尾。
- 实测效果：在样例数据上可产出 R1（QMS/MES 记录差异）与 R3（不圆度超规格）事件。迁移 `0005` 写入的两条样例记录正是为了让这两条判定路径开箱即可核对。
- `maximum_window_hours`（默认 24 小时）：不超过 24 小时按「同一生产日」比较，超过则按滚动时间窗。跨日比较会把交接班、清洗、开停机造成的水平位移误判为趋势，所以默认口径是生产日；连续跨夜生产才需要调大。

规则相关的其他事实：

- 事件表 `alert_event` 的去重键为 `(batch_id, rule_id, metric_id, window_start_time)`：同批次、同规则、同指标、同窗口只产生一条事件，窗口推进后可再次触发。
- 事件快照字段 `rule_code` / `rule_version` / `line_speed_mpm` 记录触发当时的值，供结论与报告回溯。
- 视图 `v_alert_event_detail` 会带出 `rule_calibration_status`，便于界面显示标定状态。

---

## 9. 数据库概览

- 库名 `ppr_quality`，字符集 `utf8mb4` / 排序规则 `utf8mb4_0900_ai_ci`，引擎 InnoDB。
- **42 张表 + 4 个视图**，分 10 组：权限与基础字典（5）、产品与设备主数据（4）、指标与工艺参数字典（5）、生产与数采（8）、批量导入（1）、抽检与预警（9）、诊断与工程师验证（4）、8D 报告（3）、历史分析归档（2）、审计（1）。
- 视图：`v_inspection_record_wide`、`v_product_data_wide`、`v_equipment_reading_wide`、`v_alert_event_detail`。
- 逐表说明、ER 图与设计决策见 `db/README.md`。

### 账号与权限

| 账号 | 权限 | 用途 |
| --- | --- | --- |
| `ppr_app` | `SELECT, INSERT, UPDATE, DELETE ON ppr_quality.*` | 应用运行；**无 DDL 权限**，看不到实例中的其他库 |
| `ppr_migrator` | 上述 DML + `CREATE, DROP, ALTER, INDEX, REFERENCES ON ppr_quality.*` | 迁移建表改表；仅由 `pnpm db:migrate` 使用 |

应用运行时连接池只使用 `ppr_app`；`DB_MIGRATION_USER` / `DB_MIGRATION_PASSWORD` 只被脚本（`scripts/lib/db-utils.ts`）使用。**不要用 root 跑应用。**

### 迁移记录

迁移台账表 `schema_migration` 记录：文件名、sha256 前 16 位校验和、执行的语句条数、执行账号、执行时间。

约束：**已应用的迁移文件不可修改**。文件内容变更会导致校验和不一致，`pnpm db:migrate` 报 `[校验失败]` 并以非零码退出（`--status` 会汇总「校验失败 N 个」）。任何结构或数据变更都必须新增迁移文件，回滚同样靠新增迁移。

现有迁移：

| 文件 | 内容 |
| --- | --- |
| `0001_schema.sql` | 42 表 + 4 视图的完整结构。含 `DROP TABLE`，仅用于从零建立结构 |
| `0002_seed.sql` | 初始基线数据：角色与用户、数据来源、主数据、批次、产品数据、设备采集、样管抽检、工艺记录、R1–R5 规则 |
| `0003_platform_baseline.sql` | 平台基础数据基线：补 `sys_user.session_version`、数据来源与主数据命名校正、产线组织、生产事件补齐、账号归属。语句幂等，可重复执行 |
| `0004_rule_wording.sql` | R1–R5 名称与说明校对及角色说明，**不改任何阈值** |
| `0005_trend_params_and_samples.sql` | R4 补充 `maximum_window_hours` 参数；写入一条不圆度超规格记录与一条 QMS/MES 差异待核对记录，使 R3 与 R1 的判定路径开箱可核对。使用 `INSERT ... ON DUPLICATE KEY UPDATE`，可重复执行 |
| `0006_rule_param_alignment.sql` | 让 R4 的 `maximum_window_hours` 真正生效并把默认值统一为 24；清除 R1 种子遗留的、任何规则都不读取的死键，使 R1/R2/R3/R5 的参数为空对象 |

可执行的建库脚本是 `db/migrations/0001` 与 `0002`（`pnpm db:migrate` 执行，带校验和台账）；`db/schema.sql` 是给人阅读的结构总览，`db/tools/gen-seed.mjs` 用于重新生成基线数据。三者如有不一致，以迁移与线上 `information_schema` 为准。

### 数据约定

- 时间统一 `DATETIME`（无时区）。连接池在**每条连接建立时**执行 `SET time_zone = '<DB_TIMEZONE>'`，与驱动的时区解析使用同一把尺子，避免数据库容器为 UTC 时 `created_at` / `updated_at` 读出来少 8 小时。
- 数值全部定点 `DECIMAL`，不用 `FLOAT` / `DOUBLE`；连接配置 `decimalNumbers: false`，**DECIMAL 以字符串返回**，业务层显式转换。
- 测量值用「表头 + 指标值行」长表：`inspection_record` + `inspection_value` 等。指标由 `quality_metric` 字典驱动，新增指标无需 `ALTER TABLE`；**某指标无数据 = 不写值行**。
- 主数据软删除（`is_deleted`），避免打断历史引用链；删除前做引用检查，仍有引用时返回 409 并给出引用条数。
- 所有执行入口统一把 `undefined` 规整为 `NULL`、`boolean` 转为 `0/1`（mysql2 不接受 `undefined` 参数）。
- 诊断证据有两套正交标注：业务来源（测量数据 / 工艺参数 / 设备采集 / 参考对照 / 数据核对 / 观察事实）与依据分层（`BasisLayer`：规格限值 / 变化趋势 / 参考对照 / 相关因素变化 / 数据核对 / 观察事实）；写库时业务来源映射为 `conclusion_evidence.evidence_type` 三分类 `basis` / `support` / `contradict`。缺层必须写成「缺失证据」，禁止用 `0` 或空字符串代替。详见 `docs/ARCHITECTURE.md` 第 5.7 节。

---

## 10. 自定义 Server 提供的运行时能力

`pnpm dev` / `pnpm start` 运行的都不是 `next start`，而是 `server/main.ts`。选择自定义 Server 的原因与新增能力：

1. **启动前置检查**（`server/startup.ts`）：校验 `AUTH_SECRET` 与数据库配置、探测数据库连通性并打印 MySQL 版本与耗时、执行管理员账号引导。任一步失败即以非零码退出，避免「进程活着但连不上库」这种最难排查的故障。`SKIP_DB_STARTUP_CHECK=1`（字面量 `1`）可跳过连通性检查。
2. **优雅退出**（`server/shutdown.ts` + `server/index.ts`）：收到 `SIGTERM` / `SIGINT` 后先停止规则引擎定时扫描（`stopRuleScheduler()`），再停止接收新请求、等待在途请求，关闭 Next 应用，收尾数据库连接池，然后退出；等待上限为 `SHUTDOWN_TIMEOUT_MS`（默认 10000 ms），超时后强制结束，避免 keep-alive 连接阻塞退出。重复信号只记录不重复执行。
3. **请求日志与慢请求告警**（`server/request-logger.ts`）：记录方法、路径、状态码、耗时；未完成的请求记为「请求被中断」，耗时超过 `DB_SLOW_QUERY_MS` 记为「慢请求」。`/_next/static`、`/_next/image`、`/favicon.ico` 跳过。**不记录请求体**，避免口令与业务数据落日志。
4. **管理员账号引导**（`server/bootstrap/admin.ts`）：见第 2.4 节。
5. **规则引擎调度**：服务启动后注册定时扫描（`src/lib/services/ruleScheduler.ts`），按配置间隔对回溯窗口内的抽检记录执行 R1–R5 判定并落预警事件。
6. **未捕获异常兜底**：`uncaughtException` 记录完整信息后以非零码退出；`unhandledRejection` 记录但不退出；HTTP 层同步异常统一转 500 JSON，避免单请求拖垮进程。

日志由 `src/lib/logger.ts` 输出：生产环境为 JSON Lines（`error` 走 stderr，其余走 stdout），开发环境为带颜色的人类可读格式。

Next 的配置取舍（`next.config.mjs`）：不开启 `output: 'standalone'`（本项目用自定义 Server + tsx，standalone 只服务 `next start` 兜底场景，两者并存时 `next start` 会打印误导性告警）；`serverExternalPackages: ['mysql2','xlsx','bcryptjs']` 避免原生 / 动态 require 被服务端打包器内联；`images.unoptimized: true` 因为项目不使用 `next/image`；全局响应头 `X-Content-Type-Options`、`Referrer-Policy`、`X-Frame-Options`。

---

## 11. 鉴权与会话

- 方案：无状态 JWT（HS256，`jose`）+ httpOnly Cookie，Cookie 名默认 `ppr_session`，`sameSite=lax`，生产环境 `secure`。
- 载荷只放身份与授权必需字段（`userId` / `username` / `displayName` / `roles` / `version` / `iat` / `exp`）。
- `sys_user.session_version` 参与签发：改密、管理员重置密码或停用账号时递增，旧令牌在下一次请求校验时立即失效，无需黑名单。
- 每次请求都会回查数据库确认账号状态与 `session_version`，因此权限变更即时生效。
- 首登强制改密：`must_reset_password=1` 的账号只能访问修改密码相关接口与页面。
- 登录失败策略：同一账号连续失败 5 次锁定 10 分钟。**计数保存在进程内存**，单实例有效；多实例部署需改为 Redis 或数据库计数。
- 统一错误文案：不区分「账号不存在」与「口令错误」，避免账号枚举。
- 路由侧鉴权通过 `withApi()` 声明 `permission`，见 `docs/ARCHITECTURE.md`。

---

## 12. 关键设计取舍

下面几条是这套系统里「为什么这么做」的答案，改动前请先读完：

- **浏览器不保存任何业务数据**：代码中不存在 `localStorage` / `sessionStorage`，所有查询与写入都经过接口落到 MySQL `ppr_quality`。刷新页面即回到服务端真值。
- **风险用实体表达，不用「场景」表示**：风险由 `alert_rule`（判定规则）+ `alert_event`（一次具体的预警）表达，数据由真实记录表达。不设仅用于展示的「场景」表，避免出现与真实数据无关的记录。
- **阈值与限值可配置、可标定**：限值落在 `metric_spec_limit`，趋势阈值落在 `alert_rule.params_json`，并显式记录可信状态（`calibration_status`）。界面据此显示「阈值待现场标定」，提醒使用者该阈值只用于提示复核，不作为合格判定依据。
- **导航即权限地图**：22 个模块的划分以 `src/config/navigation.ts` 为单一来源，页面与接口的权限声明都从这里的权限字符串取值，避免两处维护。
- **数据来源可追溯**：`data_source.is_simulated`、`inspection_value.is_simulated`、`notification.is_simulated` 记录了每条数据的来源性质。`0003_platform_baseline.sql` 已把 `data_source.is_simulated` 置 0（当前库中的记录即视为本系统的生产记录）；若本库用于试点验收，应按实际情况重新标注来源可信度。
- **不夸大系统能力**：阈值未标定时只提示复核、通知默认只落库不外发、诊断结论是服务端规则整理的**待验证假设**而非根因。这些边界在本文档与界面上都如实呈现。

---

## 13. 相关文档索引

| 文档 | 内容 |
| --- | --- |
| `docs/DEPLOY.md` | 部署指南：环境要求、环境变量、数据库准备、迁移上线、Nginx、进程守护、备份回滚、安全清单、故障排查 |
| `docs/ARCHITECTURE.md` | 架构与分层、统一 API 与数据层约定、扩展指引、已知边界 |
| `db/README.md` | 数据库设计说明：逐表说明、ER 图、关键设计决策、验证记录 |
| `db/schema.sql` | 表结构与视图的参考总览（可执行的建库脚本以 `db/migrations/` 为准） |
| `db/migrations/` | 迁移文件与说明 |
