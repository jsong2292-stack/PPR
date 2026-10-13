import { z } from 'zod';

/** Agent 和规则引擎共同使用的结构化诊断输出。 */
export const QualityAnalysisSchema = z.object({
  summary: z.string().min(20).describe('本次异常分析摘要，必须说明事件、批次和分析边界'),
  riskAssessment: z.object({
    level: z.enum(['normal', 'medium', 'high', 'error']),
    reason: z.string().min(10),
  }),
  conclusions: z.array(z.object({
    category: z.string().min(2),
    hypothesis: z.string().min(10).describe('待工程师验证的假设，不得表述为未经验证的最终根因'),
    evidence: z.string().min(5),
    missingEvidence: z.string().min(2),
    validationAction: z.string().min(5),
    confidence: z.number().min(0).max(1),
    evidenceSourceIds: z.array(z.string()).default([]),
  })).min(2).max(6),
  analysisLimitations: z.array(z.string()).min(1),
});

export type QualityAnalysisOutput = z.infer<typeof QualityAnalysisSchema>;

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
