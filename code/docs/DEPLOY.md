# 部署指南

本文面向负责部署与运维 PPR 质量智能分析助手的工程师，覆盖环境要求、环境变量、数据库准备、迁移上线、健康检查、反向代理、优雅退出、进程守护、备份回滚、安全清单与故障排查。

命令均以项目根目录（`PPR/code`）为工作目录。若使用 Docker / systemd，请把示例中的路径与用户替换为实际值。

---

## 1. 架构与部署形态（先读）

- 应用是**有状态服务**：所有业务数据在 MySQL `ppr_quality`，Node 进程本身不保存业务数据。因此可以水平扩展多实例，但需要注意第 11 节的限制。
- 运行命令是 `pnpm start` → `cross-env NODE_ENV=production tsx server/main.ts`，**不是 `next start`**。`server/main.ts` 在启动时做配置校验与数据库连通性检查，失败即以非零码退出。
- `tsx` 与 `cross-env` 属于 `devDependencies`。**不要用 `pnpm install --prod` / `--prod=true`**，否则 `pnpm start` 会因找不到 tsx 而失败。安装必须保留 devDependencies（`pnpm install --frozen-lockfile` 默认行为）。
- 多实例部署前请阅读第 11 节「已知限制」。

---

## 2. 环境要求与版本约束

### 2.1 最低要求

| 组件 | 要求 | 依据 |
| --- | --- | --- |
| Node.js | 20.9.0 ≤ 版本 < 25，或更严格地只允许 20.x / 24.x | `package.json` 的 `engines.node`；`scripts/check-toolchain.mjs` 显式只放行 20 与 24 |
| 部署运行时声明 | `nodejs-24` | `runtime.txt` |
| pnpm | ≥ 9；本项目锁定 `pnpm@12.5.1` | `package.json` 的 `engines.pnpm` 与 `packageManager`；`scripts/check-toolchain.mjs` 拦截 < 9 与 npm / yarn |
| MySQL | 8.0.16 及以上 | 使用 JSON 列、生成列与 `utf8mb4_0900_ai_ci` 排序规则，不声明 5.7 兼容 |
| 磁盘 | 视数据量而定，至少为 Node 依赖与 `.next` 产物预留 1 GB 以上 | `pnpm install` + `next build` |
| 内存 | 建议 ≥ 2 GB（`next build` 阶段占用较高） | 构建与运行共用同一主机时 |

推荐与部署声明保持一致：

```bash
nvm install 24 && nvm use 24
node -v            # v24.x
corepack enable    # 按 package.json 的 packageManager 启用 pnpm 12.5.1
pnpm -v            # 12.5.1（或其它 >= 9 的版本）
```

### 2.2 约束的强制方式（三处，缺一不可）

1. **`package.json` 的 `engines` 与 `packageManager`**：`node >=20.9.0 <25`、`pnpm >=9`，并锁定 `packageManager: pnpm@12.5.1`。
2. **`.npmrc`**：
   - `engine-strict=true`：pnpm 在 `engines` 不满足时直接失败；
   - `package-manager-strict=true`：强制使用 `package.json` 中 `packageManager` 声明的 pnpm（即 `12.5.1`）；
   - `strict-peer-dependencies=false`、`auto-install-peers=true`：避免对等依赖阻塞安装；
   - `dangerously-allow-all-builds=false`、`verify-deps-before-run=false`：本项目不需要依赖编译原生扩展，因此关闭构建脚本校验，避免 pnpm 因「Ignored build scripts」报错退出。
3. **`scripts/check-toolchain.mjs`**（挂 `preinstall` / `postinstall`）：Node 主版本只允许 20 / 24；检测到 npm / yarn 直接失败。特殊场景可 `SKIP_TOOLCHAIN_CHECK=1`（字面量 `1`）跳过。

### 2.3 依赖构建脚本白名单

`pnpm-workspace.yaml` 显式声明了依赖构建脚本的处理方式，本项目为二者都关闭：

```yaml
allowBuilds:
  esbuild: false
  sharp: false
```

- `esbuild`：`tsx` 的打包器依赖，而 `tsx` 自带预编译二进制，`esbuild` 的 postinstall 只是校验 / 下载平台二进制，跳过不影响运行，同时减少构建期的网络依赖。
- `sharp`：只被 `next/image` 需要；`next.config.mjs` 设了 `images.unoptimized: true`，不走图片优化管线。

若要在本地为 `next/image` 开启图片优化，把 `sharp` 改为 `true` 并重新安装依赖。

`runtime.txt` 中的 `nodejs-24` 是**部署平台的运行时声明**，不是 Docker 镜像标签。使用 Docker 时请选 `node:24-*` 系列基础镜像，并保留 `runtime.txt` 以便平台读取。

---

## 3. 环境变量

复制样例并按第 2 行注释的说明填写：

```bash
cp .env.example .env.production
chmod 600 .env.production
```

Next 与自定义 Server 通过 `src/lib/env.ts`（基于 `@next/env`）加载，顺序为 `.env` < `.env.local` < `.env.${NODE_ENV}` < `.env.${NODE_ENV}.local`，**已存在的真实环境变量优先级最高**。容器与 CI 建议直接用环境变量注入，不落盘配置文件。

### 3.1 必填项

| 变量 | 说明 |
| --- | --- |
| `DB_HOST` | MySQL 主机 |
| `DB_NAME` | 数据库名，应为 `ppr_quality` |
| `DB_USER` | 应用账号，只有 DML 权限（`ppr_app`） |
| `DB_PASSWORD` | 应用账号口令 |
| `AUTH_SECRET` | JWT 签名密钥，**生产环境必须 ≥ 32 字符**，否则 `assertAuthConfig()` 在启动时抛错 |

口令与密钥一律不得使用 `.env.example` 中的 `change-me` 占位值，也不得使用可猜测的弱口令。生成方式：

