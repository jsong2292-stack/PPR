# 架构与分层

本文说明 PPR 质量智能分析助手的运行时分层、目录职责、统一约定与扩展方式，供接手开发与扩展功能的工程师使用。部署相关内容见 `docs/DEPLOY.md`，模块与权限清单见 `README.md`。

---

## 1. 设计目标与约束

1. **前后端分离**：页面与接口由 Next.js App Router 提供，业务数据全部在 MySQL，浏览器不保存任何业务数据（无 localStorage）。
2. **运维能力外置**：启动前置检查、优雅退出、请求日志、管理员引导、规则引擎定时扫描放在自定义 Server 中，不改动 Next 内部行为。
3. **约定优于配置**：鉴权、错误结构、审计、数值与缺失语义都由少数几个模块统一承担，业务代码只写业务；主数据进一步由配置驱动（`src/lib/masterdata/resources.ts`）。
4. **可追溯**：结论、报告、归档都保留当时的依据与版本快照；写操作全部留审计。
5. **如实的边界**：阈值未标定、AI 结论为服务端规则整理、通知默认只落库，这些状态必须在代码、接口与界面上可表达、不被包装成已完成的正式能力。
6. **不编根因**：诊断只产出「假设 + 分层证据」，缺层写成「缺失证据」，必须由工程师确认或否决后才进入 8D 报告。

---

## 2. 运行时分层

```
                    HTTP / HTTPS（反向代理）
                              │
┌─────────────────────────────▼──────────────────────────────────┐
│ 自定义 Server（server/）· Next 之外的最外层                      │
│   startup.ts      配置校验 + 数据库连通性 + 管理员引导            │
│   shutdown.ts     SIGTERM / SIGINT → 停扫描 → 停止接收 → 收尾      │
│   request-logger.ts  请求日志 / 慢请求告警（不记录请求体）        │
│   index.ts        http.Server + upgrade + 规则调度 + 关闭编排     │
└─────────────────────────────┬──────────────────────────────────┘
                              │ app.getRequestHandler()
┌─────────────────────────────▼──────────────────────────────────┐
│ Next.js App Router（src/app/）                                   │
│                                                                  │
│  Server Component / Layout             Route Handler             │
│   · 页面与工作台布局                    · /api/**                 │
│   · 服务端读取会话、重定向              · withApi() 统一包装      │
│   · 直接调用 src/lib 领域函数           · 校验 → 领域 → 响应      │
└─────────────────────────────┬──────────────────────────────────┘
                              │
┌─────────────────────────────▼──────────────────────────────────┐
│ 领域层 src/lib/                                                  │
│   config / env       运行时配置与环境变量加载                     │
│   errors / api       统一错误与响应体、withApi()                  │
│   validation         zod 校验片段                                │
│   db                 连接池、参数规整、query/execute、事务        │
│   auth/*             权限模型、会话签发校验、登录改密              │
│   audit              审计写入与查询                              │
│   format / types     数值 / 日期 / 缺失语义；共享领域类型         │
│   logger / route-helpers  结构化日志；路由共用辅助函数            │
│   analysis/rules     R1–R5 判定实现（阈值来自数据库）             │
│   repositories/*     数据访问：alertEvent / batch / diagnosis /   │
│                      inspection / metric                         │
│   services/*         应用服务：ruleEngine / ruleScheduler /       │
│                      monitor / analysisEngine / reportService /   │
│                      archiveService / ruleAdmin / system          │
│   masterdata/*       配置驱动的主数据 CRUD                        │
│   client/api.ts      浏览器端 API 客户端（仅客户端组件使用）       │
└─────────────────────────────┬──────────────────────────────────┘
                              │ mysql2 连接池（ppr_app，仅 DML）
┌─────────────────────────────▼──────────────────────────────────┐
│ MySQL 8.0.16+ · ppr_quality · 42 表 + 4 视图                     │
│   迁移由 scripts/db-migrate.ts 用 ppr_migrator 执行（DDL）        │
└─────────────────────────────────────────────────────────────────┘
```

### 关键边界

- **服务端与客户端的分界**：页面默认是 Server Component，可 `await` 领域函数直接读库；只有需要交互状态的组件（侧边栏折叠、表单、Toast、用户菜单）才加 `'use client'`，并通过 `src/lib/client/api.ts` 调用接口。
- **鉴权分界**：页面侧由 `src/app/(workspace)/layout.tsx` 在服务端统一拦截未登录；接口侧由 `withApi()` 声明 `permission`。两者都基于 `src/lib/auth/session.ts`。
- **数据库分界**：应用运行时只能通过连接池使用 `ppr_app`（DML）。DDL 只出现在迁移文件中，由 `ppr_migrator` 执行。
- **构建与运行分界**：`next build` 产出 `.next`；运行时由 `tsx` 运行 `server/main.ts`。
- **规则判定的分界**：判定逻辑在代码里（`analysis/rules.ts`），阈值与顺序在数据库里（`alert_rule`）；现场调阈值不改代码、不重新部署。

---

## 3. 目录职责

