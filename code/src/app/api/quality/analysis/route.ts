import { NextRequest, NextResponse } from 'next/server';
import { dbClient, makeBusinessNo } from '@/lib/quality';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';

type Row = Record<string, unknown>;

async function getRun(runId?: number, alertId?: number) {
  const condition = runId ? 'r.id=?' : alertId ? 'r.alert_id=?' : '1=1';
  const value = runId || alertId;
  const run = await dbClient.queryOne<Row>(`SELECT r.*, a.event_no, a.metric_code, a.risk_level, a.rule_name,
    a.observed_value, a.threshold_text, m.record_no, m.sample_no, m.inspect_time,
    b.batch_no, b.production_group, s.name AS spec_name
    FROM ppr_analysis_run r JOIN ppr_alert_event a ON a.id=r.alert_id
    JOIN ppr_product_measurement m ON m.id=a.measurement_id
    JOIN ppr_batch b ON b.id=m.batch_id JOIN ppr_product_spec s ON s.id=b.spec_id
    WHERE ${condition} ORDER BY r.id DESC LIMIT 1`, value ? [value] : []);
  if (!run) return null;
  const conclusions = await dbClient.queryAll<Row>('SELECT * FROM ppr_analysis_conclusion WHERE analysis_id=? ORDER BY sort_no,id', [run.id]);
  return { ...run, evidence_snapshot: typeof run.evidence_snapshot === 'string' ? JSON.parse(run.evidence_snapshot) : run.evidence_snapshot, conclusions };
}

export async function GET(request: NextRequest) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const runId = Number(params.get('runId')) || undefined;
  const alertId = Number(params.get('alertId')) || undefined;
  try {
    const data = await getRun(runId, alertId);
    return NextResponse.json({ data });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : '加载分析失败' }, { status: 500 });
  }
}