```bash
# AUTH_SECRET：48 字节随机数的 base64url 编码
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
# 数据库口令：24 位大小写字母 + 数字随机串
node -e "const a='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';const b=require('crypto').randomBytes(24);console.log(Array.from(b,x=>a[x%a.length]).join(''))"
```

### 3.2 完整清单

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `NODE_ENV` | 建议必填 | `development` | 生产必须为 `production`，否则 Cookie 不启用 `secure`、日志为开发格式 |
| `HOST` | 选填 | 生产 `0.0.0.0` | 监听地址；反向代理场景保持 `0.0.0.0` 并仅在内网暴露 |
| `PORT` | 选填 | `3000` | 监听端口 |
| `APP_URL` | 建议必填 | `http://127.0.0.1:${PORT}` | 对外访问地址，用于日志、邮件正文与导出链接，必须与反向代理的对外域名一致 |
| `SHUTDOWN_TIMEOUT_MS` | 选填 | `10000` | 优雅退出等待上限（毫秒），见第 8 节 |
| `DB_PORT` | 选填 | `3306` | MySQL 端口 |
| `DB_MIGRATION_USER` | 迁移必填 | 空 | 迁移账号 `ppr_migrator`；留空则回退用应用账号（要求该账号有 DDL 权限，不推荐） |
| `DB_MIGRATION_PASSWORD` | 迁移必填 | 空 | 迁移账号口令 |
| `DB_CONNECTION_LIMIT` | 选填 | `10` | 连接池上限。多实例部署时总连接数 = 实例数 × 该值，需小于 MySQL `max_connections` |
| `DB_TIMEZONE` | 选填 | `+08:00` | 现场时区。连接池在**每条连接建立时**执行 `SET time_zone = '<该值>'`，与驱动的时区解析保持一致，避免 DATETIME 偏移。详见第 4.5 节 |
| `DB_SSL` | 选填 | `false` | 跨网段 / 云数据库建议开启。代码使用 `rejectUnauthorized: false`，如需严格校验请自行扩展 |
| `DB_SLOW_QUERY_MS` | 选填 | `1000` | HTTP 慢请求告警阈值（毫秒） |
| `SESSION_TTL_HOURS` | 选填 | `12` | 会话有效期 |
| `SESSION_COOKIE_NAME` | 选填 | `ppr_session` | 会话 Cookie 名 |
| `BCRYPT_ROUNDS` | 选填 | `10` | bcrypt 代价因子，调高会显著增加登录耗时 |
| `BOOTSTRAP_ADMIN_USERNAME` | 首次部署填 | `admin` | 引导管理员账号名 |
| `BOOTSTRAP_ADMIN_PASSWORD` | 首次部署填 | 空 | 见第 6 节，**上线后必须移除** |
| `BOOTSTRAP_ADMIN_NAME` | 选填 | `系统管理员` | 引导管理员显示名 |
| `ENABLE_RULE_SCHEDULER` | 选填 | `true` | 规则扫描开关：启动时注册定时扫描，优雅退出时停止；多实例部署时可只让部分实例开启 |
| `RULE_SCAN_INTERVAL_SECONDS` | 选填 | `300` | 规则扫描间隔（秒） |
| `RULE_SCAN_LOOKBACK_HOURS` | 选填 | `72` | 规则扫描回溯窗口（小时） |
| `RULE_SCAN_BATCH_SIZE` | 选填 | `500` | 单次扫描最大处理记录数 |
| `NOTIFY_TRANSPORT` | 选填 | `db` | `db` 只落库：通知状态记为 `cancelled`，`error_message` 写明「未配置 SMTP，可人工外发」；`smtp` 落库后尝试投递（需额外安装 `nodemailer`，见下） |
| `SMTP_HOST` `SMTP_PORT` `SMTP_SECURE` `SMTP_USER` `SMTP_PASSWORD` `SMTP_FROM` | 选填 | `465` / `true` / 空 | 仅 `NOTIFY_TRANSPORT=smtp` 时使用 |
| `MAX_UPLOAD_MB` | 选填 | `20` | 上传大小上限（MB），需与反向代理的 `client_max_body_size` 保持一致 |
| `LOG_LEVEL` | 选填 | 生产 `info` | `debug` / `info` / `warn` / `error` |
| `LOG_REQUESTS` | 选填 | 生产关 | 生产建议保持关闭或仅在排障时临时开启 |
| `SKIP_DB_STARTUP_CHECK` | 选填 | 无 | 仅当值为字面量 `1` 时跳过启动连通性检查，仅用于无库的静态构建校验；生产不得开启。`.env.example` 中的 `false` 不会触发跳过 |
| `SKIP_TOOLCHAIN_CHECK` | 选填 | 无 | 仅当值为字面量 `1` 时跳过工具链检查，仅用于 CI 特殊场景。`.env.example` 中的 `0` 不会触发跳过 |

`.env.example` 已覆盖本节全部变量（含 `SHUTDOWN_TIMEOUT_MS`、`DB_SLOW_QUERY_MS`、`SESSION_COOKIE_NAME`、`BCRYPT_ROUNDS`、`RULE_SCAN_BATCH_SIZE`、`LOG_LEVEL`、`LOG_REQUESTS`、`SKIP_DB_STARTUP_CHECK`、`SKIP_TOOLCHAIN_CHECK`），并把 `change-me` 标注为必须替换。

**关于邮件外发**：`SMTP_*` 只提供连接参数，投递实现依赖 `nodemailer`，而它**不在 `package.json` 的依赖中**。代码用动态 `import()` 按需加载，未安装时不影响服务启动与构建，只在真正投递时报错「未安装 nodemailer」。需要真实外发时：

```bash
pnpm add nodemailer
```

并把 `nodemailer` 纳入部署产物（`pnpm install` 后重新构建 / 打包镜像）。仅落库（默认）不需要安装。

---

## 4. 数据库准备（DBA 执行）

