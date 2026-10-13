import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth';

/** 退出登录：清除 session cookie */
export async function POST() {
  try {
    const response = NextResponse.json({ success: true });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    console.error('[Auth] logout error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
