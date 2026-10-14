import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/storage/database/mysql-client';
import { requireAdmin } from '@/lib/auth';
import { failFrom } from '@/lib/api';

export const runtime = 'nodejs';

/**
 * 产品台账下钻页面的上下文（面包屑用），只读。
 *
 *   GET /api/quality/products/1                        → { spec }
 *   GET /api/quality/products/1?batch_no=12121D0050    → { spec, batch }
 *
 * 列表数据仍然走 /api/quality/master/{batches|measurements}?spec_id= | ?batch_no=，
 * 这里只负责把「当前在哪条规格 / 哪个批次号」取回来做标题，避免页面拿不到中文名。
 */
export async function GET(request: NextRequest, context: { params: Promise<{ specId: string }> }) {
  try {
    await requireAdmin();
  } catch (cause) {
    return failFrom(cause, '无权限操作');
  }
  try {
    const { specId } = await context.params;
    const id = Number(specId);
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: '规格ID不合法' }, { status: 400 });

    const spec = await queryOne(
      `SELECT s.id, s.code, s.name, s.status, c.name AS category_name
       FROM ppr_product_spec s JOIN ppr_product_category c ON c.id=s.category_id
       WHERE s.id=?`,
      [id]
    );
    if (!spec) return NextResponse.json({ error: '产品规格不存在或已被删除' }, { status: 404 });

    const batchNo = (request.nextUrl.searchParams.get('batch_no') ?? '').trim();
    if (!batchNo) return NextResponse.json({ spec });

    // 带上 spec_id 一起校验：批次必须属于当前规格，防止手改 URL 串数据。
    const batch = await queryOne(
      'SELECT id, batch_no, production_group, start_time, end_time, measurement_count, reading_count FROM ppr_batch WHERE batch_no=? AND spec_id=?',
      [batchNo, id]
    );
    if (!batch) return NextResponse.json({ error: '批次不存在或不属于该规格' }, { status: 404 });

    return NextResponse.json({ spec, batch });
  } catch (cause) {
    console.error('quality products context failed', cause);
    return failFrom(cause, '加载失败');
  }
}