应用账号**不得**拥有 DDL 权限，也**不得**使用 root 运行应用。请由 DBA 执行以下最小权限脚本。

### 4.1 建库

```sql
CREATE DATABASE IF NOT EXISTS `ppr_quality`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;
```

### 4.2 建账号与授权（最小权限）

请把 `%` 替换为应用服务器实际网段（例如 `10.20.30.%`），不要长期保留全通配。

```sql
-- 应用账号：只有 DML 权限
CREATE USER 'ppr_app'@'10.20.30.%' IDENTIFIED BY '<应用账号强口令>';
GRANT SELECT, INSERT, UPDATE, DELETE ON `ppr_quality`.* TO 'ppr_app'@'10.20.30.%';

-- 迁移账号：该库 DDL 权限（迁移 0001 含 DROP TABLE，需要 DROP）
CREATE USER 'ppr_migrator'@'10.20.30.%' IDENTIFIED BY '<迁移账号强口令>';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES
  ON `ppr_quality`.* TO 'ppr_migrator'@'10.20.30.%';

FLUSH PRIVILEGES;
```

只授予 `ppr_quality` 库内权限，两个账号都看不到同实例中的其他库。

### 4.3 验证权限隔离

```bash
# 应用账号应能查询，建表应被拒绝（ER_TABLEACCESS_DENIED_ERROR）
mysql -h <host> -u ppr_app -p ppr_quality -e "SELECT VERSION();"
mysql -h <host> -u ppr_app -p ppr_quality -e "CREATE TABLE t_probe(id INT);"   # 预期失败
```

连接认证插件：MySQL 8.4+ 已移除 `mysql_native_password`，账号使用 `caching_sha2_password`；Node 侧 `mysql2` 3.x 支持，无需额外配置。

### 4.4 字符集

命令行导入 SQL 时务必带 `--default-character-set=utf8mb4`，否则中文会显示为乱码（库内数据本身是正确的）：

```bash
mysql --default-character-set=utf8mb4 -h <host> -u ppr_migrator -p ppr_quality < db/schema.sql
```

应用侧由连接配置 `charset: 'utf8mb4'` 保证。

### 4.5 时区（重要）

MySQL 的 `DATETIME` 不带时区，`NOW()` / `CURRENT_TIMESTAMP` 取的是**会话时区**。如果数据库容器是 UTC 而现场是 `+08:00`：

- `created_at` / `updated_at` 会被写成 UTC 时间；
- 驱动按 `DB_TIMEZONE` 解释这些字符串；
- 结果就是读出来的时间少了 8 小时（典型现象：「刚新增的记录显示为 8 小时前」）。

应用已在连接池上对齐两边：**每条连接建立时执行 `SET time_zone = '<DB_TIMEZONE>'`**，并保留驱动的 `timezone` 参数。设置失败只记录 warn，不影响连接可用性。

部署要求：

1. `DB_TIMEZONE` 必须与现场一致（默认 `+08:00`），且**不要**在数据库侧另设一套不一致的全局时区；
2. 用应用账号手工核对会话时区：

   ```bash
   mysql -h <host> -u ppr_app -p -e "SELECT @@global.time_zone, @@session.time_zone, NOW();"
   ```

   应用连接内的会话时区应为 `DB_TIMEZONE` 的值；全局时区是 UTC 也不影响应用（应用会覆盖会话值）。
3. 排查「时间不对」时，先确认 `DB_TIMEZONE`，再对比数据库内的值与界面显示值，不要直接改数据。

---

## 5. 迁移与上线流程

### 5.1 标准流程

```bash
# 1) 安装依赖（保留 devDependencies，且不允许改动 lockfile）
pnpm install --frozen-lockfile

# 2) 查看迁移状态（可选，强烈建议）
pnpm db:migrate --status
pnpm db:migrate --dry-run      # 不连库，打印将要执行的迁移

# 3) 应用迁移（使用 DB_MIGRATION_USER）
pnpm db:migrate

# 4) 数据库自检与不变量检查（部署后第一道验证）
pnpm db:check
pnpm db:smoke

# 5) 构建
pnpm build

# 6) 启动
pnpm start

# 7) 服务起来后做端到端冒烟
pnpm smoke -- --base http://127.0.0.1:3000 --user admin --password '<口令>'
```

要点：

- 迁移必须**先于**应用新版本启动执行，否则新代码可能访问不存在的列。
- `pnpm db:migrate` 使用 `DB_MIGRATION_USER` / `DB_MIGRATION_PASSWORD`；这两个变量只需在迁移步骤可用，不必进入应用运行环境。
- 迁移台账 `schema_migration` 记录文件名与 sha256 前 16 位校验和。已应用文件被修改会报 `[校验失败]` 并以非零码退出。
- 迁移是逐语句顺序执行、非事务性的 DDL 流程：中途失败会停在出错语句，需要人工确认后重新执行（已成功的迁移会因台账存在而跳过，出错的那一个会从头重跑，因此新增迁移应尽量幂等）。
- `pnpm db:check` 是一次性自检：应用账号连通性、迁移记录、表 / 视图齐全性、基础数据是否就绪，并验证**应用账号执行 DDL 应被拒绝**。通过时打印「自检通过」。
- `pnpm db:smoke` 校验 17 项数据库不变量（事件去重键、窗口起点≤终点、正常风险不落事件、限值上下限、已确认结论必须有确认人与时间、8D 必须 D1–D8 齐全等），不经过 HTTP，部署完数据库即可运行。
- `pnpm smoke` 需要服务已在运行，默认打 `http://127.0.0.1:3000`；未提供口令时会如实报告「未提供口令」而不是失败退出。

### 5.2 CI 必跑项

