/**
 * 运行时配置。
 *
 * 所有可部署参数都集中在这里解析一次，业务代码只引用 `config`，
 * 不再散落 `process.env.XXX`。这样做的原因：
 *   1) 部署时要能一眼看出有哪些必填项；
 *   2) 类型安全，避免 `undefined` 在深处才炸；
 *   3) 便于测试时注入。
 *
 * 注意：本文件只做「读取 + 校验」，不在导入阶段主动抛错，
 * 否则 `next build` 在没有数据库的环境中会直接失败。
 * 需要强校验的地方显式调用 `assertDatabaseConfig()` / `assertAuthConfig()`。
 */
import process from 'node:process';
import { loadEnv } from './env';

// 关键：在读取 process.env 之前先加载 .env*。
// 脚本（迁移/校验/冒烟）通过 import 使用本模块，而 import 会被提升到
// 脚本自身的 loadEnv() 调用之前；把加载放在这里，才能保证两者都拿得到配置。
loadEnv();

function readString(key: string, fallback = ''): string {
  const value = process.env[key];
  return value === undefined || value === null ? fallback : String(value).trim();
}

function readNumber(key: string, fallback: number): number {
  const raw = readString(key);
  // 空字符串必须走 fallback：Number('') === 0，会让「未配置」变成静默的 0
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function readBoolean(key: string, fallback: boolean): boolean {
  const value = readString(key).toLowerCase();
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value);
}

const nodeEnv = readString('NODE_ENV', 'development');
const isProduction = nodeEnv === 'production';

export const config = {
  nodeEnv,
  isProduction,
  isDevelopment: nodeEnv === 'development',

  /** HTTP 服务监听参数（自定义 Server 使用） */
  server: {
    host: readString('HOST', isProduction ? '0.0.0.0' : '127.0.0.1'),
    port: readNumber('PORT', 3000),
    /** 对外可访问地址，用于日志、邮件正文与导出链接 */
    appUrl: readString('APP_URL', `http://127.0.0.1:${readNumber('PORT', 3000)}`),
    /** 优雅退出等待时间（毫秒） */
    shutdownTimeoutMs: readNumber('SHUTDOWN_TIMEOUT_MS', 10_000),
  },

  db: {
    host: readString('DB_HOST', '127.0.0.1'),
    port: readNumber('DB_PORT', 3306),
    database: readString('DB_NAME', 'ppr_quality'),
    user: readString('DB_USER', 'ppr_app'),
    password: readString('DB_PASSWORD'),
    /** 迁移专用账号；留空则使用应用账号（要求 DBA 已授权 DDL） */
    migrationUser: readString('DB_MIGRATION_USER'),
    migrationPassword: readString('DB_MIGRATION_PASSWORD'),
    connectionLimit: readNumber('DB_CONNECTION_LIMIT', 10),
    /** 现场时区，写入与展示保持一致，不做 UTC 隐式转换 */
    timezone: readString('DB_TIMEZONE', '+08:00'),
    ssl: readBoolean('DB_SSL', false),
    /** 慢查询/长事务观测阈值（毫秒），超过则在日志中告警 */
    slowQueryMs: readNumber('DB_SLOW_QUERY_MS', 1_000),
  },

  auth: {
    secret: readString('AUTH_SECRET'),
    sessionTtlHours: readNumber('SESSION_TTL_HOURS', 12),
    cookieName: readString('SESSION_COOKIE_NAME', 'ppr_session'),
    /** 首次部署时用于创建管理员账号；创建成功后应从环境中移除 */
    bootstrapAdminUsername: readString('BOOTSTRAP_ADMIN_USERNAME', 'admin'),
    bootstrapAdminPassword: readString('BOOTSTRAP_ADMIN_PASSWORD'),
    bootstrapAdminName: readString('BOOTSTRAP_ADMIN_NAME', '系统管理员'),
    /** bcrypt 代价因子 */
    bcryptRounds: readNumber('BCRYPT_ROUNDS', 10),
  },

  /** 预警规则引擎：按计划扫描新抽检记录并生成事件 */
  ruleEngine: {
    /** 应用启动后是否自动开启定时扫描 */
    schedulerEnabled: readBoolean('ENABLE_RULE_SCHEDULER', true),
    scanIntervalSeconds: readNumber('RULE_SCAN_INTERVAL_SECONDS', 300),
    lookbackHours: readNumber('RULE_SCAN_LOOKBACK_HOURS', 72),
    /** 单次扫描最多处理的抽检记录数，避免启动时长时间占用连接 */
    batchSize: readNumber('RULE_SCAN_BATCH_SIZE', 500),
  },

  notify: {
    /** db = 只落库；smtp = 落库并尝试投递 */
    transport: readString('NOTIFY_TRANSPORT', 'db') as 'db' | 'smtp',
    smtp: {
      host: readString('SMTP_HOST'),
      port: readNumber('SMTP_PORT', 465),
      secure: readBoolean('SMTP_SECURE', true),
      user: readString('SMTP_USER'),
      password: readString('SMTP_PASSWORD'),
      from: readString('SMTP_FROM'),
    },
  },

  upload: {
    maxMb: readNumber('MAX_UPLOAD_MB', 20),
  },

  /** 可观测性：请求日志开关与级别 */
  logging: {
    level: readString('LOG_LEVEL', isProduction ? 'info' : 'debug') as
      | 'debug'
      | 'info'
      | 'warn'
      | 'error',
    /** 是否记录每个 HTTP 请求（开发默认开，生产默认关，避免噪声） */
    requestLog: readBoolean('LOG_REQUESTS', !isProduction),
  },
} as const;

export type AppConfig = typeof config;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** 数据库配置必须在真正连库前校验 */
export function assertDatabaseConfig(): void {
  const missing: string[] = [];
  if (!config.db.host) missing.push('DB_HOST');
  if (!config.db.user) missing.push('DB_USER');
  if (!config.db.password) missing.push('DB_PASSWORD');
  if (!config.db.database) missing.push('DB_NAME');
  if (missing.length) {
    throw new ConfigError(
      `数据库配置缺失：${missing.join('、')}。请复制 .env.example 为 .env.local 并填写后重试。`,
    );
  }
}

/** 会话密钥必须有足够熵；生产环境额外要求长度 */
export function assertAuthConfig(): void {
  if (!config.auth.secret) {
    throw new ConfigError('AUTH_SECRET 未配置。请生成一段随机字符串写入环境变量。');
  }
  if (config.isProduction && config.auth.secret.length < 32) {
    throw new ConfigError(
      `AUTH_SECRET 长度为 ${config.auth.secret.length}，生产环境要求至少 32 个字符。`,
    );
  }
}
