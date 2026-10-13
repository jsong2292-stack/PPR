import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, queryAll } from '@/storage/database/mysql-client';
import { getCurrentUser } from '@/lib/auth';

/**
 * 配置读取
 *   GET /api/config?key=xxx  → 单个配置（不存在时返回 value: null）
 *   GET /api/config          → 全部配置
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (key) {
      const data = await queryOne('SELECT * FROM system_config WHERE `key` = $1', [key]);
      return NextResponse.json(data || { key, value: null });
    }

    const data = await queryAll('SELECT * FROM system_config ORDER BY id');
    return NextResponse.json({ configs: data || [] });
  } catch (error) {
    console.error('[Config] get error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

/**
 * 更新单个配置（仅管理员）
 * Body: { key, value }
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: '无权限操作' }, { status: 403 });
    }

    const { key, value } = await request.json();
    if (!key || value === undefined || value === null) {
      return NextResponse.json({ error: '参数错误' }, { status: 400 });
    }

    await query(
      `INSERT INTO system_config (\`key\`, value, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW()`,
      [key, String(value)]
    );

    const data = await queryOne('SELECT * FROM system_config WHERE `key` = $1', [key]);

    return NextResponse.json({ success: true, config: data });
  } catch (error) {
    console.error('[Config] update error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
