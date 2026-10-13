import { NextRequest, NextResponse } from 'next/server';
import { generateMinioPresignedUrl, isSafeObjectKey } from '@/lib/file-storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function redirectToMinio(
  { params }: { params: Promise<{ key: string[] }> },
  method: 'get' | 'head'
) {
  try {
    const { key: keyParts } = await params;
    const key = keyParts.join('/');

    if (!isSafeObjectKey(key)) {
      return NextResponse.json({ error: '无效的对象存储 key' }, { status: 400 });
    }

    const signedUrl = await generateMinioPresignedUrl(key, method);
    return NextResponse.redirect(signedUrl, {
      status: 307,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('[MinIO] generate download URL error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '文件访问失败' },
      { status: 500 }
    );
  }
}

/**
 * 私有 MinIO 桶访问代理：每次请求动态生成短期预签名 URL。
 * 浏览器跟随 307 后由 MinIO 直接提供文件及 Range 请求能力。
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ key: string[] }> }
) {
  return redirectToMinio(context, 'get');
}

export async function HEAD(
  _request: NextRequest,
  context: { params: Promise<{ key: string[] }> }
) {
  return redirectToMinio(context, 'head');
}