| 目录 | 职责 | 不该放什么 |
| --- | --- | --- |
| `server/` | 进程生命周期：启动检查、HTTP 服务创建、请求日志、信号处理、管理员引导、规则调度注册。不包含业务逻辑 | 业务查询、页面渲染、领域规则 |
| `src/app/` | 路由与页面。App Router 的 layout / page / Route Handler | 大段 SQL、可复用的业务计算 |
| `src/app/api/` | HTTP 接口。路由函数只做「解析入参 → 调用领域函数 → 返回统一响应」 | 鉴权样板代码（交给 `withApi()`）、直接拼 SQL |
| `src/lib/analysis/` | 纯判定实现（R1–R5）：输入上下文、输出「命中 + 风险 + 原因 + 窗口」 | 数据库访问、HTTP |
| `src/lib/repositories/` | 数据访问：只写 SQL 与行到领域对象的映射 | 权限判断、响应结构、业务状态机 |
| `src/lib/services/` | 应用服务：编排 repository、执行业务规则、事务、审计 | React、请求解析 |
| `src/lib/masterdata/` | 配置驱动的主数据定义（字段 / 列 / 校验 / 权限）与通用 CRUD | 单表专用的重复代码 |
| `src/lib/`（其余） | 基础设施：配置、数据库、鉴权、错误、审计、格式化、校验、共享类型 | React 组件、JSX |
| `src/lib/client/` | 浏览器端工具（API 客户端、错误映射） | 任何服务端专用模块（`node:*`、数据库） |
| `src/components/` | 可复用 UI：布局（`Sidebar` / `UserMenu` / `WorkspaceShell` / `PageHeader`）、反馈（`Toast` / `Modal`） | 业务数据获取与写库 |
| `src/config/` | 跨页面的静态配置。当前为 `navigation.ts`：导航结构的单一来源 | 运行时可变状态 |
| `src/styles/` | 全局样式 | 组件级逻辑 |
| `db/` | 数据库资产：`migrations/`（唯一可执行来源）、`schema.sql`（结构总览）、`tools/`（基线数据生成与写路径冒烟测试）、设计说明 `README.md` | 应用运行时逻辑 |
| `scripts/` | 一次性 / 运维脚本：本地初始化、迁移、自检、不变量检查、端到端冒烟、账号维护、工具链检查。脚本用一次性连接，不与应用共享连接池 | 被请求路径引用的代码 |
| `docs/` | 部署与架构文档 | 代码 |

### 当前实现状态

- **基础设施**：配置、数据库、鉴权、审计、格式化、校验、API 包装、共享类型、路由辅助均已落地。
- **业务领域**：规则引擎（`analysis/rules.ts` + `services/ruleEngine.ts` + `services/ruleScheduler.ts`）、质量监控（`services/monitorService.ts` + `repositories/*`）、诊断（`services/analysisEngine.ts`）、8D 报告（`services/reportService.ts`）、归档与通知（`services/archiveService.ts`）、规则与系统管理（`services/ruleAdminService.ts`、`services/systemService.ts`）、主数据（`masterdata/*`）已落地。
- **页面**：`src/config/navigation.ts` 登记的 22 个导航页面全部落地并返回 200（质量监控、异常诊断、8D 报告、归档、通知、数据源 7 页、基础主数据 6 页、系统管理 4 页），另有登录、修改口令、无权限 3 个非导航页。
- **接口**：23 个路由全部运行通过——`api/auth/*`、`api/health`、`api/masterdata/*`、`api/monitor/inspections/:id`、`api/events`、`api/diagnosis`、`api/reports*`、`api/archives*`、`api/notifications*`、`api/datasource/*`（含 Excel 导入与模板下载）、`api/system/*`（规则 / 数据来源 / 用户 / 审计）。

第 7 节的扩展指引描述的是本项目约定的分层落位方式，新增功能请按此分层，不要继续把 SQL 写在页面或路由里。第 9 节列出了当前状态与差距，请以代码为准。

---

## 4. 统一 API 约定

### 4.1 包装器 `withApi()`

位置：`src/lib/api.ts`。每个 Route Handler 都必须用它包装，它收敛了四件重复工作：登录与权限校验、业务异常转结构化响应、未预期异常记录堆栈后转 500、统一成功响应体。

签名：

```ts
export const POST = withApi(
  {
    name: 'POST /api/xxx',        // 操作名，用于日志与错误上下文
    permission: 'datasource:write', // 需要的权限；省略=必须登录；null=公开接口
    allowPasswordResetPending: false, // 首登未改密是否放行，默认 false
  },
  async ({ request, user, params }) => {
    // 只写业务：解析入参、调用领域函数、返回 ok(data)
  },
);
```

约定：

| `permission` 取值 | 含义 | 未满足时 |
| --- | --- | --- |
| `null` | 公开接口（登录、健康检查、会话查询） | 不校验 |
| 省略 | 必须登录，不需要额外权限 | 401 |
| 具体权限字符串 | 必须登录且具备该权限 | 未登录 401；无权限 403 |

### 4.2 响应体

成功（`ok(data, meta?, init?)`）：

```json
{ "ok": true, "data": { } }
```

`meta` 可选，用于分页等附加信息。

失败（`fail()` 自动生成）：

```json
{ "ok": false, "code": "VALIDATION_FAILED", "message": "请求参数校验未通过。", "fields": { "code": "不能为空" } }
```

错误码与 HTTP 状态的对应关系（`src/lib/errors.ts`）：

