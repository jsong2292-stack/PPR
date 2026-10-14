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

/**
 * 8D 报告生成 Agent 的结构化输出：字段与 ppr_eight_d_report 的 title / D1–D8 一一对应。
 * 提示词要求区分「工程师已确认」「已否决」「仍待验证」三类输入，不得把未确认假设写成根因。
 */
export const EightDReportSchema = z.object({
  title: z.string().min(5).describe('8D 报告标题，包含事件编号、批次与异常指标'),
  d1: z.string().min(10).describe('D1 组建团队：角色与职责分工；姓名未知时写“待确认”，不得编造人名'),
  d2: z.string().min(20).describe('D2 问题描述：按 5W2H 写清事件、批次、指标、观测值、限值偏差与影响范围'),
  d3: z.string().min(10).describe('D3 临时围堵措施：隔离、复测、加严检验等已执行或建议执行的围堵动作及其核定状态'),
  d4: z.string().min(20).describe('D4 根因分析与验证：分别写已确认根因、已排除项、仍待验证假设，并写入工程师实际发现与意见'),
  d5: z.string().min(10).describe('D5 永久纠正措施选择：候选措施及其依据，明确仍需工程师与现场批准'),
  d6: z.string().min(10).describe('D6 永久纠正措施实施与验证：实施步骤与效果验证方式、验证批次与判定口径'),
  d7: z.string().min(10).describe('D7 预防再发生：需要更新的检验频次、预警规则、点检标准与培训'),
  d8: z.string().min(5).describe('D8 团队表彰与结案：结案条件、未完成事项与团队认可安排'),
});

export type EightDReportOutput = z.infer<typeof EightDReportSchema>;

export interface EightDGenerationResult {
  output: EightDReportOutput;
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

/**
 * 8D 生成过程中按字段推送的流式草稿帧。
 * `text` 是该字段目前为止的**完整**文本（不是增量），客户端直接覆盖即可，
 * 因此丢帧、乱序都不会把输入框拼错；`open` 表示模型此刻是否还在写这个字段。
 */
export interface EightDDraftEvent {
  field: string;
  text: string;
  open: boolean;
}

export type EightDDraftReporter = (event: EightDDraftEvent) => void;

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
