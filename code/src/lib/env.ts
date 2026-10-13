/**
 * 环境变量校验与配置
 *
 * 在应用启动时（src/server.ts）调用 validateEnv()，
 * 缺少必需变量时在生产环境直接抛错，避免带病启动。
 */

/** 必需环境变量：缺失将导致核心功能不可用 */
const REQUIRED_ENV_VARS: string[] = ['JWT_SECRET'];

/** 建议配置的环境变量：缺失仅告警，不影响启动 */
const RECOMMENDED_ENV_VARS: string[] = ['MYSQL_URL（或 DATABASE_URL）'];

const isProd =
  process.env.NODE_ENV === 'production' || process.env.COZE_PROJECT_ENV === 'PROD';

/** 判断数据库连接是否已配置 */
export function hasDatabaseUrl(): boolean {
  return Boolean(
    process.env.MYSQL_URL ||
      process.env.DATABASE_URL ||
      (process.env.MYSQL_HOST && process.env.MYSQL_DATABASE)
  );
}

export function validateEnv(): void {
  const missing: string[] = [];

  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) missing.push(key);
  }
  if (missing.length > 0) {
    const msg = `缺失必要环境变量: ${missing.join(', ')}`;
    if (isProd) throw new Error(msg);
    console.warn(`[Env] ⚠ ${msg}（开发环境使用默认值兜底，请勿用于生产）`);
  }

  if (isProd) {
    const recommended: string[] = [];
    if (!hasDatabaseUrl()) recommended.push(RECOMMENDED_ENV_VARS[0]);
    if (recommended.length > 0) {
      console.warn(`[Env] ⚠ 未配置: ${recommended.join(', ')}，数据库相关功能将不可用`);
    }
  }
}

/** 读取布尔型环境变量 */
export function envFlag(key: string, defaultValue = false): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return defaultValue;
  return raw === 'true' || raw === '1';
}

/** 读取数字型环境变量 */
export function envNumber(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (!raw) return defaultValue;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}
