import { NextRequest, NextResponse } from 'next/server';
import { query, queryAll } from '@/storage/database/mysql-client';
import { requireAdmin } from '@/lib/auth';
import { failFrom } from '@/lib/api';

/** 系统设置全部键值（对象形式），仅管理员可读 */
export async function GET() {
  try {
    await requireAdmin();
    const rows = await queryAll<{ key: string; value: string }>(
      'SELECT `key`, value FROM system_config'
    );

    const config: Record<string, string> = {};
    for (const row of rows) config[row.key] = row.value;

    return NextResponse.json(config);
  } catch (error) {
    return failFrom(error);
  }
}

/**
 * 批量更新系统设置（仅管理员）
 * Body: { key1: value1, key2: value2, ... }
 */
export async function PUT(request: NextRequest) {
  try {
    await requireAdmin();
    const body = (await request.json()) as Record<string, unknown>;

    const entries = Object.entries(body);
    if (entries.length === 0) {
      return NextResponse.json({ error: '没有需要更新的配置' }, { status: 400 });
    }

    for (const [key, value] of entries) {
      await query(
        `INSERT INTO system_config (\`key\`, value, updated_at)
         VALUES ($1, $2, NOW())
         ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW()`,
        [key, String(value)]
      );
    }

    return NextResponse.json({ success: true, message: '配置更新成功' });
  } catch (error) {
    return failFrom(error, '更新配置失败');
  }
}