由于 `next.config.mjs` 设了 `typescript.ignoreBuildErrors: true`，`pnpm build` **不会**因类型错误中断。因此 CI 中必须显式执行：

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
```

`package.json` 中已不再提供 `lint` 脚本（Next.js 16 移除了 `next lint`），`typecheck` 是本项目唯一的静态类型防线。

### 5.3 迁移文件不可修改

**已应用的迁移文件不可修改，只能新增。** 任何结构变更、数据校正都以新文件形式追加：

```bash
# 新增迁移，命名保持零填充序号前缀
touch db/migrations/0006_<描述>.sql
pnpm db:migrate --status
pnpm db:migrate
```

**迁移清单（按文件名顺序执行）**：

| 文件 | 内容 |
| --- | --- |
| `0001_schema.sql` | 42 表 + 4 视图的完整结构。含 `DROP TABLE`，仅用于从零建立结构 |
| `0002_seed.sql` | 初始数据：角色与用户、数据来源、主数据、批次、产品数据、设备采集、样管抽检、工艺记录、R1–R5 规则 |
| `0003_platform_baseline.sql` | 平台基础数据基线：补 `sys_user.session_version`、命名校正、产线组织、生产事件补齐、账号归属。语句幂等 |
| `0004_rule_wording.sql` | R1–R5 名称与说明校对及角色说明，不改任何阈值 |
| `0005_trend_params_and_samples.sql` | R4 补充 `maximum_window_hours`；写入一条不圆度超规格记录与一条 QMS/MES 差异待核对记录，使 R3 与 R1 开箱可核对。可重复执行 |
| `0006_rule_param_alignment.sql` | 使 R4 的 `maximum_window_hours` 生效并统一默认值为 24；清除 R1/R2/R3/R5 中未被任何规则读取的死键。可重复执行 |

`0001_schema.sql` 含 `DROP TABLE`，仅用于从零建立结构；已上线的库不要再执行它，也不要手工执行 `db/schema.sql`（它会 DROP 重建并清空业务数据）。

### 5.4 发布顺序建议

1. 备份数据库（见第 12 节）；
2. 停掉旧实例或先摘除流量（见第 8 节）；优雅退出会先停止规则引擎扫描再收尾；
3. `pnpm install --frozen-lockfile` → `pnpm db:migrate` → `pnpm db:check` → `pnpm build`；
4. 启动新实例，确认启动日志出现「数据库连接正常」与「服务已启动」；
5. 探测 `/api/health` 返回 200；
6. 执行 `pnpm smoke` 做端到端验证；
7. 恢复流量。

---

## 6. 首次部署的管理员账号引导

迁移不会写入任何明文或默认口令，但系统必须有一个可登录的管理员。引导逻辑在 `server/bootstrap/admin.ts`，由环境变量驱动，启动时执行。

### 6.1 方式一：配置引导口令（推荐用于自动化部署）

```bash
export BOOTSTRAP_ADMIN_USERNAME=admin
export BOOTSTRAP_ADMIN_PASSWORD='<一次性强口令>'
pnpm start
```

启动时该口令会以 bcrypt 哈希写入 `sys_user`（并把 `status` 置 `active`、`must_reset_password` 置 0）。

**上线后必须立即移除 `BOOTSTRAP_ADMIN_PASSWORD`**：只要该变量存在，每次启动都会用它的值覆盖管理员口令。生产环境启动时若检测到该变量仍存在，日志会打印明确告警：

```
检测到 BOOTSTRAP_ADMIN_PASSWORD 仍配置在生产环境中。管理员账号创建成功后请立即移除该变量。
```

移除后重启应用生效。

### 6.2 方式二：不配置，使用一次性随机口令

未设置 `BOOTSTRAP_ADMIN_PASSWORD` 且管理员 `password_hash` 为空时，启动会生成一次性随机口令（16 位，去掉易混字符），打印到**启动日志**，并置 `must_reset_password=1`：

```
已为管理员账号生成一次性口令，请立即登录并修改密码
  账号：admin
  口令：xxxxxxxxxxxxxxxx
  该口令只在本次启动日志中出现一次；修改密码后自动失效。
```

注意：

- 该口令只出现一次，请从日志中提取后立即登录并改密；
- 日志中不应长期留存该口令，提取后请按贵司日志留存要求处理；
- 若管理员已设置过口令，引导逻辑不做任何改动。

登录后请到 `/account/password` 修改密码。修改密码会递增 `session_version`，使包括本次在内的所有旧会话失效。

### 6.3 上线后的口令找回与账号维护

正式环境**不要**用「重新配置 `BOOTSTRAP_ADMIN_PASSWORD` 再重启」来找回口令——那会把口令留在环境变量里。改用账号维护脚本：

```bash
pnpm db:admin --list                                  # 列出全部账号与角色
pnpm db:admin --reset admin                           # 生成强随机口令并打印一次
pnpm db:admin --reset admin --password '<新口令>'      # 指定新口令
pnpm db:admin --disable <username>                    # 停用账号
pnpm db:admin --enable  <username>                    # 启用账号
pnpm db:admin --grant <username> <roleCode>           # 追加角色
```

脚本以迁移账号连库直接改密，并递增 `session_version`，使该账号所有已签发的会话立即失效（等价于强制下线）。重置口令属于敏感操作，脚本会在终端打印操作记录，请勿把口令写入工单或聊天记录。

---

## 7. 健康检查

`GET /api/health` 是**公开接口**（不要求登录），供编排系统探针使用。

健康时返回 HTTP 200：

```json
{
  "ok": true,
  "data": {
    "status": "ok",
    "database": {
      "connected": true,
      "version": "8.0.36",
      "database": "ppr_quality",
      "latencyMs": 3
    },
    "runtime": { "node": "v24.x.x", "env": "production", "uptimeSeconds": 128 },
    "time": "2026-10-12 10:20:30"
  }
}
```

数据库不可用时返回 **HTTP 503**，语义为「实例存活但依赖不可用，不应接收业务流量」：

```json
{
  "ok": true,
  "data": {
    "status": "degraded",
    "database": { "connected": false, "message": "<错误摘要>" },
    "runtime": { "node": "v24.x.x", "env": "production" }
  }
}
```

注意两点：

- 503 响应仍使用统一成功体 `{ ok: true, data }` 的外层结构，只有 HTTP 状态码表达失败；
- 接口只返回连通性、版本与运行时长，不返回任何业务数据或配置细节。

探针配置建议：

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/health
```

