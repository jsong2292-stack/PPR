import { createReadStream, existsSync } from 'fs';
import { stat } from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { NextRequest, NextResponse } from 'next/server';
import { MIME_TYPES, getUploadDir, isSafeFileName } from '@/lib/upload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ByteRange {
  start: number;
  end: number;
}

/** 解析 HTTP Range 请求头（支持 bytes=a-b、bytes=a-、bytes=-n 三种写法） */
function parseByteRange(rangeHeader: string, fileSize: number): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || fileSize <= 0) return null;

  const [, startText, endText] = match;
  if (!startText && !endText) return null;

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return { start: Math.max(fileSize - suffixLength, 0), end: fileSize - 1 };
  }

  const start = Number(startText);
  const requestedEnd = endText ? Number(endText) : fileSize - 1;

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    requestedEnd < start ||
    start >= fileSize
  ) {
    return null;
  }

  return { start, end: Math.min(requestedEnd, fileSize - 1) };
}

/**
 * 读取上传目录中的文件。
 *
 * 通过 next.config.ts 的 rewrite，/uploads/:filename 会转发到这里，
 * 因此新上传的文件无需重新构建即可访问。
 * 支持 Range 请求，音视频可拖动进度条。
 */
async function serveFile(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
  headOnly = false
) {
  try {
    const { filename } = await params;

    if (!isSafeFileName(filename)) {
      return NextResponse.json({ error: '无效的文件名' }, { status: 400 });
    }

    const filePath = path.join(getUploadDir(), filename);

    if (!existsSync(filePath)) {
      return NextResponse.json({ error: '文件不存在' }, { status: 404 });
    }

    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      return NextResponse.json({ error: '文件不存在' }, { status: 404 });
    }

    const ext = path.extname(filename).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const rangeHeader = request.headers.get('range');

    const commonHeaders = {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Type': contentType,
      'Last-Modified': fileStat.mtime.toUTCString(),
    };

    if (rangeHeader) {
      const range = parseByteRange(rangeHeader, fileStat.size);
      if (!range) {
        return new NextResponse(null, {
          status: 416,
          headers: { ...commonHeaders, 'Content-Range': `bytes */${fileStat.size}` },
        });
      }

      const contentLength = range.end - range.start + 1;
      const body = headOnly
        ? null
        : (Readable.toWeb(createReadStream(filePath, range)) as ReadableStream);

      return new NextResponse(body, {
        status: 206,
        headers: {
          ...commonHeaders,
          'Content-Length': contentLength.toString(),
          'Content-Range': `bytes ${range.start}-${range.end}/${fileStat.size}`,
        },
      });
    }

    const body = headOnly ? null : (Readable.toWeb(createReadStream(filePath)) as ReadableStream);

    return new NextResponse(body, {
      headers: { ...commonHeaders, 'Content-Length': fileStat.size.toString() },
    });
  } catch (error) {
    console.error('[Uploads] serve error:', error);
    return NextResponse.json({ error: '读取文件失败' }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ filename: string }> }
) {
  return serveFile(request, context);
}

export async function HEAD(
  request: NextRequest,
  context: { params: Promise<{ filename: string }> }
) {
  return serveFile(request, context, true);
}
