import { z } from 'zod';

/** Agent 和规则引擎共同使用的结构化诊断输出。 */
export const QualityAnalysisSchema = z.object({
  summary: z.string().min(20).describe('本次异常分析摘要，说明事件、批次、异常形态、优先验证路径和不能下结论的边界'),
  riskAssessment: z.object({
    level: z.enum(['normal', 'medium', 'high', 'error']),
    reason: z.string().min(10).describe('当前质量或诊断风险及依据，不替代正式产品处置'),
  }),
  conclusions: z.array(z.object({
    category: z.string().min(2).describe('测量/数据、异常形态、设备/生产机理或材料机理等明确领域'),
    hypothesis: z.string().min(10).describe('可证伪的待工程师验证假设及简要机理，不得表述为未经验证的最终根因'),
    evidence: z.string().min(5).describe('按“支持证据；反向或不支持证据”书写，只能引用工具事实'),
    missingEvidence: z.string().min(2).describe('会改变判断的具体缺失资料，不使用笼统的“需要更多数据”'),
    validationAction: z.string().min(5).describe('按“预期伴随信号；验证动作”书写，说明如何确认或排除假设'),
    confidence: z.number().min(0).max(1).describe('证据完整性、可比性与时序匹配程度，不是根因概率'),
    evidenceSourceIds: z.array(z.string()).default([]).describe('本结论实际引用的工具业务记录编号'),
  })).min(2).max(6),
  analysisLimitations: z.array(z.string()).min(1).describe('时间对齐、参考可比性、未接入字段或标准审批状态等实际分析限制'),
});

export type QualityAnalysisOutput = z.infer<typeof QualityAnalysisSchema>;


export type AnalysisProgressStage =
  | 'preparing'
  | 'model'
  | 'tool'
  | 'validation'
  | 'rule'
  | 'fallback'
  | 'persistence'
  | 'complete';

/** 对前端公开的可审计分析过程；不包含模型内部隐式思维链。 */
export interface AnalysisProgressEvent {
  stage: AnalysisProgressStage;
  status: 'running' | 'success' | 'warning' | 'error';
  message: string;
  detail?: string;
  tool?: string;
  timestamp: string;
}

export type AnalysisProgressReporter = (event: AnalysisProgressEvent) => void | Promise<void>;

export async function reportAnalysisProgress(
  reporter: AnalysisProgressReporter | undefined,
  event: Omit<AnalysisProgressEvent, 'timestamp'>
): Promise<void> {
  if (!reporter) return;
  await reporter({ ...event, timestamp: new Date().toISOString() });
}

export interface ToolTraceItem {
  tool: string;
  input: unknown;
  output: unknown;
  startedAt: string;
  durationMs: number;
}

export interface AnalysisGenerationResult {
  output: QualityAnalysisOutput;
  evidenceSnapshot: Record<string, unknown>;
  engineType: 'rule' | 'agent';
  modelName?: string;
  promptVersion: string;
  agentVersion?: string;
  toolTrace: ToolTraceItem[];
  tokenUsage?: Record<string, unknown>;
  rawResponse?: unknown;
  latencyMs: number;
  fallbackReason?: string;
}
