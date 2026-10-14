import { createAgent, tool, toolStrategy } from 'langchain';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { dbClient } from '@/lib/quality';
import { createQualityAgentTools, loadAlertAgentContext, type AlertAgentContext } from './data-tools';
import { createEightDFieldParser } from './eight-d-stream';
import {
  EightDReportSchema,
  reportAnalysisProgress,
  type AnalysisProgressReporter,
  type EightDDraftEvent,
  type EightDDraftReporter,
  type EightDGenerationResult,
  type ToolTraceItem,
} from './types';
import type { QualityAgentConfig } from './config';

const PROMPT_VERSION = 'quality-8d-agent-v1.0';
const AGENT_VERSION = 'langchain-create-agent-8d-v1';

/** 草稿字段帧的最小推送间隔：模型可能每秒吐出上百个增量块，合并后再推给页面。 */
const DRAFT_FLUSH_INTERVAL_MS = 50;

type Row = Record<string, unknown>;

export interface EightDConclusionInput {
  id: number;
  sort_no: number;
  category: string;
  hypothesis: string;
  evidence: string | null;
  missing_evidence: string | null;
  validation_action: string | null;
  confidence: number | null;
  evidence_source_ids: unknown;
  engineer_decision: 'pending' | 'confirmed' | 'rejected';
  engineer_comment: string | null;
  actual_finding: string | null;
}

/** 8D 生成 Agent 的输入上下文：诊断分析 + 工程师验证记录 + 预警/批次/规格事实。 */
export interface EightDAnalysisContext extends AlertAgentContext {
  analysis_id: number;
  run_no: string;
  run_status: string;
  summary: string;
  engine_type: string;
  analysis_model_name: string | null;
  conclusions: EightDConclusionInput[];
}

const SYSTEM_PROMPT = `你是PPR管材过程质量异常的8D报告Agent。你的唯一任务是把已经完成的异常诊断分析、页面引用的数据事实和工程师的人工验证记录，整理成一份供质量工程师复核、修改和定稿的8D报告草稿（D1–D8）。你不做最终质量判定，不确认根因，不批准放行、报废或调机，也不代替工程师签字。

一、硬约束
1. 必须先调用 get_alert_context 和 get_diagnosis_result 取得事件事实与诊断结论，再按需调用 get_batch_measurements、get_equipment_window、get_reference_measurements、get_metric_definition 核对数据。工具返回为空时必须把该数据缺口写进对应的 D 段，不得凭常识补齐。
2. 只使用工具返回的内容作为事实。禁止编造人名、部门、日期、记录号、数值、标准条款、设备状态、工艺设定、检验结果、材料检测结果、客户投诉、出货或库存信息。
3. 根因纪律（D4 的核心）：
   - 只有 engineer_decision='confirmed' 的结论才能写成“已确认根因”，并且必须同时写入该结论的 actual_finding（实际发现）和 engineer_comment（工程师意见）。
   - engineer_decision='rejected' 的结论写入“已排除/已否决”，并保留工程师给出的否决理由。
   - engineer_decision='pending' 的结论只能写成“仍待验证的假设”，必须明确标注“未经工程师确认，不能作为根因”。没有任何结论被确认时，D4 必须明确写出“根因尚未确认”，并列出待验证假设与缺失证据，不得给出结论性根因。
   - 诊断摘要 summary 是 Agent 的分析意见，不是工程师结论；引用它时只能说“诊断分析认为”，不能说“已确认”。
4. 事实与计划分离：D1–D3 只能写已发生的围堵动作或明确标注“建议待批准”的动作；D5–D8 都是候选措施与计划，必须写清“待工程师确认/待现场批准/尚无实施验证结果”，不得写成已经执行完成。
5. 影响范围、隔离米数、暴露时段等估算必须标明是估算且待核定；不要把估算写成实测。
6. 团队人名未知时使用角色（如“质量工程师（主责）”），并写“姓名与批准人待确认”。
7. 每条 D 段内容必须能追溯到工具返回的事实或工程师的填写内容；信息不足就写缺口，禁止用通用质量管理套话填充。
8. 使用简洁、专业、可审查的中文；不输出内部隐式思维链，不输出根因概率，不输出具体调机数值，不对产品合格性下结论。

二、必须遵循的整理顺序
1. 读取事件与规格：确认事件编号、批次、指标、观测值、限值区间与触发规则；核对规格限值与观测值是否自洽。
2. 读取诊断结论与工程师记录：统计已确认、已否决、待验证各多少条；确认哪些结论有实际发现和工程师意见。
3. 数据核对：用同批次检验序列确认异常形态（偏大/偏小/接近边界/趋势/波动）与可比点数量；用设备窗口确认异常前后温度、压力、牵引速度是否有可描述的变化；用同规格正常参考确认与历史较好状态的差异。检验时间不等于该样管在机头的生产时间，时间接近只能说“同批次且接近检验时刻”，不得说成因果。
4. 一致性检查：若工程师的实际发现与诊断假设冲突，以工程师的实际发现为准，并在 D4 中说明分歧；若工程师填写内容与工具数据矛盾，写入待澄清事项，不得自行取舍。
5. 按 D1–D8 组织内容：D2 用 5W2H；D4 按 6M（原料/制程方法/生产设备/设计/人员/环境）归类并区分确认、排除、待验证；D3 覆盖隔离与加严检验；D5–D8 给出可执行的候选措施与验证计划。

三、各段写作要求
- D1 组建团队：列出角色与职责（质量工程师主责、生产领班、设备工程师、检验员等），说明谁负责数据核对、谁负责现场处置、谁负责效果验证；姓名与批准人待确认。
- D2 问题描述：采用 5W2H。写清产品规格、批次、异常指标、观测值、标准区间、偏差方向与大小、触发规则、异常时段、涉及记录号与估算影响范围（标注估算待核定）。若为趋势或接近边界类规则，说明参与比较的点数与数值。
- D3 临时围堵措施：写隔离范围与加严复检、原始记录与设备运行记录核对、可疑时段产品处置；所有范围写明“由质量工程师最终核定”。
- D4 根因分析与验证：先写已确认根因（含工程师实际发现与意见），再写已排除项及理由，再写仍待验证假设（含支持的证据、缺失证据、建议的区分性验证动作）；最后写 6M 归类结论与尚不能归因的边界。
- D5 永久纠正措施选择：给出候选措施与选择依据，并说明需要在哪个环节批准；不得声称已选定实施。
- D6 永久纠正措施实施与验证：写实施步骤、责任角色、验证方式（复测点数、检验频次、判定口径）与验证通过条件；没有实施结果时明确写“尚无实施验证结果”。
- D7 预防再发生：写需要更新的检验频次、预警规则阈值、设备点检标准、作业指导书与培训；阈值变更必须写明待业务确认。
- D8 团队表彰与结案：写结案条件与未完成事项清单，并说明结案需要质量工程师与生产负责人确认。

四、输出要求
1. 每个字段写成带换行的结构化中文文本，可用「」或【】标注小节和“待确认/待核定/尚无结果”等状态；不要输出 Markdown 表格。
2. title 使用「事件编号 + 批次 + 异常指标 + 过程质量异常8D报告」的形式。
3. 所有结论性表述都要保留可审查的限制条件，不夸大证据强度。`;