| `code` | HTTP | 触发场景 |
| --- | --- | --- |
| `BAD_REQUEST` | 400 | 参数格式错误、请求体不是合法 JSON |
| `UNAUTHORIZED` | 401 | 未登录、会话失效、账号或口令不正确 |
| `FORBIDDEN` | 403 | 已登录但缺少权限、账号被锁定、账号未设置密码 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `CONFLICT` | 409 | 唯一键冲突（`ER_DUP_ENTRY`）、外键引用冲突（`ER_ROW_IS_REFERENCED_2` / `ER_NO_REFERENCED_ROW_2`） |
| `VALIDATION_FAILED` | 422 | zod 校验失败，带 `fields` |
| `UNPROCESSABLE` | 422 | 语义上不可处理（例如状态机不允许的操作） |
| `INTERNAL` | 500 | 未预期异常，记录完整堆栈，**不向前端泄露内部细节** |

要点：

- 业务代码通过抛 `AppError` 表达可预期失败（`AppError.badRequest` / `unauthorized` / `forbidden` / `notFound` / `conflict` / `validation` / `unprocessable`），由 `withApi()` 统一转换，路由里不要写 `if (!x) return NextResponse.json(...)`。
- MySQL 错误码到 HTTP 状态的映射已经在 `fail()` 中处理，业务层无需重复判断。
- 成功体只由 `ok()` 产出，不要在路由里直接 `NextResponse.json` 自定义结构（`/api/health` 的 503 也用 `ok(payload, undefined, { status: 503 })`，保持外层结构一致）。

### 4.3 入参校验

`src/lib/validation.ts` 提供统一入口：

| 函数 | 用途 |
| --- | --- |
| `parseBody(request, schema)` | 解析并校验 JSON 请求体 |
| `parseQuery(request, schema)` | 解析并校验查询参数 |
| `parseId(value, label)` | 解析正整数路径参数 |
| `optionalText(max)` / `requiredText(label, max)` | 文本字段，`''` 与 `undefined` 归一为 `null` |
| `optionalNumber(label)` / `requiredNumber(label)` | 数值字段，接受数据库返回的数字字符串 |
| `booleanish` / `idArray` / `paginationSchema` | 布尔、ID 数组、分页片段 |

校验失败统一抛 `AppError.validation`，前端可直接把 `fields` 标到表单上。

### 4.4 客户端调用

浏览器端统一走 `src/lib/client/api.ts`：

```ts
import { api, errorMessage, fieldErrors } from '@/lib/client/api';

try {
  const data = await api.post<Result>('/api/xxx', body);
} catch (error) {
  setErrors(fieldErrors(error));
  toast.error(errorMessage(error));
}
```

`api` 会自动解析 `{ ok, data }`，失败时抛 `ApiError`（带 `status`、`code`、`message`、`fields`），组件里不需要写 `if (!res.ok)` 分支。请求默认 `credentials: 'same-origin'`，会话 Cookie 自动携带。

---

## 5. 数据层约定

### 5.1 连接与查询（`src/lib/db.ts`）

| 函数 | 用途 |
| --- | --- |
| `query(sql, params)` | 查询多行 |
| `queryOne(sql, params)` | 查询单行，无结果返回 `null` |
| `execute(sql, params)` | 写入，返回 `ResultSetHeader`（`insertId` / `affectedRows`） |
| `queryScalar(sql, params)` | 取单列标量（COUNT / SUM） |
| `withTransaction(handler)` | 事务包装 |
| `pingDatabase()` | 健康检查，返回 MySQL 版本与当前时间 |
| `closePool()` | 进程退出时释放连接池（由优雅退出调用） |

连接池配置（`getPool()`，惰性创建）固定使用：`charset: 'utf8mb4'`、`timezone` 取 `DB_TIMEZONE`（默认 `+08:00`）、`dateStrings: true`、`decimalNumbers: false`、`waitForConnections: true`、`enableKeepAlive: true`。

两个与连接绑定的行为：

1. **参数规整**：`query()` / `execute()` 等执行入口统一调用 `normalizeParams()`，把 `undefined` 规整为 `NULL`、`boolean` 转为 `0/1`。原因：mysql2 对 `undefined` 参数直接抛错（`Bind parameters must not contain undefined`），而 TypeScript 的可选字段在运行时很容易变成 `undefined`；TINYINT(1) 也不接受布尔值。有了这一层，repository 不需要到处写 `?? null`。
2. **会话时区对齐**：`pool.on('connection')` 在**每条连接建立时**执行 `SET time_zone = '<DB_TIMEZONE>'`。MySQL 的 `DATETIME` 不带时区，`NOW()` / `CURRENT_TIMESTAMP` 取会话时区；若数据库全局时区是 UTC 而驱动按 `+08:00` 解析，`created_at` / `updated_at` 会读出来少 8 小时。设置失败只记 `logger.warn`，不影响连接可用性。部署注意点见 `docs/DEPLOY.md` 第 4.5 节。

### 5.2 时间：`dateStrings: true`

DATETIME 以 `'YYYY-MM-DD HH:mm:ss'` 字符串返回，**不交给 Node 的 `Date` 对象**。原因是 `new Date('2026-10-10 08:00')` 在不同运行时对本地时区与 UTC 的解释不一致，会把现场时间整体偏移。时间解析与格式化统一用 `src/lib/format.ts`：

- `parseDateTime` / `minutesBetween`：显式拆解年月日时分秒，与数据库 DATETIME 语义一致；
- `normalizeDateTime` / `toDateString` / `toTimeString` / `formatLocal` / `nowDateTime`：展示与写入格式化。

新增时间字段时，不要自行 `new Date(row.time)`。

### 5.3 数值：DECIMAL 以字符串返回

`decimalNumbers: false` 使 DECIMAL 以字符串返回（例如 `"25.2300"`），从而保留数据库精度、避免二进制浮点误差。业务层需要数值时必须显式转换：

