# PPR 过程质量异常智能分析助手

本项目以 `PPR/原型/index.html` 的交互原型为功能基线，以日丰通用平台脚手架 `rifeng_platform_demo` 为平台底座实现。平台基础能力（账号认证、SSO、用户管理、系统配置、消息、文件上传与预览）保持可用，业务功能统一接入 MySQL，形成以下闭环：

> 主数据 / 数据源管理 → 质量监控与预警 → 异常诊断与工程师验证 → 8D 报告 → 历史归档

## 已实现功能

### 平台基础能力

- 本地账号密码登录、JWT Session Cookie、登录失败冻结
- 可选 OAuth 2.0 单点登录
- 用户、角色、个人资料、密码和系统设置管理
- 站内消息、文件上传与预览
- MySQL 连接池、统一环境变量、自定义 Next.js Server
- Dockerfile、Docker Compose、Nginx 配置

### PPR 质量业务

- **系统管理**：产品类别、产品规格、设备类型、设备台账
- **数据源管理**：批次基础信息、质量指标与影响因素、产品检验数据、设备采集数据
- **数据维护**：列表检索、新增、编辑、删除、CSV 模板下载、Excel/CSV 批量导入
- **监控预警**：质量指标趋势、规格演示限值、预警队列、产品数据重新扫描
- **异常诊断**：自动关联同批次产品记录和同期设备数据，生成限值、趋势和设备因素三层证据
- **工程师验证**：逐条确认/驳回分析结论，记录实际发现和工程师意见
- **8D 工作台**：继承事件与已确认结论，编辑 D1-D8、保存草稿、完整性检查、定稿、HTML 导出和浏览器打印
- **历史分析**：报告定稿后自动关闭预警、完成分析并生成历史归档

> 质量限值、趋势连续点数、时间窗口和分析文本均为演示策略。正式上线前必须结合适用标准、企业内控要求及现场数据完成校准。

## 技术栈

- Next.js 16 App Router + React 19 + TypeScript
- Tailwind CSS 4 + shadcn/ui + Lucide Icons
- Recharts
- MySQL 8 + `mysql2` 原生 SQL
- JWT + bcryptjs
- SheetJS (`xlsx`) Excel 导入
- pnpm 9+

## 快速启动（使用本机 Docker MySQL）

当前开发配置默认连接：

```text
mysql://root:root@127.0.0.1:3306/ppr_quality
```

### 1. 启动本地 MySQL

如果已经有名为 `mysql` 的本地容器并映射到 `3306`，可直接复用。否则可执行：

```bash
docker run -d \
  --name mysql \
  -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=root \
  mysql:8.4 \
  --character-set-server=utf8mb4 \
  --collation-server=utf8mb4_unicode_ci
```

### 2. 安装依赖和初始化数据库

```bash
cd code
cp .env.example .env.local

# 创建业务数据库
mysql -h 127.0.0.1 -P 3306 -u root -proot \
  -e "CREATE DATABASE IF NOT EXISTS ppr_quality CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

pnpm install
pnpm db:init
```

数据库 DDL 和演示种子数据的**唯一运行时权威来源**：

```text
scripts/init-db.sql
```

该文件包含平台基础表和 PPR 业务表，业务表/字段均带中文注释。`scripts/reset-db.sql` 仅用于开发环境重置。

### 3. 启动

```bash
pnpm dev
```

访问：`http://localhost:9010`

本地演示账号：

```text
用户名：admin
密码：Admin@123
```

生产部署前必须修改默认密码和 `JWT_SECRET`；启用 HTTPS 后将 `SESSION_COOKIE_SECURE` 设为 `true`。

## Docker Compose 启动

```bash
cp .env.example .env
# 修改 .env 中的 JWT_SECRET

docker compose up -d --build
```

- 应用：`http://localhost:9010`
- Compose MySQL 对外端口：`3307`（避免与本机已有的 `3306` 冲突）
- 容器内应用通过 `mysql:3306` 连接数据库

如需清空 Docker 数据卷后重新初始化：

```bash
docker compose down -v
docker compose up -d --build
```

## 主要路由

| 路由 | 功能 |
|---|---|
| `/quality/monitor` | 质量监控与预警 |
| `/quality/diagnosis` | 异常诊断与工程师验证 |
| `/quality/report` | 8D 报告工作台 |
| `/quality/history` | 历史分析归档 |
| `/quality/data/categories` | 产品类别 |
| `/quality/data/specs` | 产品规格 |
| `/quality/data/equipment-types` | 设备类型 |
| `/quality/data/equipment` | 设备台账 |
| `/quality/data/batches` | 批次基础信息 |
| `/quality/data/metrics` | 质量指标与影响因素 |
| `/quality/data/measurements` | 产品检验数据 |
| `/quality/data/readings` | 设备采集数据 |
| `/admin` | 平台管理后台 |

## 业务 API

所有 `/api/quality/*` 接口均要求登录。

| API | 方法 | 说明 |
|---|---|---|
| `/api/quality/master/[resource]` | GET/POST/PUT/DELETE | 8 类主数据和数据源通用 CRUD |
| `/api/quality/dashboard` | GET | 监控统计、趋势、预警、产品和设备数据 |
| `/api/quality/alerts/evaluate` | POST | 按规格演示限值重新扫描产品数据 |
| `/api/quality/analysis` | GET/POST/PUT | 查询/生成分析、保存工程师验证 |
| `/api/quality/reports` | GET/POST/PUT | 创建、编辑、定稿 8D 报告 |
| `/api/quality/history` | GET | 查询定稿后的历史归档 |

## 数据流说明

1. 在系统管理中维护产品、规格、设备。
2. 在数据源管理中维护批次、产品检验和设备采集记录。
3. 监控页读取同一数据库中的产品数据；点击“重新扫描”可为新增超限记录创建预警。
4. 诊断页以 `alert_id` 为入口，按 `batch_id + inspect_time` 关联产品趋势和设备数据，并保存证据快照。
5. 工程师逐条确认或驳回结论，验证结果实时写入 `ppr_analysis_conclusion`。
6. 8D 工作台从分析任务继承事件、摘要和已确认结论。
7. 定稿时在同一流程内更新报告、关闭预警、完成分析，并写入 `ppr_history_archive`。

## 代码结构

```text
src/
├── app/quality/                     # PPR 业务页面
├── app/api/quality/                 # PPR 业务 API
├── components/quality/              # 业务组件
├── components/ui/                   # 平台 shadcn/ui 组件
├── lib/quality.ts                   # 资源白名单、业务公共方法
├── lib/auth.ts                      # 平台认证
└── storage/database/mysql-client.ts # MySQL 连接池与事务
scripts/
├── init-db.sql                      # 平台 + 业务 DDL、种子数据
├── init-db.js                       # 初始化入口
├── reset-db.sql                     # 开发环境重置
└── cdp-shot.mjs                     # 本地页面截图验收工具
```

## 验证命令

```bash
pnpm ts-check
pnpm lint:build
pnpm build
```

本次交付已验证：

- TypeScript 检查通过
- ESLint 检查通过
- Next.js 生产构建通过
- 登录、监控数据、分析生成、工程师确认、8D 定稿、历史归档 API 全链路通过
- 1600×1000 页面截图完成监控页、诊断页和产品数据页视觉检查