Kubernetes 探针应把 `httpGet.path` 设为 `/api/health`，并就绪探针 `failureThreshold` 设为 3 以上，避免数据库抖动时立刻摘除全部实例。

---

## 8. 反向代理（Nginx 示例）

必须透传 `X-Forwarded-For` 与 `X-Forwarded-Proto`（审计日志从 `x-forwarded-for` 取客户端 IP；Cookie 的 `secure` 属性依赖 HTTPS 访问），并为未来的实时推送预留 WebSocket / upgrade 透传。

```nginx
upstream ppr_app {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 443 ssl;
    server_name quality.example.com;

    ssl_certificate     /etc/nginx/certs/quality.crt;
    ssl_certificate_key /etc/nginx/certs/quality.key;

    # 与 MAX_UPLOAD_MB 保持一致（示例 20 MB），并留出 multipart 开销
    client_max_body_size 24m;

    location / {
        proxy_pass         http://ppr_app;
        proxy_http_version 1.1;

        # 真实来源信息（审计与日志依赖）
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket / HTTP upgrade 透传
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        # 超时：读超时应大于应用内慢请求阈值，避免长任务被代理先断开
        proxy_connect_timeout 10s;
        proxy_send_timeout    120s;
        proxy_read_timeout    120s;
        proxy_buffering       off;
    }

    # 健康检查：不记录访问日志，避免刷满
    location = /api/health {
        proxy_pass         http://ppr_app;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        access_log off;
    }
}

# 在 http {} 块中声明 upgrade 映射
# map $http_upgrade $connection_upgrade {
#     default upgrade;
#     ''      close;
# }
```

若只需要 HTTP 到 HTTPS 的跳转，另加一个 `listen 80` 的 server 块做 301。

要点：

- `proxy_set_header Connection $connection_upgrade;` 需要上面的 `map`，否则 WebSocket 升级失败；
- `APP_URL` 必须与 `server_name` / 对外地址一致；
- 静态资源（`/_next/static`、`/_next/image`、`/favicon.ico`）在应用内不记录请求日志，代理侧也可按需关闭。

---

## 9. 优雅退出与编排

### 9.1 行为

`server/shutdown.ts` 注册了 `SIGTERM` 与 `SIGINT`：

1. 收到信号后先停止规则引擎定时扫描（`stopRuleScheduler()`），避免关闭过程中还在扫描数据库；
2. 停止接收新请求；
3. 等待在途请求完成（`server.close()`）；
4. 关闭 Next 应用实例；
5. 关闭 MySQL 连接池；
6. 以退出码 0 退出；关闭过程出错则退出码 1。

重复信号只记录日志，不会重复执行关闭流程。`uncaughtException` 会记录完整信息并以非零码退出，交由编排系统重启。

### 9.2 时间预算

- 等待上限由 `SHUTDOWN_TIMEOUT_MS` 控制，**默认 10000 ms**。超时后连接池与在途连接会被强制结束。
- 编排系统（systemd / Docker / K8s）在发送 `SIGTERM` 后到 `SIGKILL` 之前，**至少给 10 秒**；建议给 **30 秒**，为关闭 Next 应用与连接池留出余量。
- 若把 `SHUTDOWN_TIMEOUT_MS` 调大，编排侧的宽限期必须同步调大，否则进程会在收尾前被 SIGKILL，连接池来不及正常关闭。

参考值：

| 配置项 | 建议值 |
| --- | --- |
| `SHUTDOWN_TIMEOUT_MS` | `10000`（默认） |
| Docker `docker stop --time` | `30` |
| systemd `TimeoutStopSec` | `30` |
| Kubernetes `terminationGracePeriodSeconds` | `30` |

---

## 10. 进程守护

### 10.1 systemd 单元示例

```ini
# /etc/systemd/system/ppr-quality.service
[Unit]
Description=PPR Quality Analysis Assistant
Documentation=file:/opt/ppr/code/docs/DEPLOY.md
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ppr
Group=ppr
WorkingDirectory=/opt/ppr/code

# 环境变量建议用独立文件（权限 0600、属主 ppr），不要写进单元文件
EnvironmentFile=/opt/ppr/code/.env.production
Environment=NODE_ENV=production

ExecStart=/usr/bin/pnpm start

# 优雅退出：SIGTERM 后至少等待 SHUTDOWN_TIMEOUT_MS，超时再 SIGKILL
KillSignal=SIGTERM
TimeoutStopSec=30
SendSIGKILL=yes

Restart=on-failure
RestartSec=5

# 进程加固
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/ppr/code/.next

StandardOutput=journal
StandardError=journal
SyslogIdentifier=ppr-quality

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ppr-quality
sudo systemctl status ppr-quality
sudo journalctl -u ppr-quality -f
```

`Path` 中的 pnpm 路径请用 `which pnpm` 的实际结果替换；若使用 nvm，`ExecStart` 需指向具体的 Node 版本路径，systemd 不加载用户的 nvm 配置。

### 10.2 Dockerfile 示例（多阶段、非 root）

`nodejs-24` 是部署平台的运行时声明（`runtime.txt`），**不是 Docker 镜像名**。Docker 场景选 Node 24 官方镜像，并把 `runtime.txt` 一并带入镜像。