- `src/lib/format.ts` 的 `isNum` / `toNum` / `fmt` / `fmtUnit` / `fmtSigned` / `fmtPercent` / `fmtCount`；
- 接口层原样返回字符串，由展示层按指标字典的 `decimal_scale` 格式化。

**禁止**直接用 `Number(...)` 转换用户输入或数据库值：`Number('') === 0` 会把「未填写」静默变成 0。

### 5.4 缺失语义：不写行 = null = 无数据

测量值采用「表头 + 指标值行」长表（`inspection_record` + `inspection_value`、`product_data` + `product_data_value`、`equipment_reading` + `equipment_reading_value`、`process_record` + `process_zone_value`）。

规则链：

```
指标无数据  →  不写入值行  →  LEFT JOIN 后该列为 NULL  →  接口返回 null  →  界面显示「无数据」
```

- 界面**绝不能**把缺失显示为 `0`，也不能留空。统一文案 `NO_DATA = '无数据'`，证据不足时用 `INSUFFICIENT = '数据不足'`。
- 需要区分「值为 0」与「无数据」时，用 `isNum` / `toNum` 判断，不要用 `if (!value)`。

### 5.5 事务：`withTransaction`

```ts
await withTransaction(async (conn) => {
  await conn.query('UPDATE ...', [...]);
  await conn.query('INSERT ...', [...]);
});
```

- 回调抛错自动回滚，正常返回自动提交，连接始终归还连接池；
- **事务内的查询必须使用回调提供的 `conn`**，不能用全局 `query()` / `execute()`，否则会跑在连接池里的另一条连接上，不属于本事务；
- 迁移脚本使用 `scripts/lib/db-utils.ts` 的一次性连接（`connectAs` / `connectAsApp`），与应用连接池相互独立。

### 5.6 主数据：配置驱动

主数据表结构相似，差异只在字段清单与校验规则。差异集中在一处配置，API 与页面复用同一套通用实现：

- `src/lib/masterdata/resources.ts`：定义每个资源的表名、业务编码列与前缀、列表列（`columns`）、可编辑字段（`fields`，含引用型下拉与小数位）、zod 校验 schema、软删除与非空约束、以及三项权限（`read` / `write` / `remove`）。
- `src/lib/masterdata/service.ts`：通用 CRUD —— 唯一性检查、软删除前的引用检查、`created_by` 写入、审计留痕（detail 记录「改前 → 改后」）。
- 路由只有两个文件：`src/app/api/masterdata/[resource]/route.ts`（列表 / 新建）与 `src/app/api/masterdata/[resource]/[id]/route.ts`（详情 / 更新 / 删除）。

当前注册 7 个资源：`categories`、`specs`、`equipment-types`、`equipment`、`lines`、`metrics`、`spec-limits`。新增一类主数据 = 在 `resources.ts` 加一份配置，不需要写新的路由。

引用完整性由服务层显式检查：仍被业务数据引用的主数据不允许物理删除，返回 409 并给出引用条数，引导改为停用（软删除），避免打断历史数据的引用链。

### 5.7 证据来源与依据分层

代码里有两个**不同**的概念，不要混用：

**一、业务证据来源**（`src/lib/services/analysisEngine.ts` 的 `EvidenceItem.evidenceType`）——证据来自哪类数据：

| 业务来源 | 内容 |
| --- | --- |
| 测量数据 | 抽检记录中的指标测量值与规格上下限 |
| 工艺参数 | 温区设定 / 反馈、牵引速度等工艺记录 |
| 设备采集 | 设备逐小时的温度、压力、牵引速度 |
| 参考对照 | 参考批次的中位数与观察范围（非规格限值） |
| 数据核对 | QMS / MES 双来源比对结果与容差 |
| 观察事实 | 事件本身的时间、批次、规则与影响范围 |

**二、依据分层**（`src/lib/types.ts` 的 `BasisLayer`，写入 `conclusion_evidence.layer`）——证据在结论结构里属于哪一层：

```
'规格限值' | '变化趋势' | '参考对照' | '相关因素变化' | '数据核对' | '观察事实'
```

**写库映射**：`toEvidenceType()` 把业务来源映射为 `conclusion_evidence.evidence_type` 的三分类 `basis` / `support` / `contradict`——当前实现中「测量数据」映射为 `basis`，其余全部映射为 `support`；`contradict` 在枚举里存在但当前假设生成器**尚未产出**，因此界面上的「反向证据」目前不会被填充。

约定与局限：

- 业务来源**没有独立的数据库列**，只在 `content` 文本中体现、并通过 `evidence_type` 间接表达。需要在界面上按来源筛选时，需要新增列或按 `content` 约定前缀，属于已知扩展点。
- **缺层禁止用 `0` 或空字符串代替**，必须写成「缺失证据」并列出补数动作（`analysis_conclusion.missing_evidence` / `validation_actions`）；这是「无数据不推断」原则在结论层的落地。
- 每条证据通过 `fact_time` + `related_record_id` + `is_locateable` 支持「点回原始记录」，这是「结论必须可定位」的落地方式。

### 5.8 迁移与校验和

