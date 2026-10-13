import { z } from 'zod';
import { withApi, ok } from '@/lib/api';
import { parseId } from '@/lib/validation';
import { AppError } from '@/lib/errors';
import { execute, query, queryOne, type RowDataPacket } from '@/lib/db';
import { buildDiagnosisInput, runDiagnosis } from '@/lib/services/analysisEngine';
import { updateHandlingStatus } from '@/lib/repositories/alertEventRepository';
import { safeJson, flattenZod } from '@/lib/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const decisionSchema = z.object({
  conclusionId: z.coerce.number().int().positive(),
  decision: z.enum(['pending', 'confirmed', 'rejected']),
  comment: z.string().trim().max(500).optional(),
  validationResult: z.string().trim().max(1000).optional(),
  actualFinding: z.string().trim().max(1000).optional(),
  finalAction: z.string().trim().max(1000).optional(),
});

/**
 * 诊断工作台数据接口。
 *
 *   GET  /api/diagnosis?event=<事件编号>   读取事件、既有分析与证据
 *   POST /api/diagnosis                    执行诊断（生成结论候选）
 *   PATCH /api/diagnosis                   工程师判定结论 / 更新事件处置状态
 */
export const GET = withApi(
  { name: 'GET /api/diagnosis', permission: 'analysis:read' },
  async ({ request }) => {
    const url = new URL(request.url);
    const eventCode = url.searchParams.get('event');
    if (!eventCode) throw AppError.badRequest('缺少 event 参数（预警事件编号）。');

    const input = await buildDiagnosisInput(eventCode);

    const runs = await query<RowDataPacket>(
      `SELECT r.id, r.code, r.run_no AS runNo, r.generation_type AS generationType,
              r.model_name AS modelName, r.status, r.data_version_note AS dataVersionNote,
              r.generated_at AS generatedAt, u.display_name AS generatedByName
         FROM analysis_run r
         LEFT JOIN sys_user u ON u.id = r.generated_by
        WHERE r.event_id = ?
        ORDER BY r.run_no DESC`,
      [input.event.id],
    );

    const latestRunId = runs.length ? Number(runs[0].id) : null;
    const conclusions = latestRunId
      ? await query<RowDataPacket>(
          `SELECT c.id, c.seq, c.hypothesis, c.root_cause_category AS rootCauseCategory,
                  c.observation, c.mechanism, c.mechanism_sources AS mechanismSources,
                  c.missing_evidence AS missingEvidence, c.validation_actions AS validationActions,
                  c.validation_method AS validationMethod, c.engineer_decision AS engineerDecision,
                  c.engineer_comment AS engineerComment, c.validation_result AS validationResult,
                  c.actual_finding AS actualFinding, c.final_action AS finalAction,
                  c.decided_by AS decidedBy, c.decided_at AS decidedAt, u.display_name AS decidedByName
             FROM analysis_conclusion c
             LEFT JOIN sys_user u ON u.id = c.decided_by
            WHERE c.run_id = ?
            ORDER BY c.seq`,
          [latestRunId],
        )
      : [];

    const evidence = latestRunId
      ? await query<RowDataPacket>(
          `SELECT e.id, e.conclusion_id AS conclusionId, e.evidence_type AS evidenceType,
                  e.layer, e.content, e.fact_time AS factTime, e.is_locateable AS isLocateable,
                  e.related_record_id AS relatedRecordId, e.is_usable AS isUsable
             FROM conclusion_evidence e
             JOIN analysis_conclusion c ON c.id = e.conclusion_id
            WHERE c.run_id = ?
            ORDER BY e.sort_no, e.id`,
          [latestRunId],
        )
      : [];

    const snapshots = latestRunId
      ? await query<RowDataPacket>(
          `SELECT reference_batch_no AS referenceBatchNo, production_group AS productionGroup,
                  sample_count AS sampleCount, median_value AS medianValue,
                  min_value AS \`minValue\`, max_value AS \`maxValue\`, note
             FROM analysis_reference_snapshot WHERE run_id = ? ORDER BY id`,
          [latestRunId],
        )
      : [];

    return ok({
      event: input.event,
      metric: {
        code: input.metricCode,
        name: input.metricName,
        unit: input.metricUnit,
        decimalScale: input.decimalScale,
      },
      batchRecords: input.batchRecords.map((record) => ({
        id: record.id,
        code: record.code,
        sampleNo: record.sampleNo,
        inspectTime: record.inspectTime,
        qualityFlag: record.qualityFlag,
        value: input.metricCode ? record.metrics[input.metricCode] ?? null : null,
      })),
      counts: {
        wallPoints: input.wallPoints.length,
        productData: input.productData.length,
        processRecords: input.processRecords.length,
        equipmentReadings: input.equipmentReadings.length,
        references: input.references.length,
        consistencyChecks: input.consistencyChecks.length,
      },
      influences: input.influences,
      consistencyChecks: input.consistencyChecks,
      dataVersionNote: input.dataVersionNote,
      runs: runs.map((row) => ({
        id: Number(row.id),
        code: String(row.code),
        runNo: Number(row.runNo),
        generationType: String(row.generationType),
        modelName: row.modelName === null ? null : String(row.modelName),
        status: String(row.status),
        dataVersionNote: row.dataVersionNote === null ? null : String(row.dataVersionNote),
        generatedAt: String(row.generatedAt),
        generatedByName: row.generatedByName === null ? null : String(row.generatedByName),
      })),
      latestRunId,
      conclusions: conclusions.map(mapConclusion),
      evidence: evidence.map((row) => ({
        id: Number(row.id),
        conclusionId: Number(row.conclusionId),
        evidenceType: String(row.evidenceType),
        layer: String(row.layer ?? ''),
        content: String(row.content ?? ''),
        factTime: row.factTime === null ? null : String(row.factTime),
        isLocateable: Number(row.isLocateable) === 1,
        relatedRecordId: row.relatedRecordId === null ? null : Number(row.relatedRecordId),
        isUsable: Number(row.isUsable) === 1,
      })),
      snapshots: snapshots.map((row) => ({
        referenceBatchNo: String(row.referenceBatchNo),
        productionGroup: row.productionGroup === null ? null : String(row.productionGroup),
        sampleCount: Number(row.sampleCount),
        medianValue: row.medianValue === null ? null : Number(row.medianValue),
        minValue: row.minValue === null ? null : Number(row.minValue),
        maxValue: row.maxValue === null ? null : Number(row.maxValue),
        note: row.note === null ? null : String(row.note),
      })),
      hasBuilder: ['R1', 'R2', 'R3', 'R4'].includes(input.event.ruleCode),
    });
  },
);

