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
- **双模式异常诊断**：可选择确定性规则引擎或 LangChain Agent，并支持运行时配置切换
- **LangChain Agent**：通过白名单只读工具自主获取预警、批次趋势、设备窗口、参考批次和指标定义，输出结构化结论
- **自动降级**：Agent 未配置、超时或调用失败时可自动回退规则引擎，业务流程不中断
- **工程师验证**：逐条确认/驳回分析结论，记录实际发现和工程师意见
- **8D 工作台**：继承事件与已确认结论，编辑 D1-D8、保存草稿、完整性检查、定稿、HTML 导出和浏览器打印
- **历史分析**：报告定稿后自动关闭预警、完成分析并生成历史归档

> 质量限值、趋势连续点数、时间窗口和分析文本均为演示策略。正式上线前必须结合适用标准、企业内控要求及现场数据完成校准。

## 技术栈

- Next.js 16 App Router + React 19 + TypeScript
- Tailwind CSS 4 + shadcn/ui + Lucide Icons
- Recharts
- LangChain `createAgent` + LangGraph + `@langchain/openai`
- OpenAI Responses API / OpenAI兼容接口（可配置）
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

### 4. 可选：启用 LangChain Agent

默认使用规则引擎，不需要任何模型密钥。要启用 Agent，在 `.env.local` 配置：

```bash
QUALITY_AGENT_API_KEY=your-api-key
QUALITY_AGENT_MODEL=gpt-6-luna
# 使用OpenAI兼容网关时填写
QUALITY_AGENT_BASE_URL=
QUALITY_AGENT_USE_RESPONSES_API=true
QUALITY_AGENT_FALLBACK_TO_RULE=true
```

然后进入：

```text
管理后台 → 系统设置 → 质量 Agent
```

开启“使用 LangChain Agent”。API 密钥只从环境变量读取，不会写入数据库。诊断页面也允许针对单次分析选择“规则引擎模式”或“LangChain Agent”。

如果兼容网关不支持 Responses API，可设置：

```bash
QUALITY_AGENT_USE_RESPONSES_API=false
```

Agent 模式提供以下受限只读工具：

```text
get_alert_context
get_batch_measurements
get_equipment_window
get_reference_measurements
get_metric_definition
```

模型无法提交任意 SQL，也不能查询当前预警范围之外的任意批次。

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
| `/api/quality/analysis` | GET/POST/PUT | 按规则或Agent模式生成分析、保存工程师验证 |
| `/api/quality/agent/status` | GET | 查询当前模式、模型、密钥配置和降级策略 |
| `/api/quality/reports` | GET/POST/PUT | 创建、编辑、定稿 8D 报告 |
| `/api/quality/history` | GET | 查询定稿后的历史归档 |

## 数据流说明

1. 在系统管理中维护产品、规格、设备。
2. 在数据源管理中维护批次、产品检验和设备采集记录。
3. 监控页读取同一数据库中的产品数据；点击“重新扫描”可为新增超限记录创建预警。
4. 诊断页以 `alert_id` 为入口：规则模式直接执行确定性查询；Agent模式由 LangChain `createAgent` 自主选择白名单工具，并以 Zod Schema 输出结构化分析。
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
├── lib/quality-analysis/            # 规则引擎、LangChain Agent、工具与双模式编排
├── lib/auth.ts                      # 平台认证
└── storage/database/mysql-client.ts # MySQL 连接池与事务
scripts/
├── init-db.sql                      # 平台 + 业务 DDL、种子数据
├── init-db.js                       # 初始化入口
├── reset-db.sql                     # 开发环境重置
└── cdp-shot.mjs                     # 本地页面截图验收工具
```


## 异常诊断双模式

| 模式 | 特点 | 是否需要模型密钥 |
|---|---|---|
| `rule` | 确定性规则、固定证据层次、低延迟、可完全离线 | 否 |
| `agent` | LangChain Agent 自主调用数据工具、结构化推理、可扩展知识库 | 是 |

模式优先级：诊断页面单次选择 > `system_config.quality_analysis_mode` > `QUALITY_ANALYSIS_MODE`。

每次分析都会记录：

- `engine_type`：实际执行的是规则还是Agent
- `model_name`、`prompt_version`、`agent_version`
- `tool_trace_json`：Agent工具调用及证据
- `token_usage_json`、`raw_response_json`、`latency_ms`
- `fallback_reason`：Agent降级原因
- 每条结论的置信度、证据来源和工程师修改标记

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