/** 把分析结论整理成 Agent 可直接读的工程验证记录，按确认/否决/待验证分组。 */
function groupConclusions(conclusions: EightDConclusionInput[]) {
  const shape = (item: EightDConclusionInput) => ({
    sortNo: item.sort_no,
    category: item.category,
    hypothesis: item.hypothesis,
    evidence: item.evidence,
    missingEvidence: item.missing_evidence,
    validationAction: item.validation_action,
    confidence: item.confidence === null ? null : Number(item.confidence),
    evidenceSourceIds: item.evidence_source_ids,
    engineerDecision: item.engineer_decision,
    engineerComment: item.engineer_comment,
    actualFinding: item.actual_finding,
  });
  return {
    confirmed: conclusions.filter((item) => item.engineer_decision === 'confirmed').map(shape),
    rejected: conclusions.filter((item) => item.engineer_decision === 'rejected').map(shape),
    pending: conclusions.filter((item) => item.engineer_decision === 'pending').map(shape),
    stats: {
      total: conclusions.length,
      confirmed: conclusions.filter((item) => item.engineer_decision === 'confirmed').length,
      rejected: conclusions.filter((item) => item.engineer_decision === 'rejected').length,
      pending: conclusions.filter((item) => item.engineer_decision === 'pending').length,
    },
  };
}