function mapConclusion(row: RowDataPacket) {
  let mechanismSources: string[] = [];
  try {
    const parsed = row.mechanismSources;
    if (Array.isArray(parsed)) mechanismSources = parsed.map(String);
    else if (typeof parsed === 'string' && parsed) mechanismSources = JSON.parse(parsed);
  } catch {
    mechanismSources = [];
  }

  return {
    id: Number(row.id),
    seq: Number(row.seq),
    hypothesis: String(row.hypothesis),
    rootCauseCategory: String(row.rootCauseCategory ?? ''),
    observation: String(row.observation ?? ''),
    mechanism: String(row.mechanism ?? ''),
    mechanismSources,
    missingEvidence: row.missingEvidence === null ? [] : String(row.missingEvidence).split('\n'),
    validationActions: String(row.validationActions ?? ''),
    validationMethod: String(row.validationMethod ?? ''),
    engineerDecision: String(row.engineerDecision ?? 'pending'),
    engineerComment: row.engineerComment === null ? null : String(row.engineerComment),
    validationResult: row.validationResult === null ? null : String(row.validationResult),
    actualFinding: row.actualFinding === null ? null : String(row.actualFinding),
    finalAction: row.finalAction === null ? null : String(row.finalAction),
    decidedAt: row.decidedAt === null ? null : String(row.decidedAt),
    decidedByName: row.decidedByName === null ? null : String(row.decidedByName),
  };
}

export const POST = withApi(
  { name: 'POST /api/diagnosis', permission: 'analysis:generate' },
  async ({ request, user }) => {
    const body = await safeJson(request);
    const parsed = z
      .object({ eventCode: z.string().trim().min(3).max(64) })
      .safeParse(body);
    if (!parsed.success) {
      throw AppError.validation('请求参数校验未通过。', flattenZod(parsed.error));
    }
    const result = await runDiagnosis({
      eventCode: parsed.data.eventCode,
      userId: user!.userId,
      request,
    });
    return ok(result, undefined, { status: 201 });
  },
);

export const PATCH = withApi(
  { name: 'PATCH /api/diagnosis', permission: 'analysis:verify' },
  async ({ request, user }) => {
    const body = await safeJson(request);
    const parsed = decisionSchema.safeParse(body);
    if (!parsed.success) {
      throw AppError.validation('请求参数校验未通过。', flattenZod(parsed.error));
    }

    // 结论判定必须留痕：即便之后被改，也能看到每次判定的时间与说明
    const updateResult = await execute(
      `UPDATE analysis_conclusion
          SET engineer_decision = ?, engineer_comment = ?, validation_result = ?,
              actual_finding = ?, final_action = ?, decided_by = ?, decided_at = NOW()
        WHERE id = ?`,
      [
        parsed.data.decision,
        parsed.data.comment ?? null,
        parsed.data.validationResult ?? null,
        parsed.data.actualFinding ?? null,
        parsed.data.finalAction ?? null,
        user!.userId,
        parsed.data.conclusionId,
      ],
    );
    if (!updateResult.affectedRows) throw AppError.notFound('结论不存在或未发生变化。');

    const conclusion = await queryOne<RowDataPacket>(
      `SELECT c.id, c.run_id AS runId, r.event_id AS eventId, c.engineer_decision AS decision
         FROM analysis_conclusion c JOIN analysis_run r ON r.id = c.run_id WHERE c.id = ?`,
      [parsed.data.conclusionId],
    );
    if (!conclusion) throw AppError.notFound('结论不存在。');

    // 有任意结论被确认后，把事件推进到「处理中」，让监控页能反映进展；
    // 由工程师手动闭环，不自动关闭（自动关闭会掩盖未复核的事件）。
    if (parsed.data.decision === 'confirmed') {
      await updateHandlingStatus({
        eventId: Number(conclusion.eventId),
        status: 'processing',
        handlerUserId: user!.userId,
        note: '诊断结论已由工程师确认，事件转入处理中',
      });
    }

    return ok({ saved: true });
  },
);
