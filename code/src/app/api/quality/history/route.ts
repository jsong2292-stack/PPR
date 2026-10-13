import { NextResponse } from 'next/server';
import { dbClient } from '@/lib/quality';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET() {
  if (!(await getCurrentUser())) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  try {
    const rows = await dbClient.queryAll(`SELECT h.*, r.report_no, r.title, r.status, r.finalized_at
      FROM ppr_history_archive h JOIN ppr_eight_d_report r ON r.id=h.report_id ORDER BY h.archived_at DESC`);
    return NextResponse.json({ data: rows });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : '加载历史分析失败' }, { status: 500 });
  }
}
