import { NextResponse } from 'next/server';
import { getConfigValue } from '@/lib/system-config';

/** 注册开关状态，供登录页 / 注册页决定是否展示注册入口 */
export async function GET() {
  try {
    const value = await getConfigValue('enable_register');
    return NextResponse.json({ enabled: value === 'true' });
  } catch (error) {
    console.error('[Auth] register status error:', error);
    // 读取失败时按关闭处理，避免绕过配置
    return NextResponse.json({ enabled: false });
  }
}