- 迁移文件 `db/migrations/NNNN_*.sql`，按文件名排序执行；
- 台账 `schema_migration` 记录文件名、sha256 前 16 位校验和、语句条数、执行账号、执行时间；
- 当前迁移：`0001_schema`、`0002_seed`、`0003_platform_baseline`、`0004_rule_wording`、`0005_trend_params_and_samples`、`0006_rule_param_alignment`；
- **已应用的迁移不可修改**，变更一律新增文件；回滚同样靠新增迁移（见 `docs/DEPLOY.md` 第 12 节）；
- `splitStatements()` 只处理本项目实际使用的 SQL 形态（无存储过程 / 触发器 / 自定义 DELIMITER）。

---

## 6. 审计约定

位置：`src/lib/audit.ts`，写入 `operation_log`。

**所有写操作都必须调用 `writeAudit()`**，包括但不限于：登录、登录失败、登出、改密、主数据增删改、数据导入、规则扫描、AI 生成、工程师决策、归档、通知、报告保存与定稿、事件处置。

```ts
await writeAudit({
  user,                        // 取 user.userId；系统动作可传 null
  module: 'datasource',        // 见 AuditModule
  action: 'update',            // 见 AuditAction
  targetType: 'product_spec',
  targetId: spec.id,
  detail: '修改产品规格上下限',  // 上限 1000 字符
  detailJson: { before, after }, // 结构化差异，可选
  request,                     // 用于提取 ip 与 user-agent
});
```

约定：

- **审计失败不影响主流程**：`writeAudit()` 内部捕获异常并降级为 `logger.warn`。把审计失败升级为业务错误只会制造更大的可用性问题。
- 只记录标识与摘要，**不记录敏感内容**（口令、完整请求体）。`ip` 截断到 64 字符、`user_agent` 到 255 字符，客户端 IP 优先取 `x-forwarded-for` 的第一段。
- 查询某条数据的操作历史用 `listAuditFor(targetType, targetId, limit)`。
- 新增 `module` / `action` 时，在 `AuditModule` / `AuditAction` 联合类型中登记，避免字符串野值。

---

## 7. 扩展指引

### 7.1 新增一个页面与接口

以「新增一个主数据列表页」为例，按以下顺序落地：

**第 1 步：登记导航。** 在 `src/config/navigation.ts` 的 `NAV_GROUPS` 对应分组中加一条：

```ts
{
  href: '/masterdata/categories',
  label: '产品类别',
  icon: '类',
  permission: 'masterdata:read',
  description: '产品类别台账；产品规格按类别归类。',
}
```

导航是页面标题、侧边栏与面包屑的单一来源，不要在其他地方重复维护页面清单。`permission` 决定侧边栏是否渲染该入口。

**第 2 步：写 repository（数据访问）。** 现有 repository 位于 `src/lib/repositories/`（`alertEventRepository`、`batchRepository`、`diagnosisRepository`、`inspectionRepository`、`metricRepository`），新增时沿用同一目录与命名：

- 只写 SQL 与行到领域对象的映射，不写权限判断与响应结构；
- 列名用 `AS alias` 映射为 camelCase；
- 时间字段原样返回字符串，数值字段保持字符串或显式转换；
- 缺失的可选指标用 `LEFT JOIN` + `null`，不要 `COALESCE(..., 0)`。

**第 3 步：写 service（业务规则）。** 放在 `src/lib/services/`：

- 编排多个 repository 调用、执行校验与状态机判断；
- 可预期失败抛 `AppError`；
- 写操作调用 `writeAudit()`；
- 多表写入在同一 `withTransaction()` 内完成。

**第 4 步：写 Route Handler。** 在 `src/app/api/<domain>/route.ts`（或带 `[id]` 的目录）中：

```ts
import { withApi, ok } from '@/lib/api';
import { parseBody, parseId } from '@/lib/validation';
import { safeJson, flattenZod } from '@/lib/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withApi(
  { name: 'POST /api/masterdata/categories', permission: 'masterdata:write' },
  async ({ request, user }) => {
    const body = await parseBody(request, schema);
    const created = await createCategory(body, user);
    return ok(created);
  },
);
```

现有接口都显式声明 `runtime = 'nodejs'`（依赖 `mysql2` 与 `node:crypto`，不能用 Edge Runtime）与 `dynamic = 'force-dynamic'`（会话与数据都不能静态化）。请求体解析与 zod 错误扁平化等共用逻辑放在 `src/lib/route-helpers.ts`，不要从 `route.ts` 导出（Next 会校验路由文件的导出集合）。

**第 5 步：写页面。** 在 `src/app/(workspace)/<path>/page.tsx`：

- 默认 Server Component，可直接 `await` service / repository 读取数据；
- 交互部分拆成 `'use client'` 子组件（参考 `src/app/login/LoginForm.tsx`、`src/app/account/password/ChangePasswordForm.tsx`）；
- 客户端组件通过 `src/lib/client/api.ts` 调用接口，不要直接 `fetch`；
- 页面只负责展示与交互，权限由工作台布局与导航共同保证；接口侧仍需独立声明 `permission`（页面隐藏入口不等于接口安全）。

**例外：主数据不要重复这条路径。** 主数据走配置驱动（第 5.6 节），新增一类主数据只需在 `src/lib/masterdata/resources.ts` 加配置，路由与通用 CRUD 已存在。

### 7.2 新增一张表或一个迁移

1. 先改 `db/schema.sql`（结构设计与评审的完整版本），同步更新 `db/README.md` 的表清单与说明；
2. 新增迁移文件，序号连续、描述清晰：

   ```
   db/migrations/0006_add_xxx.sql
   ```

