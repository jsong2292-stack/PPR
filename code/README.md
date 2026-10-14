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

- **系统管理**：产品类别、质量指标与影响因素、设备类型
- **数据源管理**：产品台账、设备台账、批次总览（由产品数据与设备数据按批次号实时关联，不单独维护）
- **产品台账**：产品规格与产品检验数据合并为一页，按「规格 → 生产批次 → 检验记录」三级下钻；批次页提供检验模板导入，保存后自动重算预警
- **设备台账**：设备采集数据合并进来，按「设备 → 生产批次 → 采集项」三级下钻；采集项随设备类型变化（挤出机=温度/压力，牵引机=牵引速度），并在批次内提供专用 Excel 模板导入（导入时先选批次号，采集数据按批次号挂到该设备）
- **数据维护**：列表检索、新增、编辑、删除、CSV 模板下载、Excel/CSV 批量导入
- **监控预警**：质量指标趋势、规格演示限值、预警队列、产品数据重新扫描
- **双模式异常诊断**：可选择确定性规则引擎或 LangChain Agent，并支持运行时配置切换
- **LangChain Agent**：通过白名单只读工具自主获取预警、批次趋势、设备窗口、参考批次和指标定义，输出结构化结论
- **自动降级**：Agent 未配置、超时或调用失败时可自动回退规则引擎，业务流程不中断
- **工程师验证**：逐条确认/驳回分析结论，记录实际发现和工程师意见
- **8D 报告生成 Agent**：新建一个 Agent 读取诊断摘要、页面引用的限值/趋势/设备数据、结论卡片和工程师填写的实际发现与意见，实时打印生成过程并产出 D1–D8 结构化草稿
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
QUALITY_AGENT_THINKING_MODE=disabled
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

对于 DeepSeek V4 等开启 thinking 后不支持强制 `tool_choice` 的模型，还需要关闭 thinking：

