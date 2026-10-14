import { NextResponse } from 'next/server';
import { dbClient } from '@/lib/quality';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * 历史分析列表 = 8D 报告清单。
 *
 * 口径：不再维护独立的归档快照表，一条 8D 报告就是一条历史记录，
 * 状态只有两种——draft（草稿）、finalized（归档），两者都可以点进
 * `/quality/report?analysisId=<id>` 这个原始报告页继续编辑。
 * 因此这里直接读报告表，并补齐列表展示需要的事件、批次、规格字段。
 */
export async function GET() {
  if (!(await getCurrentUser())) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  try {
    const rows = await dbClient.queryAll(`SELECT r.id, r.report_no, r.title, r.status, r.owner_name,
        r.generation_engine, r.model_name, r.generated_at, r.finalized_at, r.updated_at,
        a.id AS analysis_id, a.run_no, a.status AS analysis_status,
        e.event_no, e.metric_code, e.risk_level, e.observed_value, e.status AS event_status,
        m.batch_no, m.inspect_time, s.name AS spec_name
      FROM ppr_eight_d_report r
      JOIN ppr_analysis_run a ON a.id=r.analysis_id
      JOIN ppr_alert_event e ON e.id=a.alert_id
      JOIN ppr_product_measurement m ON m.id=e.measurement_id
      JOIN ppr_product_spec s ON s.id=m.spec_id
      ORDER BY r.updated_at DESC, r.id DESC`);
    return NextResponse.json({ data: rows });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : '加载历史分析失败' }, { status: 500 });
  }
}
