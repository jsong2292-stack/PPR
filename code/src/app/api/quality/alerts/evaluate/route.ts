import { NextResponse } from 'next/server';
import { dbClient, makeBusinessNo } from '@/lib/quality';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';

/** 根据规格限值重新扫描尚未产生限值预警的产品记录。 */
export async function POST() {
  if (!(await getCurrentUser())) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  try {
    const rows = await dbClient.queryAll<Record<string, unknown>>(`SELECT m.*, s.outer_lower_mm, s.outer_upper_mm,
      s.wall_lower_mm, s.wall_upper_mm, s.ovality_upper_mm FROM ppr_product_measurement m
      JOIN ppr_batch b ON b.id=m.batch_id JOIN ppr_product_spec s ON s.id=b.spec_id ORDER BY m.inspect_time`);
    let created = 0;
    for (const row of rows) {
      const checks = [
        { code: 'outer_diameter', value: row.outer_diameter_mm as number | null, low: Number(row.outer_lower_mm), high: Number(row.outer_upper_mm), rule: 'R3', name: '外径演示限值对照' },
        { code: 'min_wall_thickness', value: row.min_wall_thickness_mm as number | null, low: Number(row.wall_lower_mm), high: Number(row.wall_upper_mm), rule: 'R3', name: '壁厚与标准壁厚对照' },
        { code: 'ovality', value: row.ovality_mm as number | null, low: 0, high: Number(row.ovality_upper_mm), rule: 'R3', name: '不圆度演示限值对照' },
      ];
      for (const check of checks) {
        if (check.value == null || (Number(check.value) >= check.low && Number(check.value) <= check.high)) continue;
        const result = await dbClient.query(
          `INSERT IGNORE INTO ppr_alert_event
           (event_no, measurement_id, metric_code, risk_level, rule_code, rule_name, observed_value, threshold_text, status, detected_at)
           VALUES (?, ?, ?, 'high', ?, ?, ?, ?, 'open', ?)`,
          [makeBusinessNo('QE'), row.id, check.code, check.rule, check.name, check.value, `${check.low.toFixed(3)}–${check.high.toFixed(3)} mm（演示范围）`, row.inspect_time]
        );
        created += result.affectedRows;
      }
    }
    return NextResponse.json({ success: true, created });
  } catch (cause) {
    console.error('quality alert evaluation failed', cause);
    return NextResponse.json({ error: cause instanceof Error ? cause.message : '扫描失败' }, { status: 500 });
  }
}