/** 读取一次诊断分析及其全部结论，作为 8D 生成的输入上下文。 */
export async function loadEightDContext(analysisId: number): Promise<EightDAnalysisContext | null> {
  const run = await dbClient.queryOne<Row>('SELECT * FROM ppr_analysis_run WHERE id=?', [analysisId]);
  if (!run) return null;
  const alertContext = await loadAlertAgentContext(Number(run.alert_id));
  if (!alertContext) return null;
  const rows = await dbClient.queryAll<Row>(
    `SELECT id, sort_no, category, hypothesis, evidence, missing_evidence, validation_action,
      confidence, evidence_source_ids, engineer_decision, engineer_comment, actual_finding
     FROM ppr_analysis_conclusion WHERE analysis_id=? ORDER BY sort_no, id`,
    [analysisId]
  );
  const conclusions = rows.map((row) => {
    let sourceIds: unknown = row.evidence_source_ids;
    if (typeof sourceIds === 'string') {
      try { sourceIds = JSON.parse(sourceIds); } catch { /* 保留原字符串 */ }
    }
    return {
      ...row,
      confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
      evidence_source_ids: sourceIds,
    } as EightDConclusionInput;
  });
  return {
    ...alertContext,
    analysis_id: Number(run.id),
    run_no: String(run.run_no),
    run_status: String(run.status),
    summary: String(run.summary || ''),
    engine_type: String(run.engine_type || 'rule'),
    analysis_model_name: run.model_name ? String(run.model_name) : null,
    conclusions,
  };
}

const TOOL_LABELS: Record<string, string> = {
  get_diagnosis_result: '读取诊断摘要、结论卡片与工程师验证记录',
};

function summarizeToolOutput(output: unknown): string {
  if (Array.isArray(output)) return `返回 ${output.length} 条记录`;
  if (output && typeof output === 'object') return `返回 ${Object.keys(output as Record<string, unknown>).length} 个字段`;
  return output == null ? '未返回可用数据' : '已返回结果';
}

async function trace<T>(
  items: ToolTraceItem[],
  name: string,
  input: unknown,
  reporter: AnalysisProgressReporter | undefined,
  action: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  await reportAnalysisProgress(reporter, {
    stage: 'tool', status: 'running', tool: name,
    message: TOOL_LABELS[name] || `调用工具 ${name}`,
    detail: Object.keys((input as Record<string, unknown>) || {}).length ? JSON.stringify(input) : undefined,
  });
  try {
    const output = await action();
    const durationMs = Date.now() - start;
    items.push({ tool: name, input, output, startedAt: new Date(start).toISOString(), durationMs });
    await reportAnalysisProgress(reporter, {
      stage: 'tool', status: 'success', tool: name,
      message: `${TOOL_LABELS[name] || name}完成`,
      detail: `${summarizeToolOutput(output)}，耗时 ${durationMs} ms`,
    });
    return output;
  } catch (error) {
    await reportAnalysisProgress(reporter, {
      stage: 'tool', status: 'error', tool: name,
      message: `${TOOL_LABELS[name] || name}失败`,
      detail: error instanceof Error ? error.message : '未知错误',
    });
    throw error;
  }
}

/**
 * 8D 生成 Agent 的只读工具集：
 * 复用诊断 Agent 的预警/批次/设备/参考/限值白名单工具，再补一个「诊断摘要 + 结论卡片 + 工程师记录」工具。
 */
function createEightDAgentTools(
  context: EightDAnalysisContext,
  traces: ToolTraceItem[],
  reporter?: AnalysisProgressReporter
) {
  const getDiagnosisResult = tool(
    async () => trace(traces, 'get_diagnosis_result', {}, reporter, async () => {
      const grouped = groupConclusions(context.conclusions);
      return {
        analysisId: context.analysis_id,
        runNo: context.run_no,
        engineType: context.engine_type,
        modelName: context.analysis_model_name,
        diagnosisSummary: context.summary,
        engineerReviewStats: grouped.stats,
        confirmedConclusions: grouped.confirmed,
        rejectedConclusions: grouped.rejected,
        pendingConclusions: grouped.pending,
        note: 'diagnosisSummary 是上一步诊断 Agent 的分析意见；只有 engineerDecision=confirmed 的结论可写入 D4 已确认根因。',
      };
    }),
    {
      name: 'get_diagnosis_result',
      description: '获取诊断分析摘要、逐条结论卡片（假设、支持证据、缺失证据、建议验证动作）以及工程师填写的实际发现、工程师意见和确认/否决判定。生成 8D 前必须调用。',
      schema: z.object({}),
    }
  );

  return [
    ...createQualityAgentTools(context, traces, reporter),
    getDiagnosisResult,
  ];
}

function summarizeMessages(messages: unknown[]) {
  return messages.map((message) => {
    const item = message as Record<string, unknown> & { getType?: () => string };
    return {
      type: typeof item.getType === 'function' ? item.getType() : 'unknown',
      content: item.content,
      tool_calls: item.tool_calls,
      usage_metadata: item.usage_metadata,
      name: item.name,
    };
  });
}