3. 迁移内容约定：
   - 顶部写清目的、影响范围与可重复执行性；
   - 结构变更优先使用幂等写法（参考 `0003_platform_baseline.sql` 用 `information_schema` + `PREPARE` 判断列是否存在）；
   - 只改数据时使用定向 `UPDATE ... WHERE code = ?`，不要用宽泛条件；
   - 不要修改已应用的历史迁移文件；
   - 若新增的是阈值参数，必须同时确认 `src/lib/analysis/rules.ts` 真的读取该键，并在 `src/lib/services/ruleAdminService.ts` 的 `RULE_PARAM_SPECS` 中登记，否则保存时会被 422 拒绝（迁移 `0005` 的 `maximum_window_hours` 就是反例，见第 8.3 节）；
4. 本地验证：

   ```bash
   pnpm db:migrate --dry-run
   pnpm db:migrate --status
   pnpm db:migrate
   pnpm db:check
   pnpm db:smoke
   ```

5. 生产按 `docs/DEPLOY.md` 第 5 节的顺序执行（先迁移后启动新版本）。

命名与结构约定（与 `db/README.md` 一致）：`BIGINT UNSIGNED` 代理键 + 业务编码唯一键；`InnoDB` + `utf8mb4_0900_ai_ci`；`DATETIME` 无时区；数值用 `DECIMAL`；封闭集合用 `ENUM`，会增长的用字典表；主数据软删除 `is_deleted`；中文表 / 列注释；外键与索引显式声明。

### 7.3 新增一个质量指标

质量指标是**字典驱动**的，新增指标不需要 `ALTER TABLE`：

1. 在 `quality_metric` 插入一行：`code`、`name`、`unit`、`metric_role`（`primary` 参与判定 / `raw` 原始测点 / `derived` 计算指标）、`decimal_scale`（前端格式化小数位）、`check_direction_hint`（核查方向文案）；
2. 在 `metric_spec_limit` 为**规格 × 指标**写入上下限，`limit_type` 与 `calibration_status` 如实标注可信状态（未标定不得写成 `validated`）；
3. 需要展示影响因素时，在 `metric_influence` 关联 `process_parameter`；
4. 数据写入侧无需改结构：抽检值写 `inspection_value`、产品数据写 `product_data_value`、采集值写 `equipment_reading_value`，都是 `(表头, metric_id)` 的长表；
5. 派生指标（如不圆度 = 最大外径 − 最小外径）由服务层计算后以 `is_derived = 1` 写入，或在查询层派生；**某指标无数据就不写行**。

需要新增一条预警规则时，改动点不止数据库：规则判定是**代码里的实现 + 数据库里的配置**，只有 `code` 在 `BUILTIN_RULES`（`src/lib/analysis/rules.ts`）中有实现，引擎才会加载它（`ruleEngine.loadRules()`）。完整步骤：

1. 在 `src/lib/analysis/rules.ts` 新增一个 `AlertRule`（`code` / `name` / `evaluateOrder` / `evaluate`）并加入 `BUILTIN_RULES`；
2. 在 `alert_rule` 插入 `code` / `name` / `risk_type` / `evaluate_order` / `rule_category` / `params_json` / `calibration_status` / `description`（新增迁移，不要改历史迁移）；
3. 若该规则读取阈值参数，在 `src/lib/services/ruleAdminService.ts` 的 `RULE_PARAM_SPECS` 中登记键名、单位、默认值与取值范围——**未登记的键会被 `PUT /api/system/rules` 以 422 拒绝**；
4. 在 `src/lib/services/analysisEngine.ts` 的 `HYPOTHESIS_BUILDERS` 中为该 `code` 注册假设生成器，诊断页才能给出结论候选；
5. 更新 `docs/ARCHITECTURE.md` 与 `README.md` 的规则说明。

`code` 不可通过接口修改：它是代码与数据库之间的契约键，改动会让规则变成「只有配置、没有实现」的死配置。

### 7.4 扩展权限

权限点是代码侧常量（`src/lib/auth/permissions.ts` 的 `PERMISSIONS`），角色到权限的映射在 `ROLE_PERMISSIONS`。新增权限的完整步骤：

1. 在 `PERMISSIONS` 中加 `资源:动作`；
2. 在 `ROLE_PERMISSIONS` 中为相关角色补上；
3. 在 `navigation.ts` 的对应导航项声明该 `permission`（若是页面级权限）；
4. 在接口的 `withApi({ permission })` 中声明；
5. 数据库 `sys_role` 只存角色编码与展示信息，权限判定不在数据库里，因此不需要为此写迁移。

---

## 8. 可扩展点与已知边界

### 8.1 诊断结论的生成方式

一次「生成分析」对应 `analysis_run` 一行，`generation_type` 为 `ENUM('rule_based','llm')`，默认 `rule_based`，并预留 `model_name` 与 `prompt_version` 用于真实大模型接入时追溯。

