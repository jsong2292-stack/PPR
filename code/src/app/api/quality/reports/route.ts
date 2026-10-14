import { NextRequest, NextResponse } from 'next/server';
import { dbClient, makeBusinessNo } from '@/lib/quality';
import { getCurrentUser } from '@/lib/auth';
import { createEmptyDraft, queryReport } from '@/lib/quality-report';

export const runtime = 'nodejs';
type Row = Record<string, unknown>;

export async function GET(request: NextRequest) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  const analysisId = Number(new URL(request.url).searchParams.get('analysisId')) || undefined;
  try {
    return NextResponse.json({ data: await queryReport(analysisId) });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : '加载报告失败' }, { status: 500 });
  }
}

/**
 * 只创建一份空白草稿（标题 + 负责人），不再写入任何固定模板文字。
 * D1–D8 必须由 POST /api/quality/reports/generate 的 8D 生成 Agent 产出，
 * 或由工程师在工作台逐项填写；接口不再代替工程师编造措施与结案内容。
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const analysisId = Number(body.analysisId);
  if (!analysisId) return NextResponse.json({ error: '缺少分析任务ID' }, { status: 400 });
  try {
    const existing = await queryReport(analysisId);
    if (!existing) {
      const analysis = await dbClient.queryOne<Row>(`SELECT a.id, e.event_no, e.metric_code, m.batch_no, s.name AS spec_name
        FROM ppr_analysis_run a JOIN ppr_alert_event e ON e.id=a.alert_id
        JOIN ppr_product_measurement m ON m.id=e.measurement_id
        JOIN ppr_product_spec s ON s.id=m.spec_id WHERE a.id=?`, [analysisId]);
      if (!analysis) return NextResponse.json({ error: '分析任务不存在' }, { status: 404 });
      await createEmptyDraft({
        analysisId,
        title: `${analysis.event_no} ${analysis.batch_no} 过程质量异常8D报告`,
        ownerName: typeof body.ownerName === 'string' && body.ownerName.trim() ? body.ownerName.trim() : '质量工程师',
      });
    }
    return NextResponse.json({ data: await queryReport(analysisId) }, { status: existing ? 200 : 201 });
  } catch (cause) {
    console.error('quality report create failed', cause);
    return NextResponse.json({ error: cause instanceof Error ? cause.message : '创建报告失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const id = Number(body.id);
  if (!id) return NextResponse.json({ error: '缺少报告ID' }, { status: 400 });
  const fields = ['title','d1','d2','d3','d4','d5','d6','d7','d8','owner_name'] as const;
  try {
    const values = fields.map((field) => body[field] ?? null);
    await dbClient.query(`UPDATE ppr_eight_d_report SET ${fields.map((field) => `${field}=?`).join(', ')} WHERE id=?`, [...values, id]);
    if (body.finalize) {
      const report = await dbClient.queryOne<Row>(`SELECT r.*, a.summary, e.event_no, e.metric_code, e.risk_level,
        m.batch_no FROM ppr_eight_d_report r JOIN ppr_analysis_run a ON a.id=r.analysis_id
        JOIN ppr_alert_event e ON e.id=a.alert_id JOIN ppr_product_measurement m ON m.id=e.measurement_id
        WHERE r.id=?`, [id]);
      if (!report) return NextResponse.json({ error: '报告不存在' }, { status: 404 });
      const missing = ['d1','d2','d3','d4','d5','d6','d7','d8'].filter((field) => !String(body[field] || '').trim());
      if (missing.length) return NextResponse.json({ error: `定稿前请补齐：${missing.map((item) => item.toUpperCase()).join('、')}` }, { status: 400 });
      // 定稿纪律：没有工程师已确认的结论时不允许把未验证假设当作根因结案。
      const confirmed = await dbClient.queryAll<Row>("SELECT hypothesis,actual_finding,engineer_comment FROM ppr_analysis_conclusion WHERE analysis_id=? AND engineer_decision='confirmed' ORDER BY sort_no", [report.analysis_id]);
      if (!confirmed.length) {
        return NextResponse.json({ error: '定稿前请先在诊断页确认至少一条结论，未经确认的假设不能作为根因结案' }, { status: 400 });
      }
      await dbClient.query("UPDATE ppr_eight_d_report SET status='finalized', finalized_at=NOW() WHERE id=?", [id]);
      await dbClient.query(`INSERT INTO ppr_history_archive
        (archive_no, report_id, event_no, batch_no, metric_code, risk_level, problem_summary, confirmed_root_cause, corrective_action, archived_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE problem_summary=VALUES(problem_summary), confirmed_root_cause=VALUES(confirmed_root_cause), corrective_action=VALUES(corrective_action), archived_by=VALUES(archived_by), archived_at=NOW()`, [
          makeBusinessNo('AR'), id, report.event_no, report.batch_no, report.metric_code, report.risk_level,
          body.d2, confirmed.map((item) => `${item.hypothesis}${item.actual_finding ? `；验证：${item.actual_finding}` : ''}`).join('\n') || body.d4,
          `${body.d5}\n${body.d6}\n${body.d7}`, body.owner_name || '质量工程师',
        ]);
      await dbClient.query("UPDATE ppr_analysis_run SET status='completed' WHERE id=?", [report.analysis_id]);
      await dbClient.query("UPDATE ppr_alert_event e JOIN ppr_analysis_run a ON a.alert_id=e.id SET e.status='closed' WHERE a.id=?", [report.analysis_id]);
    }
    const row = await dbClient.queryOne<Row>('SELECT * FROM ppr_eight_d_report WHERE id=?', [id]);
    return NextResponse.json({ data: row });
  } catch (cause) {
    console.error('quality report save failed', cause);
    return NextResponse.json({ error: cause instanceof Error ? cause.message : '保存报告失败' }, { status: 500 });
  }
}
