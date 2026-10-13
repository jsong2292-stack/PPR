import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getConfigFlag, getConfigNumber } from '@/lib/system-config';
import { query } from '@/storage/database/mysql-client';
import {
  ALLOWED_EXTENSIONS,
  DANGEROUS_EXTENSIONS,
  SUPPORTED_TYPES_HINT,
  getFileCategory,
} from '@/lib/upload';
import { storeUploadedFile } from '@/lib/file-storage';

// 大文件需要更长的执行时间与 Node 运行时
export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/** 上传大小上限（字节），优先读系统设置，其次环境变量 MAX_FILE_SIZE(MB) */
async function getMaxFileSize(): Promise<number> {
  const envLimit = Number(process.env.MAX_FILE_SIZE || 500);
  const sizeInMB = await getConfigNumber('max_file_size', envLimit);
  return sizeInMB * 1024 * 1024;
}

/**
 * 文件上传（本地磁盘 / MinIO 自动适配）
 *
 * form-data:
 *   file  必填，文件本体
 *   type  可选，业务分类标记，如 avatar / attachment / cover
 *
 * 返回：{ success, url, key, filename, size, category }
 */
export async function POST(request: NextRequest) {
  try {
    // 上传开关
    if (!(await getConfigFlag('enable_file_upload', true))) {
      return NextResponse.json({ error: '文件上传功能已关闭' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const bizType = (formData.get('type') as string) || 'general';

    if (!file) {
      return NextResponse.json({ error: '请选择文件' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: '文件内容为空' }, { status: 400 });
    }

    const maxFileSize = await getMaxFileSize();
    if (file.size > maxFileSize) {
      const limitMB = Math.round(maxFileSize / 1024 / 1024);
      return NextResponse.json({ error: `文件大小不能超过 ${limitMB}MB` }, { status: 400 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    if (DANGEROUS_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ error: '不允许上传可执行文件或脚本文件' }, { status: 400 });
    }

    const category = getFileCategory(file.type);
    if (!category && !ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: `不支持的文件类型，支持的格式：${SUPPORTED_TYPES_HINT}` },
        { status: 400 }
      );
    }

    // 未配置 MinIO 时写入本地磁盘；配置后自动上传到 MinIO
    const stored = await storeUploadedFile(file, bizType);

    // 记录入库，便于统计与清理；失败不影响上传结果
    try {
      const user = await getCurrentUser();
      await query(
        `INSERT INTO uploaded_files
           (filename, original_name, url, mime_type, category, size, uploader_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          stored.filename,
          file.name,
          stored.url,
          file.type || null,
          category || bizType,
          file.size,
          user?.id || null,
        ]
      );
    } catch (dbError) {
      console.warn('[Upload] 上传记录入库失败（不影响上传）:', dbError);
    }

    return NextResponse.json({
      success: true,
      url: stored.url,
      key: stored.key,
      filename: stored.filename,
      size: file.size,
      category: category || bizType,
      storage: stored.storage,
    });
  } catch (error) {
    console.error('[Upload] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '上传失败' },
      { status: 500 }
    );
  }
}