- **当前实现**（`src/lib/services/analysisEngine.ts`）：`rule_based` —— 由服务端规则整理出结论，不调用外部大模型。`buildDiagnosisInput()` 一次查询采集全部输入；`HYPOTHESIS_BUILDERS` 按事件命中的规则编码（R1–R5）分派「假设生成器」；`runDiagnosis()` 在一个事务内写入 `analysis_run`、`analysis_reference_snapshot`（参考批次统计快照：样本数、中位数、观察范围）、`analysis_conclusion` 与 `conclusion_evidence`（分层证据）。
- 三种硬性原则（写在代码里，也写在页面上）：不编根因（每条结论都是假设）；无数据不推断（缺层写「缺失证据」并列出补数动作）；结论必须可定位（证据带时间与来源记录，可点回原始记录）。
- 接入真实大模型时的扩展点：新增一个生成器实现，写入 `generation_type='llm'`、`model_name`、`prompt_version`；`HYPOTHESIS_BUILDERS` 的分派结构可以保留为兜底。需要同步把 `ruleAdminService` 的 `RULE_PARAM_SPECS` / 前端提示一并调整。
- **不可变约定**：AI 原文与工程师验证分列保存（`analysis_conclusion` 中 `hypothesis` 等字段与 `engineer_decision` / `validation_result` / `engineer_comment` 互不覆盖）；重新生成 = 新增 `run_no`，不覆盖历史结论与工程师记录。

### 8.2 8D 报告

`src/lib/services/reportService.ts`：

- **预填**（`createReportFromEvent`）：把已落库的事实搬进报告——事件信息、规则与阈值状态、抽检测量值、工程师已确认的结论，字段来源标记为 `ai_prefill`，只搬事实、不写结论性语言，没把握的字段留空并提示「待工程师填写」。
- **保存草稿**（`saveReportDraft`）与**重新打开**（`reopenReport`）：每次写入 `eight_d_revision` 并带内容快照，可回答「报告在什么时候被改成了什么样」。
- **定稿校验**（`finalizeReport`）：D1 / D2 / D3 必填，且至少有一条工程师已确认的根因结论；校验不通过直接拒绝定稿，不允许「空着就定稿」。
- 导出会写一次导出审计（`recordReportExport`）。

### 8.3 规则引擎与阈值参数

- **判定**：`src/lib/analysis/rules.ts` 按 `evaluate_order` 顺序执行 R1–R5，第一条命中即返回，R5 为兜底（`is_terminal=1`）。
- **引擎**：`src/lib/services/ruleEngine.ts` 的 `loadRules()` 只加载「代码里有实现」的编码；`buildRuleContext()` 组装上下文；`scanInspections()` 扫描抽检记录并通过 `INSERT ... ON DUPLICATE KEY` 落事件，事件编号形如 `QE-{批次号}-{YYYYMMDD}-{序号}`。
- **调度**：`src/lib/services/ruleScheduler.ts` 的 `startRuleScheduler()` / `stopRuleScheduler()`，由 `server/index.ts` 在启动后注册、优雅退出时停止；`runRuleScanNow()` 可手动触发一轮。单实例内用 `running` 标记串行，启动后延迟一个间隔再扫描；多实例各自扫描，靠事件去重键保证不重复，不引入分布式锁。
- **阈值来源必须逐规则确认**，`params_json` 并非每条规则都读取：

  | 规则 | `params_json` 读取的键 | 其它阈值来源 |
  | --- | --- | --- |
  | R1 | 无 | `data_consistency_check.tolerance_value`（每条核对记录自带） |
  | R2 | 无 | 物理关系与规格偏差比例写死在 `rules.ts` |
  | R3 | 无 | `metric_spec_limit` 表的上下限 |
  | R4 | `consecutive`、`minimum_change_mm`、`maximum_gap_minutes` | 趋势窗口固定为「同一生产日」 |
  | R5 | 无 | 兜底 |

- **写入校验**：`src/lib/services/ruleAdminService.ts` 的 `RULE_PARAM_SPECS` 只允许上表中 R4 的 3 个键，其余键一律 422；`code` 不可改。
- **已知不一致（待处理）**：迁移 `0005_trend_params_and_samples.sql` 给 R4 写入了 `maximum_window_hours`，但 `rules.ts` 的 R4 只读取上述 3 个键，`RULE_PARAM_SPECS` 也不接受该键——它是**当前无效的参数**，且 `rules.ts` 中「需要更长窗口时改 maximum_window_hours」的注释与实现不符。处理方式二选一：实现按该参数扩大趋势窗口，或从迁移/种子中移除该键；在此之前不要把「可配置趋势窗口」写成既有能力。
- **阈值当前为 `demo`，尚未现场标定**：`calibration_status` 在标定完成前必须保持非 `validated`，界面与报告需持续显示「阈值待现场标定」。`CALIBRATION_LABELS` 把 `demo` 与 `pending_field_validation` 都展示为同一文案。
- 扫描产生事件时写一次审计（`action: 'rule_scan'`），没有任何事件时不写，避免日志表被空扫描淹没。

### 8.4 通知与邮件

`src/lib/services/archiveService.ts` 的 `dispatchNotification()`：

- **发送策略分两步**：先落库（`notification` + `notification_recipient`），保证「发出过什么」有记录；再尝试外发。
- **未配置 SMTP 时**（默认 `NOTIFY_TRANSPORT=db`，或 `SMTP_HOST` / `SMTP_FROM` 为空）：状态记为 `cancelled`，`error_message` 写明「未配置 SMTP，通知已落库，可人工外发」。这样把「没配通道」与「通道故障」区分开。
- **配置 SMTP 时**：需要额外安装 `nodemailer`（**不在 `package.json` 的依赖中**）。代码用动态 `import()` 按需加载，未安装时不会导致服务启动或构建失败，只在真正投递时报错「未安装 nodemailer，无法外发邮件（pnpm add nodemailer）」。要启用外发请先 `pnpm add nodemailer` 并纳入部署产物。
- **外发失败只更新投递状态与错误信息（`status` / `error_message` / `attempt_count`），不回滚落库**：邮件网关故障不会让预警丢失，界面里始终能看到待通知记录。
- 「中风险是否自动发送」仍是待业务确认项，由 `notification.trigger_mode`（`manual` / `auto`）表达，默认手动；`is_simulated` 标记发送性质。

