/**
 * 系统设置读取辅助
 *
 * system_config 是一张 key-value 表，值统一以字符串存储，
 * 调用方自行按 'true' / 数字 解析。
 */
import { queryOne } from '@/storage/database/mysql-client';

/** 读取单个配置项，不存在或查询失败时返回 null */
export async function getConfigValue(key: string): Promise<string | null> {
  try {
    const row = await queryOne<{ value: string }>(
      'SELECT value FROM system_config WHERE `key` = $1',
      [key]
    );
    return row?.value ?? null;
  } catch (error) {
    console.error('[SystemConfig] 读取失败:', key, error);
    return null;
  }
}

/** 读取布尔型配置 */
export async function getConfigFlag(key: string, defaultValue = false): Promise<boolean> {
  const value = await getConfigValue(key);
  if (value === null) return defaultValue;
  return value === 'true';
}

/** 读取数字型配置 */
export async function getConfigNumber(key: string, defaultValue: number): Promise<number> {
  const value = await getConfigValue(key);
  if (value === null) return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

/** 写入 / 更新配置项 */
export async function setConfigValue(
  key: string,
  value: string,
  description?: string
): Promise<void> {
  const { query } = await import('@/storage/database/mysql-client');
  await query(
    `INSERT INTO system_config (\`key\`, value, description, created_at, updated_at)
     VALUES ($1, $2, $3, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       value = VALUES(value),
       description = COALESCE(VALUES(description), system_config.description),
       updated_at = NOW()`,
    [key, value, description ?? null]
  );
}
