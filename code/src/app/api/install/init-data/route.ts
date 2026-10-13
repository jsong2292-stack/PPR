import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { checkDatabaseConnection } from '@/storage/database/db';
import { queryOne, query } from '@/storage/database/mysql-client';
import { hashPassword, validateUsername } from '@/lib/auth';

/**
 * 初始化基础数据并创建管理员账号
 * Body: { adminConfig: { username, password, nickname } }
 */
export async function POST(request: NextRequest) {
  try {
    const { adminConfig } = await request.json();
    const { username, password, nickname } = adminConfig || {};

    if (!username || !password || !nickname) {
      return NextResponse.json({ success: false, error: '请填写完整的管理员信息' });
    }
    if (!validateUsername(username)) {
      return NextResponse.json({
        success: false,
        error: '用户名需为 3-20 位字母、数字或下划线',
      });
    }
    if (password.length < 6) {
      return NextResponse.json({ success: false, error: '密码至少需要 6 个字符' });
    }

    const dbStatus = await checkDatabaseConnection();
    if (!dbStatus.available) {
      return NextResponse.json({
        success: false,
        needsConfig: true,
        error: dbStatus.error || '数据库连接失败',
      });
    }

    const logs: string[] = [];

    // 1. 补齐默认系统配置（已存在的键不会被覆盖）
    logs.push('开始初始化系统配置...');
    const DEFAULT_CONFIG: [string, string, string][] = [
      ['enable_register', 'true', '是否开放用户注册（true/false）'],
      ['enable_file_upload', 'true', '是否开放文件上传（true/false）'],
      ['enable_file_preview', 'true', '是否启用文件在线预览（true/false）'],
      ['max_file_size', '500', '文件上传大小上限（MB）'],
      ['enable_sso_auto_login', 'false', '未登录时是否自动跳转单点登录（true/false）'],
    ];

    for (const [key, value, description] of DEFAULT_CONFIG) {
      await query(
        `INSERT INTO system_config (\`key\`, value, description, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         ON DUPLICATE KEY UPDATE \`key\` = \`key\``,
        [key, value, description]
      );
    }
    logs.push('✅ 系统配置初始化完成');

    // 2. 创建管理员账号
    logs.push('开始创建管理员账号...');
    const existingAdmin = await queryOne<{ id: string }>(
      "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
    );

    if (existingAdmin) {
      logs.push('⚠️ 管理员账号已存在，跳过创建');
    } else {
      const existingUser = await queryOne<{ id: string }>('SELECT id FROM users WHERE phone = $1', [
        username,
      ]);
      if (existingUser) {
        return NextResponse.json({ success: false, error: '该用户名已被使用', logs });
      }

      const hashedPassword = await hashPassword(password);
      const newUserId = randomUUID();
      await query(
        `INSERT INTO users (id, phone, nickname, password, role, status, auth_provider)
         VALUES ($1, $2, $3, $4, 'admin', 'active', 'local')`,
        [newUserId, username, nickname, hashedPassword]
      );

      logs.push(`✅ 管理员账号创建成功: ${nickname}`);
    }

    logs.push('', '========================================', '🎉 安装完成！', `管理员账号: ${username}`, '========================================');

    return NextResponse.json({ success: true, message: '初始化完成', logs });
  } catch (error) {
    console.error('[Install] init-data error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '初始化数据失败',
    });
  }
}