function collectUsage(messages: unknown[]): Record<string, unknown> {
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  for (const message of messages) {
    const usage = (message as { usage_metadata?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } }).usage_metadata;
    inputTokens += usage?.input_tokens || 0;
    outputTokens += usage?.output_tokens || 0;
    totalTokens += usage?.total_tokens || 0;
  }
  return { inputTokens, outputTokens, totalTokens };
}

/** 调用 LangChain Agent，把诊断结论与工程师验证记录整理为 D1–D8 结构化草稿。 */
export async function generateEightDAgentReport(
  analysisId: number,
  config: QualityAgentConfig,
  reporter?: AnalysisProgressReporter,
  draftReporter?: EightDDraftReporter
): Promise<EightDGenerationResult> {
  if (!config.apiKey) throw new Error('Agent模式未配置API密钥');
  const startedAt = Date.now();

  await reportAnalysisProgress(reporter, { stage: 'preparing', status: 'running', message: '正在读取诊断分析、结论卡片与工程师验证记录' });
  const context = await loadEightDContext(analysisId);
  if (!context) throw new Error('分析任务不存在');
  const confirmed = context.conclusions.filter((item) => item.engineer_decision === 'confirmed').length;
  const rejected = context.conclusions.filter((item) => item.engineer_decision === 'rejected').length;
  const pending = context.conclusions.length - confirmed - rejected;
  await reportAnalysisProgress(reporter, {
    stage: 'preparing', status: 'success',
    message: `已锁定事件 ${context.event_no} 与批次 ${context.batch_no}`,
    detail: `${context.conclusions.length} 条结论：确认 ${confirmed} / 否决 ${rejected} / 待验证 ${pending}`,
  });
  if (confirmed === 0) {
    await reportAnalysisProgress(reporter, {
      stage: 'preparing', status: 'warning',
      message: '当前没有工程师已确认的结论，D4 只能写待验证假设',
      detail: '报告不会把未确认的诊断假设写成根因；请返回结论卡片完成确认以获得更完整的 D4',
    });
  }

  const toolTrace: ToolTraceItem[] = [];
  const tools = createEightDAgentTools(context, toolTrace, reporter);

  await reportAnalysisProgress(reporter, {
    stage: 'model', status: 'running', message: `正在初始化模型 ${config.model}`,
    detail: config.useResponsesApi ? 'Responses API' : `Chat Completions · thinking ${config.thinkingMode}`,
  });
  const model = new ChatOpenAI({
    model: config.model,
    apiKey: config.apiKey,
    useResponsesApi: config.useResponsesApi,
    timeout: config.timeoutMs,
    maxRetries: 2,
    reasoning: !config.useResponsesApi || config.reasoningEffort === 'none' ? undefined : { effort: config.reasoningEffort },
    modelKwargs: !config.useResponsesApi && config.thinkingMode !== 'auto'
      ? { thinking: { type: config.thinkingMode } }
      : undefined,
    configuration: config.baseUrl ? { baseURL: config.baseUrl } : undefined,
  });

  const agent = createAgent({
    model,
    tools,
    systemPrompt: SYSTEM_PROMPT,
    responseFormat: toolStrategy(EightDReportSchema),
  });

  await reportAnalysisProgress(reporter, {
    stage: 'model', status: 'running', message: '模型开始核对事实并按 D1–D8 组织报告结构',
    detail: 'D1–D8 会随生成实时写入报告页输入框，只展示可审计工具与证据轨迹，不展示模型内部隐式思维链',
  });

  /**
   * 流式消费而不是 invoke：`toolStrategy` 的结构化输出就是一次工具调用的参数，
   * 网关会按增量块推下来，逐块解析即可把字段内容实时填进页面。
   *
   * 关键点：工具调用的 `index` 在每一轮模型回复里都从 0 重新开始，
   * 所以不能按 index 归并——数据工具和结构化输出的参数会拼成一段非法 JSON。
   * 这里按 tool call 的 `id` 分开累积（每个 tool call 的首块都会带 id），
   * 这样既不用知道策略工具叫什么名字，也不会把两次调用混在一起。
   */
  const toolCallKeyByIndex = new Map<number, string>();
  const parsers = new Map<string, ReturnType<typeof createEightDFieldParser>>();
  const pendingDrafts = new Map<string, EightDDraftEvent>();
  let lastFlushAt = 0;
  const flushDrafts = (force = false) => {
    if (!pendingDrafts.size || !draftReporter) { pendingDrafts.clear(); return; }
    const now = Date.now();
    // 时间节流：同一字段只推最新文本（帧里带的是完整文本，不是增量），
    // 但字段开始/结束这类边界必须立刻推，否则页面会晚一步看到字段切换。
    if (!force && now - lastFlushAt < DRAFT_FLUSH_INTERVAL_MS) return;
    lastFlushAt = now;
    for (const event of pendingDrafts.values()) draftReporter(event);
    pendingDrafts.clear();
  };

  const messageStream = await agent.stream({
    messages: [{
      role: 'user',
      content: `请为分析任务 ${context.run_no}（事件 ${context.event_no}，批次 ${context.batch_no}，异常指标 ${context.metric_code}）生成 8D 报告草稿。
必须按顺序完成：先读取事件与规格事实，再读取诊断摘要、结论卡片和工程师填写的实际发现与工程师意见，然后核对同批次检验序列、异常时段设备数据和同规格正常参考，最后按 D1–D8 输出。
D4 必须区分「已确认根因」「已排除项」「仍待验证假设」三类，并写入工程师的实际发现与意见；没有已确认结论时明确写“根因尚未确认”。D5–D8 只能写候选措施与计划，并标注待批准或尚无验证结果。工具未返回的数据一律写入缺失证据。`,
    }],
  }, {
    streamMode: 'messages',
    recursionLimit: config.maxToolRounds * 2 + 4,
  });

  const streamedMessages: unknown[] = [];
  for await (const item of messageStream) {
    const message = (Array.isArray(item) ? item[0] : item) as {
      tool_call_chunks?: Array<{ index?: number; id?: string; args?: string }>;
      usage_metadata?: unknown;
    };
    if (message?.usage_metadata) streamedMessages.push(message);
    const chunks = message?.tool_call_chunks;
    if (!Array.isArray(chunks)) continue;
    for (const chunk of chunks) {
      const index = typeof chunk?.index === 'number' ? chunk.index : 0;
      // 新的一轮工具调用会在同一个 index 上带出新的 id，据此切成独立的累积缓冲。
      if (typeof chunk?.id === 'string' && chunk.id) toolCallKeyByIndex.set(index, chunk.id);
      if (typeof chunk?.args !== 'string' || !chunk.args.length) continue;
      const key = toolCallKeyByIndex.get(index) ?? `index-${index}`;
      let parser = parsers.get(key);
      if (!parser) { parser = createEightDFieldParser(); parsers.set(key, parser); }
      for (const event of parser.push(chunk.args)) pendingDrafts.set(event.field, event);
      flushDrafts();
    }
  }
  flushDrafts(true);

  await reportAnalysisProgress(reporter, { stage: 'validation', status: 'running', message: '工具调用结束，正在校验 8D 结构化输出' });

  /**
   * 权威结果只认流结束后完整的 JSON.parse + zod 校验，不认增量解析结果：
   * 增量解析只负责页面展示，万一它遇到边界情况，落库的报告内容也不会被污染。
   */
  let output: z.output<typeof EightDReportSchema> | null = null;
  let matched: ReturnType<typeof createEightDFieldParser> | null = null;
  for (const parser of parsers.values()) {
    if (!parser.hasFields()) continue;
    try {
      output = EightDReportSchema.parse(JSON.parse(parser.raw()));
      matched = parser;
      break;
    } catch {
      // 不是 8D 结构化输出（例如数据工具的参数），继续找下一个
    }
  }
  if (!output) throw new Error('Agent未返回符合Schema的8D结构化结果');

  // 对账：展示用的增量解析结果应当与权威结果逐字段一致；不一致只影响展示，不影响落库。
  if (matched && draftReporter) {
    const streamed = matched.snapshot();
    const authoritative = output as unknown as Record<string, unknown>;
    const drift = Object.keys(streamed).filter((field) => String(authoritative[field] ?? '') !== streamed[field]);
    if (drift.length) console.warn(`[8d-stream] 字段 ${drift.join('、')} 的流式文本与结构化输出不一致，页面已按最终结果覆盖`);
  }

  await reportAnalysisProgress(reporter, {
    stage: 'validation', status: 'success',
    message: '结构化校验通过，已生成 D1–D8 草稿内容',
    detail: `累计调用 ${toolTrace.length} 次数据工具`,
  });

  return {
    output,
    engineType: 'agent',
    modelName: config.model,
    promptVersion: PROMPT_VERSION,
    agentVersion: AGENT_VERSION,
    toolTrace,
    tokenUsage: collectUsage(streamedMessages),
    rawResponse: summarizeMessages(streamedMessages),
    latencyMs: Date.now() - startedAt,
  };
}