/** 基于数据库中的产品记录、规格限值、相邻趋势和同期设备参数生成可解释的待验证结论。 */
export async function POST(request: NextRequest) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const alertId = Number(body.alertId);
  if (!alertId) return NextResponse.json({ error: '请选择预警事件' }, { status: 400 });
  try {
    const existing = await getRun(undefined, alertId);
    if (existing) return NextResponse.json({ data: existing });

    const alert = await dbClient.queryOne<Row>(`SELECT a.*, m.*, b.batch_no, b.production_group, b.id AS batch_id,
      s.name AS spec_name, s.outer_lower_mm, s.outer_upper_mm, s.wall_lower_mm, s.wall_upper_mm, s.ovality_upper_mm
      FROM ppr_alert_event a JOIN ppr_product_measurement m ON m.id=a.measurement_id
      JOIN ppr_batch b ON b.id=m.batch_id JOIN ppr_product_spec s ON s.id=b.spec_id WHERE a.id=?`, [alertId]);
    if (!alert) return NextResponse.json({ error: '预警事件不存在' }, { status: 404 });
    const measurements = await dbClient.queryAll<Row>(`SELECT * FROM ppr_product_measurement WHERE batch_id=? AND inspect_time<=? ORDER BY inspect_time DESC LIMIT 5`, [alert.batch_id, alert.inspect_time]);
    const readings = await dbClient.queryAll<Row>(`SELECT r.*, e.name AS equipment_name FROM ppr_equipment_reading r JOIN ppr_equipment e ON e.id=r.equipment_id WHERE r.batch_id=? ORDER BY ABS(TIMESTAMPDIFF(MINUTE,r.collect_time,?)) LIMIT 4`, [alert.batch_id, alert.inspect_time]);
    const metric = String(alert.metric_code);
    const valueMap: Record<string, string> = { outer_diameter: 'outer_diameter_mm', min_wall_thickness: 'min_wall_thickness_mm', ovality: 'ovality_mm' };
    const key = valueMap[metric] || 'outer_diameter_mm';
    const values = measurements.map((item) => Number(item[key])).filter(Number.isFinite).reverse();
    const delta = values.length > 1 ? values.at(-1)! - values[0] : 0;
    const evidence = { alert, measurements: measurements.slice().reverse(), readings };
    const summary = `${alert.event_no} 在批次 ${alert.batch_no} 触发“${alert.rule_name}”。系统已关联同批次产品检验与同期设备数据；以下结论均为待工程师验证的排查线索。`;

    const result = await dbClient.query('INSERT INTO ppr_analysis_run (run_no, alert_id, status, summary, evidence_snapshot, generated_by) VALUES (?, ?, ?, ?, ?, ?)',
      [makeBusinessNo('AN'), alertId, 'generated', summary, JSON.stringify(evidence), body.generatedBy || '质量工程师']);
    const analysisId = result.insertId;
    const conclusions = [
      {
        category: '触发规则与限值对照',
        hypothesis: `${alert.rule_name}：当前观测值 ${alert.observed_value ?? '无数据'} mm，${alert.threshold_text || '需复核适用限值'}。`,
        evidence: `记录 ${alert.record_no} / 样管 ${alert.sample_no} / ${alert.inspect_time}，来源 ${alert.data_source}。`,
        missing: '正式标准条款、量具状态、原始检验单与测量方法仍需现场确认。',
        action: '复核样管身份、原始测量值、适用规格和测量方法；演示限值不直接等同合格判定。',
      },
      {
        category: '变化趋势观察',
        hypothesis: values.length > 1 ? `最近 ${values.length} 个同批次可比较点由 ${values[0].toFixed(3)} 变化至 ${values.at(-1)!.toFixed(3)} mm，净变化 ${delta >= 0 ? '+' : ''}${delta.toFixed(3)} mm。` : '同批次可比较数据不足，暂不能形成趋势判断。',
        evidence: measurements.map((item) => `${item.inspect_time}: ${item[key] ?? '无数据'} mm`).reverse().join('；'),
        missing: '停机、换规格、生产连续性和检测延迟信息未完全确认。',
        action: '补齐连续抽检点并核对运行日志，区分连续趋势与离散波动。',
      },
      {
        category: '同期设备因素',
        hypothesis: readings.length ? `同批次同期关联到 ${readings.length} 条设备采集数据，可优先核查温度、压力与牵引速度是否在异常前后发生变化。` : '未关联到同期设备数据，暂不能讨论设备因素。',
        evidence: readings.map((item) => `${item.collect_time} ${item.equipment_name}: 温度${item.temperature_c ?? '-'}℃ / 压力${item.pressure_mpa ?? '-'}MPa / 牵引${item.haul_off_speed_mpm ?? '-'}m/min`).join('；') || '无可用设备证据',
        missing: '设备设定值、调机记录、报警和运行状态尚未接入。',
        action: '由设备工程师核对异常时段设定值、反馈值、调机与报警记录；同期变化不等同因果。',
      },
    ];
    for (let index = 0; index < conclusions.length; index += 1) {
      const item = conclusions[index];
      await dbClient.query(`INSERT INTO ppr_analysis_conclusion
        (analysis_id, sort_no, category, hypothesis, evidence, missing_evidence, validation_action)
        VALUES (?, ?, ?, ?, ?, ?, ?)`, [analysisId, index + 1, item.category, item.hypothesis, item.evidence, item.missing, item.action]);
    }
    await dbClient.query("UPDATE ppr_alert_event SET status='analyzing' WHERE id=?", [alertId]);
    return NextResponse.json({ data: await getRun(analysisId) }, { status: 201 });
  } catch (cause) {
    console.error('quality analysis generation failed', cause);
    return NextResponse.json({ error: cause instanceof Error ? cause.message : '生成分析失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const conclusionId = Number(body.conclusionId);
  if (!conclusionId) return NextResponse.json({ error: '缺少结论ID' }, { status: 400 });
  try {
    await dbClient.query(`UPDATE ppr_analysis_conclusion SET engineer_decision=?, engineer_comment=?, actual_finding=?, updated_by=? WHERE id=?`,
      [body.engineerDecision || 'pending', body.engineerComment || null, body.actualFinding || null, body.updatedBy || '质量工程师', conclusionId]);
    const conclusion = await dbClient.queryOne<Row>('SELECT * FROM ppr_analysis_conclusion WHERE id=?', [conclusionId]);
    if (conclusion) {
      const pending = await dbClient.queryOne<Row>("SELECT COUNT(*) AS count FROM ppr_analysis_conclusion WHERE analysis_id=? AND engineer_decision='pending'", [conclusion.analysis_id]);
      await dbClient.query('UPDATE ppr_analysis_run SET status=? WHERE id=?', [Number(pending?.count) === 0 ? 'completed' : 'reviewing', conclusion.analysis_id]);
    }
    return NextResponse.json({ data: conclusion });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : '保存验证结果失败' }, { status: 500 });
  }
}