### 8.5 其它已知边界

| 项目 | 现状 | 扩展点 |
| --- | --- | --- |
| 登录失败锁定 | 进程内存计数（5 次 / 10 分钟），多实例不共享 | 改为 Redis 或数据库计数（`src/lib/auth/service.ts`） |
| 会话存储 | 无状态 JWT，无黑名单 | `sys_user.session_version` 已支持强制下线；如需逐令牌吊销再加黑名单 |
| 账号体系 | 本地口令（bcrypt） | `sys_user.password_hash` 允许为空 + `must_reset_password`，为企业 SSO 预留 |
| 8D 审批 | 只有 `status`（草稿 / 已定稿）与 `eight_d_revision` | 需企业 OA 审批时新增审批表与流程 |
| Excel 批量导入 | `import_job` 表（`validating → validated → committed`）与 `api/datasource/import`、模板下载接口已在仓库中，处于并行开发 | 约定「校验不通过不写入任何数据」；页面尚未落地 |
| 壁厚多点测点 | `inspection_wall_point` 已预留 | 数据采集方案确认后写入 |
| 生产事件 | `production_event` 已建表并由 `0003` 补齐停机 / 换规格记录 | 用作 R4 趋势判断的运行连续性前置信息 |
| 文件存储 | 全部业务数据在 MySQL，**无 localStorage**；上传文件不落对象存储 | 如需保存导入原文件，另接对象存储并只存引用 |
| 参数校验 | zod schema 定义在路由文件内；主数据 schema 在 `masterdata/resources.ts` | 多个接口共用时抽到领域层 |
| 趋势窗口 | `maximum_window_hours` 可配（迁移 `0006` 起生效，默认 24 小时＝同一生产日；超过 24 小时改按滚动窗口） | 见第 8.3 节 |
| 证据三分类 | `conclusion_evidence.evidence_type` 的 `contradict`（反向证据）当前无生成器产出；业务来源没有独立列 | 需要按来源筛选或展示反向证据时，扩展假设生成器与 `conclusion_evidence` 结构 |

---

## 9. 当前实现进度与差距（务必与代码核对）

为避免文档领先于实现，以下差异请以代码为准：

| 能力 | 配置 / 表结构 | 代码实现 |
| --- | --- | --- |
| 22 个导航页面 | `src/config/navigation.ts` 已全部登记 | 全部落地，逐页返回 200（构建产物中均为动态路由 `ƒ`） |
| 业务接口 | 表结构与字段齐备 | 23 个路由全部运行通过，含 Excel 导入（服务端逐行校验、任一行有错整批拒绝）与系统管理四组接口 |
| 规则引擎 R1–R5 | `alert_rule` 规则与阈值 | 已实现：`analysis/rules.ts` + `services/ruleEngine.ts` + `services/ruleScheduler.ts`，启动时注册、退出时停止；R4 的 `maximum_window_hours` 自迁移 `0006` 起真正生效 |
| 质量监控 | `inspection_record` / `alert_event` 等 | 已实现：`services/monitorService.ts` + `repositories/*`，页面 `/monitor` |
| 诊断结论 | `analysis_run` 等四表 | 已实现：`services/analysisEngine.ts`（规则分派假设生成、参考快照、分层证据），`rule_based`，未接大模型 |
| 8D 报告 | `eight_d_report` 等三表 | 已实现：`services/reportService.ts`（预填 / 草稿 / 定稿校验 / 版本记录），页面 UI 并行开发 |
| 归档与通知 | `analysis_archive*`、`notification*` | 已实现：`services/archiveService.ts`（冻结归档、通知落库 + 可选 SMTP 外发）；页面未落地 |
| 规则与系统管理 | `alert_rule` / `data_source` / `sys_user` / `operation_log` | 已实现：`services/ruleAdminService.ts`、`services/systemService.ts`；页面未落地 |
| 主数据 CRUD | 7 类主数据表 | 已实现：`masterdata/resources.ts` + `masterdata/service.ts` + 两个通用路由 |
| 部署自检与冒烟 | — | 已实现：`db:check`、`db:smoke`（17 项不变量）、`smoke`（端到端）、`db:admin`（账号维护） |
| 管理员引导 | `server/bootstrap/admin.ts` | 已实现 |
| 启动检查 / 优雅退出 / 请求日志 | `server/*` | 已实现；优雅退出会先停规则调度 |
| 登录、改密、登出、会话 | `src/lib/auth/*` | 已实现 |
| 审计写入 | `src/lib/audit.ts` | 已实现；认证流程、主数据、规则扫描、诊断、报告、归档、通知、系统管理均在调用 |
| 事务封装 | `src/lib/db.ts` 的 `withTransaction` | 已实现，诊断 / 报告 / 归档 / 系统管理等多表写入已使用 |
| 格式化与缺失语义 | `src/lib/format.ts` | 已实现 |
| Excel 导入 | `import_job` 表 | 接口在仓库中并行开发，页面未落地 |
| Lint | — | `package.json` 已无 `lint` 脚本；`typecheck` 是唯一静态检查入口 |

新增功能时请同时更新本表与 `README.md` 的「功能模块清单」实现状态，保持文档与代码一致。
