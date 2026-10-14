import { NextResponse } from 'next/server';
import { dbClient } from '@/lib/quality';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET() {
  if (!(await getCurrentUser())) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  try {
    const [alerts, measurements, stats] = await Promise.all([
      // 只取判定引擎产出的事件（source='engine'）；legacy 是历史演示行，仅用于维持归档报告的追溯链。
      dbClient.queryAll(`SELECT a.*, m.record_no, m.sample_no, m.inspect_time, m.outer_diameter_mm,
        m.min_wall_thickness_mm, m.ovality_mm, m.data_source, b.batch_no, b.production_group,
        s.name AS spec_name, s.outer_lower_mm, s.outer_upper_mm, s.wall_lower_mm, s.wall_upper_mm, s.ovality_upper_mm
        FROM ppr_alert_event a JOIN ppr_product_measurement m ON m.id=a.measurement_id
        JOIN ppr_batch b ON b.id=m.batch_id JOIN ppr_product_spec s ON s.id=b.spec_id
        WHERE a.source='engine'
        ORDER BY a.risk_level='normal', a.detected_at DESC`),
      dbClient.queryAll(`SELECT m.*, b.batch_no, s.id AS spec_id, s.code AS spec_code, s.name AS spec_name,
        s.outer_lower_mm, s.outer_upper_mm, s.wall_lower_mm, s.wall_upper_mm, s.ovality_upper_mm
        FROM ppr_product_measurement m
        JOIN ppr_batch b ON b.id=m.batch_id JOIN ppr_product_spec s ON s.id=b.spec_id ORDER BY m.inspect_time ASC`),
      dbClient.queryOne(`SELECT
        (SELECT COUNT(*) FROM ppr_product_measurement) AS measurement_count,
        (SELECT COUNT(*) FROM ppr_alert_event WHERE source='engine' AND status<>'closed') AS open_alert_count,
        (SELECT COUNT(*) FROM ppr_alert_event WHERE source='engine' AND risk_level='high' AND status<>'closed') AS high_alert_count,
        (SELECT COUNT(*) FROM ppr_analysis_run) AS analysis_count,
        (SELECT COUNT(*) FROM ppr_eight_d_report WHERE status='finalized') AS finalized_report_count`),
    ]);
    return NextResponse.json({ alerts, measurements, stats });
  } catch (cause) {
    console.error('quality dashboard failed', cause);
    return NextResponse.json({ error: cause instanceof Error ? cause.message : '加载监控数据失败' }, { status: 500 });
  }
}