```dockerfile
# ---------- 构建阶段 ----------
FROM node:24-bookworm-slim AS builder
WORKDIR /app

RUN corepack enable

# 先复制依赖清单，利用层缓存
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
# 注意：不要加 --prod，tsx / cross-env / typescript 是构建与运行都需要的
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ---------- 运行阶段 ----------
FROM node:24-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# 非 root 用户运行
RUN groupadd --system --gid 1001 ppr \
 && useradd  --system --uid 1001 --gid ppr --create-home ppr

# 自定义 Server 由 tsx 运行，需要完整 node_modules（含 devDependencies）
COPY --from=builder --chown=ppr:ppr /app/node_modules ./node_modules
COPY --from=builder --chown=ppr:ppr /app/.next        ./.next
COPY --from=builder --chown=ppr:ppr /app/src          ./src
COPY --from=builder --chown=ppr:ppr /app/server       ./server
COPY --from=builder --chown=ppr:ppr /app/scripts      ./scripts
COPY --from=builder --chown=ppr:ppr /app/db           ./db
COPY --from=builder --chown=ppr:ppr /app/public       ./public
COPY --from=builder --chown=ppr:ppr /app/package.json /app/tsconfig.json \
     /app/next.config.mjs /app/runtime.txt /app/.npmrc ./

USER ppr

EXPOSE 3000

# 健康检查：503 会被判定为不健康
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# 用 exec 形式，保证 SIGTERM 直达 Node 进程而不是经过 shell
CMD ["pnpm", "start"]
```

构建与运行：

```bash
docker build -t ppr-quality:1.0.0 .

docker run -d --name ppr-quality \
  --env-file .env.production \
  -e NODE_ENV=production \
  -p 127.0.0.1:3000:3000 \
  --stop-timeout 30 \
  ppr-quality:1.0.0
```

要点：

- 若项目中没有 `public/` 目录，请删除对应的 `COPY` 行，否则构建会失败（当前仓库未包含 `public/`）。
- 不要用 `CMD pnpm start` 的 shell 形式；必须用 exec 形式，否则 `SIGTERM` 发给 shell，容器会在宽限期后被 SIGKILL，跳过优雅退出。
- `--stop-timeout 30`（或 compose 的 `stop_grace_period: 30s`）需大于等于 `SHUTDOWN_TIMEOUT_MS`。
- 迁移不放在镜像启动脚本里自动执行，应由发布流程显式执行 `pnpm db:migrate`，避免多实例并发迁移。
- `next.config.mjs` 的 `output: 'standalone'` 可用于「只跑 `next start`」的兜底方案，但本服务用自定义 Server，运行阶段仍需完整 `node_modules`。

---

## 11. 已知限制（多实例部署前必读）

- **登录失败计数保存在进程内存**（连续 5 次失败锁定 10 分钟）。多实例部署时计数不共享，实际锁定效果按实例独立计算；如需全局锁定，需改为 Redis 或数据库计数。
- **规则引擎会在每个实例上各自扫描**：调度器不引入分布式锁，依赖 `alert_event` 的去重键 `(batch_id, rule_id, metric_id, window_start_time)` 与 `INSERT ... ON DUPLICATE KEY` 保证同一批次不重复告警，规则判定本身是幂等的。实例很多时可用 `ENABLE_RULE_SCHEDULER=false` 只让一台实例开启扫描。
- 会话是无状态 JWT，天然支持多实例；`sys_user.session_version` 的强制下线通过数据库生效，不需要共享存储。
- 连接池上限 `DB_CONNECTION_LIMIT` 默认 10，多实例时请按 `实例数 × 10 < MySQL max_connections` 规划。

---

## 12. 备份与回滚

### 12.1 备份

```bash
# 结构 + 数据全量备份
mysqldump -h <host> -u ppr_migrator -p \
  --default-character-set=utf8mb4 \
  --single-transaction --routines --triggers --events \
  --set-gtid-purged=OFF \
  ppr_quality > /backup/ppr_quality_$(date +%Y%m%d_%H%M%S).sql

# 结构 + 数据 + 存储过程/函数，压缩保存
mysqldump -h <host> -u ppr_migrator -p \
  --default-character-set=utf8mb4 --single-transaction --routines --triggers \
  ppr_quality | gzip > /backup/ppr_quality_$(date +%Y%m%d_%H%M%S).sql.gz

# 只备份结构（用于对比）
mysqldump -h <host> -u ppr_migrator -p --no-data ppr_quality > /backup/ppr_schema_only.sql

# 只备份迁移台账（排查结构漂移时很有用）
mysqldump -h <host> -u ppr_migrator -p --default-character-set=utf8mb4 \
  ppr_quality schema_migration > /backup/ppr_schema_migration.sql
```

- 备份账号需要有 `SELECT`、`LOCK TABLES`、`SHOW VIEW`、`TRIGGER` 等权限；`ppr_migrator` 的权限可能不足，必要时由 DBA 单独建备份账号。
- 恢复前请先验证备份文件可读，并记录备份时的 `schema_migration` 内容（它决定了当前结构版本）。
- 建议在**每次执行迁移之前**做一次全量备份。

### 12.2 回滚

迁移文件不可修改，因此**回滚靠新增迁移**，不用修改历史文件：

1. 应用层回滚：切回上一个镜像 / 上一个代码版本并重启。
2. 数据层回滚：写一个 `0006_rollback_xxx.sql`，把结构或数据恢复到目标形态（例如删除新增列、恢复被改写的字典行）。该文件同样写入 `schema_migration` 台账，保持可追溯。
3. 破坏性变更的回滚：若新迁移删除了列或表，仅靠反向迁移通常无法恢复数据，必须从迁移前的全量备份恢复：

```bash
mysql -h <host> -u ppr_migrator -p --default-character-set=utf8mb4 ppr_quality < /backup/ppr_quality_YYYYmmdd_HHMMSS.sql
```

4. 恢复后重新执行 `pnpm db:migrate --status`，确认台账与实际结构一致。

禁止的做法：直接编辑已应用的迁移文件、手工 `DELETE FROM schema_migration` 后重跑、或对已上线库执行 `db/schema.sql`（会 DROP 重建并清空数据）。

