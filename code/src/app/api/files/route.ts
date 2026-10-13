import { NextRequest, NextResponse } from 'next/server';
import { queryOne, queryAll } from '@/storage/database/mysql-client';
import { requireUser } from '@/lib/auth';
import { failFrom, parsePagination } from '@/lib/api';

/**
 * 上传文件列表
 *   GET /api/files              我的文件（管理员加 ?all=true 查看全部）
 *   DELETE /api/files?id=1      删除记录（管理员）
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const { page, pageSize, offset } = parsePagination(searchParams);
    const isAdmin = user.role === 'admin';
    const all = isAdmin && searchParams.get('all') === 'true';
    const category = searchParams.get('category');

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (!all) {
      values.push(user.id);
      conditions.push(`uploader_id = $${values.length}`);
    }
    if (category) {
      values.push(category);
      conditions.push(`category = $${values.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM uploaded_files ${where}`,
      values
    );
    const total = parseInt(countRow?.count || '0', 10);

    const files = await queryAll(
      `SELECT id, filename, original_name, url, mime_type, category, size, uploader_id, created_at
         FROM uploaded_files
         ${where}
        ORDER BY created_at DESC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset]
    );

    return NextResponse.json({
      files,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    return failFrom(error);
  }
}
