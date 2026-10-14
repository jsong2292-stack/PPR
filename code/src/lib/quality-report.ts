import { dbClient, makeBusinessNo } from '@/lib/quality';
import type { EightDGenerationResult } from '@/lib/quality-analysis/types';

type Row = Record<string, unknown>;

/**
 * 报告读取口径集中在这里：批次不落表，批次号取自检验记录，规格按记录自己的 spec_id 关联。
 * r.* 已包含 generation_engine / model_name / tool_trace_json 等生成审计字段，直接返回给前端。
 */
export async function queryReport(analysisId?: number): Promise<Row | null> {
  const where = analysisId ? 'WHERE r.analysis_id=?' : '';
  return dbClient.queryOne<Row>(`SELECT r.*, a.run_no, a.summary, a.engine_type AS analysis_engine_type,
    a.alert_id, e.event_no, e.metric_code, e.risk_level, e.rule_code, e.rule_name, e.observed_value,
    e.threshold_text, m.batch_no, m.production_group, m.inspect_time, s.name AS spec_name,
    (SELECT COUNT(*) FROM ppr_analysis_conclusion c WHERE c.analysis_id=r.analysis_id AND c.engineer_decision='confirmed') AS confirmed_conclusion_count,
    (SELECT COUNT(*) FROM ppr_analysis_conclusion c WHERE c.analysis_id=r.analysis_id AND c.engineer_decision='pending') AS pending_conclusion_count
    FROM ppr_eight_d_report r
    JOIN ppr_analysis_run a ON a.id=r.analysis_id JOIN ppr_alert_event e ON e.id=a.alert_id
    JOIN ppr_product_measurement m ON m.id=e.measurement_id
    JOIN ppr_product_spec s ON s.id=m.spec_id ${where} ORDER BY r.id DESC LIMIT 1`, analysisId ? [analysisId] : []);
}

/**
 * 写入一次 8D 生成结果。
 * 唯一键 uk_ppr_report_analysis 保证一个分析任务只有一份报告：
 * 首次生成 INSERT，重新生成时原地 UPDATE 并保持 report_no 与 id 不变（归档表按 report_id 引用）。
 */
export async function saveGeneratedReport(params: {
  analysisId: number;
  generation: EightDGenerationResult;
  ownerName: string;
  generatedBy?: string | null;
}): Promise<number> {
  const { analysisId, generation, ownerName } = params;
  const generatedBy = params.generatedBy || ownerName;
  const { output } = generation;
  const result = await dbClient.query(`INSERT INTO ppr_eight_d_report
    (report_no, analysis_id, title, d1, d2, d3, d4, d5, d6, d7, d8, owner_name, status,
     generation_engine, model_name, prompt_version, agent_version, tool_trace_json,
     latency_ms, fallback_reason, generated_by, generated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    ON DUPLICATE KEY UPDATE title=VALUES(title), d1=VALUES(d1), d2=VALUES(d2), d3=VALUES(d3),
      d4=VALUES(d4), d5=VALUES(d5), d6=VALUES(d6), d7=VALUES(d7), d8=VALUES(d8),
      owner_name=VALUES(owner_name), status='draft', finalized_at=NULL,
      generation_engine=VALUES(generation_engine), model_name=VALUES(model_name),
      prompt_version=VALUES(prompt_version), agent_version=VALUES(agent_version),
      tool_trace_json=VALUES(tool_trace_json), latency_ms=VALUES(latency_ms),
      fallback_reason=VALUES(fallback_reason), generated_by=VALUES(generated_by), generated_at=NOW()`, [
    makeBusinessNo('8D'), analysisId, output.title,
    output.d1, output.d2, output.d3, output.d4, output.d5, output.d6, output.d7, output.d8,
    ownerName, generation.engineType, generation.modelName || null,
    generation.promptVersion, generation.agentVersion || null,
    generation.toolTrace.length ? JSON.stringify(generation.toolTrace) : null,
    generation.latencyMs, generation.fallbackReason || null, generatedBy,
  ]);
  // INSERT 返回新 id；命中唯一键走 UPDATE 时 insertId 为 0，需要按 analysis_id 回读。
  if (result.insertId) return Number(result.insertId);
  const row = await dbClient.queryOne<Row>('SELECT id FROM ppr_eight_d_report WHERE analysis_id=?', [analysisId]);
  return Number(row?.id || 0);
}

/** 创建一份空白草稿：只落标题，不写入任何未经生成的内容，供尚未生成时占位。 */
export async function createEmptyDraft(params: {
  analysisId: number;
  title: string;
  ownerName: string;
}): Promise<void> {
  await dbClient.query(`INSERT INTO ppr_eight_d_report (report_no, analysis_id, title, owner_name, status)
    VALUES (?, ?, ?, ?, 'draft')
    ON DUPLICATE KEY UPDATE title=VALUES(title)`, [
    makeBusinessNo('8D'), params.analysisId, params.title, params.ownerName,
  ]);
}
