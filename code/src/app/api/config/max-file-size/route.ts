import { NextResponse } from 'next/server';
import { getConfigNumber } from '@/lib/system-config';

/** 供上传组件读取当前的大小限制（MB） */
export async function GET() {
  try {
    const envLimit = Number(process.env.MAX_FILE_SIZE || 500);
    const maxSize = await getConfigNumber('max_file_size', envLimit);
    return NextResponse.json({ maxSize });
  } catch (error) {
    console.error('[Config] max file size error:', error);
    return NextResponse.json({ maxSize: Number(process.env.MAX_FILE_SIZE || 500) });
  }
}