---

## 13. 安全清单

上线前逐项确认：

- [ ] `AUTH_SECRET` 为随机生成、长度 ≥ 32 字符，且每个环境独立；生产未使用示例值。
- [ ] `DB_PASSWORD`、`DB_MIGRATION_PASSWORD`、`BOOTSTRAP_ADMIN_PASSWORD` 均为强口令，未使用 `change-me`。
- [ ] `.env.production` / `.env.local` 权限为 `0600`，属主为应用用户；确认 `.gitignore` 已排除 `.env.*`（仅 `.env.example` 入库）。
- [ ] 生产环境为 HTTPS，`NODE_ENV=production`，会话 Cookie 因此带 `secure` 且 `httpOnly`、`sameSite=lax`。
- [ ] `BOOTSTRAP_ADMIN_PASSWORD` 在管理员账号创建成功后已从环境中移除，并重启应用。
- [ ] 应用账号 `ppr_app` 只有 DML 权限；已验证 `CREATE TABLE` 被拒绝；应用**不以 root 连接**数据库。
- [ ] 数据库账号主机名收窄到应用网段，而非 `%`。
- [ ] 跨网段访问数据库时开启 `DB_SSL=true`；如需严格校验证书，需扩展连接配置（当前为 `rejectUnauthorized: false`）。
- [ ] `MAX_UPLOAD_MB` 与 Nginx `client_max_body_size` 一致，避免绕过前端校验上传超大文件。
- [ ] 审计日志可用：所有写操作走 `writeAudit()` 写 `operation_log`（登录、主数据变更、规则扫描、结论确认、报告保存 / 定稿、归档、通知等）；确认应用账号对 `operation_log` 有 `INSERT` 权限。
- [ ] 部署后已运行 `pnpm db:check`（应打印「自检通过」，且应用账号执行 DDL 被拒绝）与 `pnpm db:smoke`（17 项不变量全部成立）。
- [ ] 服务启动后已用 `pnpm smoke -- --base <地址> --user admin --password '<口令>'` 跑通端到端链路。
- [ ] CI 已配置 `pnpm typecheck`：`next build` 因 `typescript.ignoreBuildErrors: true` 不会拦截类型错误。
- [ ] `DB_TIMEZONE` 与现场一致，且已核对应用连接内的会话时区（第 4.5 节）。
- [ ] 账号口令找回使用 `pnpm db:admin --reset`，而不是重新配置 `BOOTSTRAP_ADMIN_PASSWORD`。
- [ ] 账号锁定策略已知：连续登录失败 5 次锁定 10 分钟，计数为进程内存，多实例不共享（见第 11 节）。
- [ ] 首登强制改密链路可用：`must_reset_password=1` 的账号只能访问 `/account/password` 与改密接口。
- [ ] 已确认 `sys_role` 中不存在多余的 `admin` 账号；基线管理员 `admin` 的口令已按部署要求修改（初始口令来自 `BOOTSTRAP_ADMIN_PASSWORD`，须首登改密）。
- [ ] 阈值未标定的事实未被误用：`alert_rule.calibration_status` 为 `demo`，界面与报告必须显示「阈值待现场标定」，不得据此做合格判定。
- [ ] 通知默认 `NOTIFY_TRANSPORT=db`（只落库，状态为 `cancelled` 并写明原因，不真实投递）；如需投递，已 `pnpm add nodemailer` 并重新构建，且 SMTP 口令使用专用账号而非个人邮箱口令。
- [ ] 备份任务已配置并验证过恢复流程。
- [ ] 应用日志（JSON Lines）已接入采集，且确认未记录请求体（代码层面已保证）；启动日志中的一次性管理员口令按留存要求处理。
- [ ] 反向代理透传 `X-Forwarded-For` / `X-Forwarded-Proto`，审计日志中的客户端 IP 真实可用。

---

## 14. 常见故障排查

### 14.1 启动即失败：数据库连接失败

现象：进程启动即以非零码退出，日志出现

```
数据库连接失败：<原因>
请检查：1) MySQL 是否运行；2) .env.local 中 DB_* 是否正确；3) 是否已执行 pnpm db:migrate。
```

排查顺序：

1. MySQL 是否在运行、端口是否可达：`nc -vz <host> 3306`；
2. `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` 是否与实际一致（注意 `.env.production` 与真实环境变量的优先级：已存在的 `process.env` 值优先）；
3. 账号主机名是否匹配来源 IP（容器经 NAT 访问时源地址不是 `localhost`，`@'localhost'` 会认证失败，这就是 `setup:local` 用 `@'%'` 的原因）；
4. 库是否已建、迁移是否已执行：`pnpm db:migrate --status`；
5. 认证插件是否兼容：MySQL 8.4+ 为 `caching_sha2_password`，需 `mysql2` 3.x（本项目为 3.15.3）；
6. 仅需排查构建、无库环境时，可临时 `SKIP_DB_STARTUP_CHECK=1`，但生产不得开启。

### 14.2 端口被占用：EADDRINUSE

现象：

```
端口 3000 已被占用。请修改 PORT 环境变量或停止占用进程。
```

排查：

```bash
lsof -iTCP:3000 -sTCP:LISTEN -n -P
# 或
ss -ltnp | grep :3000
```

处理：改 `PORT`，或停掉占用进程（可能是上一次未退出的旧实例）。容器场景还需确认端口是否被其他容器或宿主机进程占用。

### 14.3 迁移校验和不一致

现象：

```
[校验失败] 0003_platform_baseline.sql：已应用的版本校验和 abcd1234... 与当前文件 efgh5678... 不一致。
已应用的迁移不可修改；如需变更请新增迁移文件。
```

原因：已应用的迁移文件被修改（换行符、编码、注释变更都会改变 sha256）。

处理：