```bash
QUALITY_AGENT_THINKING_MODE=disabled
QUALITY_AGENT_REASONING_EFFORT=none
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
| `/quality/data/equipment-types` | 设备类型 |
| `/quality/data/equipment` | 设备台账（设备列表） |
| `/quality/data/equipment/[equipmentId]` | 该设备的生产批次列表 |
| `/quality/data/equipment/[equipmentId]/[batchNo]` | 该批次号下的设备采集项 |
| `/quality/data/products` | 产品台账（产品列表） |
| `/quality/data/products/[specId]` | 该规格的生产批次列表 |
| `/quality/data/products/[specId]/[batchNo]` | 该批次号下的检验记录 |
| `/quality/data/batches` | 批次总览（只读视图，由产品数据与设备数据按批次号实时关联；不能新建 / 编辑，删除 = 按批次号级联清理） |
| `/quality/data/metrics` | 质量指标与影响因素 |

> 旧入口 `/quality/data/specs`、`/quality/data/measurements` 会跳转到产品台账，`/quality/data/readings` 会跳转到设备台账。
| `/admin` | 平台管理后台 |

## 业务 API

所有 `/api/quality/*` 接口均要求登录。

| API | 方法 | 说明 |
|---|---|---|
| `/api/quality/master/[resource]` | GET/POST/PUT/DELETE | 7 类主数据和数据源通用 CRUD；`batches?spec_id=`、`measurements?batch_no=` 用于产品台账下钻收窄。批次（`batches`）是只读视图：批量 POST/PUT 直接返回「不能手工新建或编辑」；删除是**按来源清理**，`DELETE /api/quality/master/batches?id=<批次号>` 只清理该批次的检验记录（连带预警事件），需先探测再带 `confirm=1` 执行；设备侧采集数据走 `DELETE /api/quality/equipment/{设备ID}/batches/{批次号}/readings` |
| `/api/quality/equipment/[equipmentId]/batches` | GET | 该设备的批次列表，以及「导入采集数据」可选的候选批次号（批次由产品数据导入自动产生，不能手工新建） |
| `/api/quality/equipment/[equipmentId]/batches/[batchNo]/readings` | GET/POST/DELETE | 该批次号的采集项列表 / 按批次号导入该设备的采集数据（先选批次号再上传文件，幂等覆盖）/ 只清理本设备该批次的采集数据（带 `confirm=1` 执行，不牵连产品数据与其他设备） |
| `/api/quality/products/[specId]` | GET | 产品台账下钻的面包屑上下文；带 `?batch_no=`（值为批次号字符串）时一并返回批次 |
| `/api/quality/dashboard` | GET | 监控统计、趋势、预警和产品数据 |
| `/api/quality/alerts/evaluate` | POST | 按规格演示限值重新扫描产品数据 |
| `/api/quality/analysis` | GET/POST/PUT | 按规则或Agent模式生成分析、保存工程师验证 |
| `/api/quality/agent/status` | GET | 查询当前模式、模型、密钥配置和降级策略 |
| `/api/quality/reports` | GET/POST/PUT | 查询报告、创建空白草稿、编辑与定稿归档 8D 报告（不再写入固定模板文字） |
| `/api/quality/reports/generate` | POST | 8D 生成 Agent：按诊断摘要、页面数据、结论卡片和工程师填写生成 D1–D8；`Accept: text/event-stream` 时实时推送生成过程，并用 `draft` 帧把 D1–D8 按字段流式写入报告页输入框 |
| `/api/quality/history` | GET | 查询定稿后的历史归档 |

## 数据流说明

1. 在系统管理中维护产品类别、质量指标与设备类型（设备类型只保留挤出机与牵引机）。
2. 在「产品台账 → 规格页」或「批次总览页」导入**产品数据**文件（列含 `batch_no`、`spec_code`、`record_no`、`inspect_time` 与各测量值），检验记录落库后批次随即出现在「批次总览」里；规格取页面上下文 > 文件的 `spec_code`/`spec_name` > 该批次已有检验记录上的规格。批次不落表、也不需要先建批次。
3. 在「设备台账 → 某台设备 → 导入采集数据」里**先选批次号**（候选来自已有批次），再上传该设备的采集文件（列只有采集时间 + 该设备类型的采集项），采集数据即按批次号挂到这台设备上。
4. 明细数据（检验记录 / 采集数据）只能 Excel 导入，页面没有新增 / 编辑 / 删除入口；导入幂等——检验记录按 `record_no` 覆盖，采集数据按 `(equipment_id, batch_no, collect_time)` 覆盖，导错就重导。保存检验记录后服务端按规格限值自动重算受影响的批次。
5. 监控页读取同一数据库中的产品数据；点击“重新扫描”可为新增超限记录创建预警。
6. 诊断页以 `alert_id` 为入口：规则模式直接执行确定性查询；Agent模式由 LangChain `createAgent` 自主选择白名单工具，并以 Zod Schema 输出结构化分析。
7. 工程师逐条确认或驳回结论，验证结果实时写入 `ppr_analysis_conclusion`。
8. 诊断页点击「生成 8D 报告」：先把页面上未保存的实际发现/工程师意见落库，然后跳到 8D 报告工作台；报告页自动发起生成，由 8D 生成 Agent 读取诊断摘要、页面引用的限值/趋势/设备数据、结论卡片和工程师记录，实时打印生成过程并写出 D1–D8 草稿。
9. 生成期间 D1–D8 会随模型真实产出逐字段流式写入报告页输入框（真 SSE 增量，不是生成完再播动画）；字段写完后整份报告做一次结构化校验，落库内容以校验结果为准。
10. 生成结束后同一页切换为可编辑的 D1–D8 正文，工程师继续编辑、校验与定稿；D4 只能把 `confirmed` 结论写成已确认根因。
11. 定稿时在同一流程内更新报告、关闭预警、完成分析，并写入 `ppr_history_archive`。

## 代码结构

```text
src/
├── app/quality/                     # PPR 业务页面
├── app/api/quality/                 # PPR 业务 API
├── components/quality/              # 业务组件
├── components/ui/                   # 平台 shadcn/ui 组件
├── lib/quality.ts                   # 资源白名单、业务公共方法
├── lib/quality-equipment.ts         # 设备类型 → 采集项（页面列与模板列共用）
├── lib/quality-resource-config.ts   # 各资源页的字段/列配置 + 产品台账下钻列
├── lib/quality-analysis/            # 规则引擎、LangChain Agent、工具与双模式编排
├── lib/auth.ts                      # 平台认证
└── storage/database/mysql-client.ts # MySQL 连接池与事务
scripts/
├── init-db.sql                      # 平台 + 业务 DDL、种子数据
├── init-db.js                       # 初始化入口
├── reset-db.sql                     # 开发环境重置
├── generate-reading-demo.js         # 生成设备采集数据的模拟导入 Excel
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
