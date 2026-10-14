import { NextRequest, NextResponse } from 'next/server';
import { dbClient, makeBusinessNo } from '@/lib/quality';
import { getCurrentUser } from '@/lib/auth';
import { generateQualityAnalysis } from '@/lib/quality-analysis/service';
import { reportAnalysisProgress, type AnalysisProgressReporter } from '@/lib/quality-analysis/types';
import type { QualityAnalysisMode } from '@/lib/quality-analysis/config';

export const runtime = 'nodejs';

type Row = Record<string, unknown>;
type GenerateBody = {
  alertId?: unknown;
  mode?: unknown;
  regenerate?: unknown;
  generatedBy?: unknown;
};

function parseJson(value: unknown) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

async function getRun(runId?: number, alertId?: number) {
  const condition = runId ? 'r.id=?' : alertId ? 'r.alert_id=?' : '1=1';
  const value = runId || alertId;
  const run = await dbClient.queryOne<Row>(`SELECT r.*, a.event_no, a.metric_code, a.risk_level, a.rule_name,
    a.observed_value, a.threshold_text, m.record_no, m.sample_no, m.inspect_time,
    m.batch_no, m.production_group, s.name AS spec_name
    FROM ppr_analysis_run r JOIN ppr_alert_event a ON a.id=r.alert_id
    JOIN ppr_product_measurement m ON m.id=a.measurement_id
    JOIN ppr_product_spec s ON s.id=m.spec_id
    WHERE ${condition} ORDER BY r.id DESC LIMIT 1`, value ? [value] : []);
  if (!run) return null;
  const conclusions = await dbClient.queryAll<Row>('SELECT * FROM ppr_analysis_conclusion WHERE analysis_id=? ORDER BY sort_no,id', [run.id]);
  return {
    ...run,
    evidence_snapshot: parseJson(run.evidence_snapshot),
    tool_trace_json: parseJson(run.tool_trace_json),
    token_usage_json: parseJson(run.token_usage_json),
    raw_response_json: parseJson(run.raw_response_json),
    conclusions: conclusions.map((item) => ({ ...item, evidence_source_ids: parseJson(item.evidence_source_ids) })),
  };
}

async function generateAndPersist(
  body: GenerateBody,
  user: { nickname?: string | null; phone?: string | null },
  reporter?: AnalysisProgressReporter
) {
  const alertId = Number(body.alertId);
  if (!alertId) throw new Error('请选择预警事件');
  const requestedMode: QualityAnalysisMode | undefined = body.mode === 'agent' || body.mode === 'rule' ? body.mode : undefined;

  const existing = await getRun(undefined, alertId);
  if (existing && !body.regenerate) {
    await reportAnalysisProgress(reporter, {
      stage: 'complete', status: 'success', message: '已找到现有分析，直接复用最新结果',
      detail: String((existing as Row).run_no || ''),
    });
    return { data: existing, reused: true };
  }

  const alert = await dbClient.queryOne<Row>('SELECT id FROM ppr_alert_event WHERE id=?', [alertId]);
  if (!alert) throw new Error('预警事件不存在');

  const generation = await generateQualityAnalysis(alertId, requestedMode, reporter);
  const generated = generation.result;
  await reportAnalysisProgress(reporter, {
    stage: 'persistence', status: 'running', message: '正在保存分析任务、证据快照与结论',
  });

  const result = await dbClient.query(`INSERT INTO ppr_analysis_run
    (run_no, alert_id, status, summary, evidence_snapshot, engine_type, model_name,
     prompt_version, agent_version, tool_trace_json, token_usage_json, raw_response_json,
     latency_ms, fallback_reason, generated_by)
    VALUES (?, ?, 'generated', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    makeBusinessNo('AN'), alertId, generated.output.summary,
    JSON.stringify(generated.evidenceSnapshot), generated.engineType, generated.modelName || null,
    generated.promptVersion, generated.agentVersion || null,
    generated.toolTrace.length ? JSON.stringify(generated.toolTrace) : null,
    generated.tokenUsage ? JSON.stringify(generated.tokenUsage) : null,
    generated.rawResponse ? JSON.stringify(generated.rawResponse) : null,
    generated.latencyMs, generated.fallbackReason || null,
    typeof body.generatedBy === 'string' && body.generatedBy.trim()
      ? body.generatedBy.trim()
      : user.nickname || user.phone || '质量工程师',
  ]);
  const analysisId = result.insertId;

  for (let index = 0; index < generated.output.conclusions.length; index += 1) {
    const item = generated.output.conclusions[index];
    await dbClient.query(`INSERT INTO ppr_analysis_conclusion
      (analysis_id, sort_no, category, hypothesis, evidence, missing_evidence,
       validation_action, confidence, evidence_source_ids, generated_by_model)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      analysisId, index + 1, item.category, item.hypothesis, item.evidence,
      item.missingEvidence, item.validationAction, item.confidence,
      JSON.stringify(item.evidenceSourceIds), generated.modelName || null,
    ]);
  }
  await dbClient.query("UPDATE ppr_alert_event SET status='analyzing' WHERE id=?", [alertId]);
  const data = await getRun(analysisId);
  await reportAnalysisProgress(reporter, {
    stage: 'complete', status: 'success', message: '分析结果已保存，可以开始工程师验证',
    detail: `${generated.output.conclusions.length} 条结论 · ${generated.latencyMs} ms`,
  });
  return {
    data,
    generation: { configuredMode: generation.configuredMode, agentConfigured: generation.agentConfigured },
  };
}

export async function GET(request: NextRequest) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const runId = Number(params.get('runId')) || undefined;
  const alertId = Number(params.get('alertId')) || undefined;
  try {
    return NextResponse.json({ data: await getRun(runId, alertId) });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : '加载分析失败' }, { status: 500 });
  }
}

/** 根据配置选择规则引擎或LangChain Agent，生成结构化的待验证分析结论。 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  const body = await request.json().catch(() => ({})) as GenerateBody;
  if (!Number(body.alertId)) return NextResponse.json({ error: '请选择预警事件' }, { status: 400 });

  if (request.headers.get('accept')?.includes('text/event-stream')) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: 'progress' | 'result' | 'error', payload: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
        };
        try {
          send('progress', {
            stage: 'preparing', status: 'running', message: '已接收分析请求，正在准备上下文',
            timestamp: new Date().toISOString(),
          });
          const result = await generateAndPersist(body, user, (event) => send('progress', event));
          send('result', result);
        } catch (cause) {
          console.error('streaming quality analysis generation failed', cause);
          send('error', { message: cause instanceof Error ? cause.message : '生成分析失败' });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  try {
    const result = await generateAndPersist(body, user);
    return NextResponse.json(result, { status: result.reused ? 200 : 201 });
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
    await dbClient.query(`UPDATE ppr_analysis_conclusion SET engineer_decision=?, engineer_comment=?,
      actual_finding=?, updated_by=?, engineer_modified=1 WHERE id=?`,
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