1. **不要**修改台账去迁就文件。先确认该文件是否被误改：`git diff db/migrations/`；
2. 若确实是误改，把文件恢复到与台账一致的内容（例如 `git checkout -- db/migrations/<file>`），再执行 `pnpm db:migrate`；
3. 若变更是有意为之，撤销对旧文件的修改，把变更写成**新迁移文件**；
4. 若结构已经与文件一致但台账不匹配（例如从备份恢复过数据），与 DBA 一起核对实际结构后决定：或恢复旧文件内容，或用正确的校验和更新台账（需人工评审，不要脚本批量改）。

### 14.4 中文乱码

现象：命令行查询或导入后中文显示为 `???` 或乱码。

原因与处理：

- 命令行导入 / 查询未指定字符集。务必带 `--default-character-set=utf8mb4`：

  ```bash
  mysql --default-character-set=utf8mb4 -h <host> -u ppr_app -p ppr_quality -e "SELECT name FROM product_spec LIMIT 5;"
  ```

- 客户端终端本身不是 UTF-8。确认 `locale` 输出包含 `UTF-8`。
- 连接级字符集：应用侧由 `charset: 'utf8mb4'` 保证，无需额外配置；脚本侧同样由 `scripts/lib/db-utils.ts` 指定。
- 库内数据本身通常是正确的，乱码一般只发生在终端展示层。**不要**用 `UPDATE` 去「修复」数据，先确认是展示问题还是写入问题。

### 14.5 /api/health 返回 503

含义：进程存活，但数据库不可用。按 14.1 的顺序排查数据库侧。注意 503 响应体仍是 `{ ok: true, data: { status: "degraded", ... } }`，只有 HTTP 状态码为 503。

### 14.6 `pnpm install` 失败

- `Unsupported engine`：Node 主版本不在 20 / 24，或 pnpm 低于 9。切换版本后重试；确需绕过时用 `SKIP_TOOLCHAIN_CHECK=1`（仅限 CI 特殊场景）。
- 提示只允许 pnpm：使用了 npm 或 yarn。改用 `corepack enable && pnpm install`，并删除 npm / yarn 生成的 lock 文件。
- 与 `packageManager: pnpm@12.5.1` 相关的下载 / 版本错误：本机未启用 Corepack、或本地 pnpm 版本与 `packageManager` 不一致。执行 `corepack enable` 后重试，或安装 pnpm 12.5.1。
- 与 `pnpm-workspace.yaml` 中 `allowBuilds` 相关的提示：本项目已把 `esbuild` / `sharp` 显式设为 `false`（理由见第 2.3 节），若出现 `ERR_PNPM_IGNORED_BUILDS`，确认这两项配置没有被改动。

### 14.7 没有 lint 脚本

`package.json` 中**已不再提供 `lint` 脚本**（Next.js 16 移除了 `next lint`）。静态检查请使用：

```bash
pnpm typecheck
```

由于 `typescript.ignoreBuildErrors: true`，`pnpm build` 不校验类型，请把 `pnpm typecheck` 放进 CI。

### 14.8 时间字段少 8 小时 / 时间不对

现象：新建记录后立刻查询，`created_at` / `updated_at` 比实际时间早 8 小时（或按现场时区判断整体偏移）。

原因：MySQL 的 `DATETIME` 不带时区，`NOW()` / `CURRENT_TIMESTAMP` 取会话时区。若数据库全局时区是 UTC 而 `DB_TIMEZONE` 是 `+08:00`，写入与读取就会错位。

排查与处理：

1. 核对 `DB_TIMEZONE` 与现场一致；
2. 检查应用连接内的会话时区是否为该值：

   ```bash
   mysql -h <host> -u ppr_app -p -e "SELECT @@global.time_zone, @@session.time_zone, NOW();"
   ```

3. 应用启动日志若出现「设置数据库会话时区失败，时间字段可能存在偏移」，说明 `SET time_zone` 执行失败（常见于数据库未加载时区表）。此时 `DB_TIMEZONE` 应改用数值偏移写法（如 `+08:00` 而非 `Asia/Shanghai`）；
4. 已经写错的存量时间字段需要按业务确认后单独修正，不要批量 `UPDATE` 掩盖问题。

### 14.9 部署后数据库自检不通过

```bash
pnpm db:check     # 连通性 / 迁移记录 / 表视图齐全性 / 基础数据 / 应用账号 DDL 权限
pnpm db:smoke     # 17 项业务不变量
```

- `db:check` 报迁移未执行：先 `pnpm db:migrate --status`，再 `pnpm db:migrate`；
- `db:check` 报基础数据未就绪（规则、指标、规格、批次缺失）：规则引擎无事可做，需导入主数据或执行 `0002` / `0005` 迁移；
- `db:check` 报应用账号可以执行 DDL：说明授权过宽，按第 4.2 节收回 DDL 权限；
- `db:smoke` 报不变量被破坏：查看输出的检查名与样本行，按对应业务口径修正数据，不要跳过检查。

### 14.10 登录后立刻掉线 / 有权却看不到菜单

- 改密或管理员重置密码后，旧 Cookie 的 `session_version` 过期，会被要求重新登录，这是预期行为。
- 菜单由 `src/config/navigation.ts` 与角色权限共同决定：账号没有对应角色时，入口不渲染。请检查 `sys_user_role` 中的角色分配。
- 没有任何角色的账号会被重定向到 `/no-permission`。

### 14.11 接收 SIGTERM 后长时间不退出

- 检查 `SHUTDOWN_TIMEOUT_MS` 与编排宽限期是否匹配（第 9 节）；宽限期小于该值时进程会在收尾前被 SIGKILL。
- 关闭流程会先停止规则引擎定时扫描，再停止接收请求；若扫描批次很大，可调小 `RULE_SCAN_BATCH_SIZE`。
- 长连接（keep-alive）会延迟 `server.close()` 回调，应用已有超时兜底强制结束。如仍频繁出现，检查反向代理是否保持了大量空闲连接。
