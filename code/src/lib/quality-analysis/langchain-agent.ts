import { createAgent, toolStrategy } from 'langchain';
import { ChatOpenAI } from '@langchain/openai';
import { createConclusionParser } from './conclusion-stream';
import { createQualityAgentTools, loadAlertAgentContext } from './data-tools';
import {
  QualityAnalysisSchema,
  reportAnalysisProgress,
  type AnalysisGenerationResult,
  type AnalysisProgressReporter,
  type ConclusionDraftEvent,
  type ConclusionDraftReporter,
  type QualityAnalysisOutput,
  type ToolTraceItem,
} from './types';
import type { QualityAgentConfig } from './config';

const PROMPT_VERSION = 'quality-agent-v2.0';
const AGENT_VERSION = 'langchain-create-agent-v1';

/** 结论帧的最小推送间隔：模型可能每秒吐出上百个增量块，合并后再推给页面。 */
const DRAFT_FLUSH_INTERVAL_MS = 50;

const SYSTEM_PROMPT = `你是PPR管材过程质量异常分析Agent，同时采用塑料管道工艺工程师和高分子材料工程师的视角。你的任务是调用提供的只读工具获取证据，把质量症状沿“测量—挤出—口模—牵伸—真空定径—冷却冻结—牵引—离线收缩”成型链以及“熔体黏度/弹性—口模膨胀—熔体强度—分子取向—结晶—收缩/降解”材料链转化为供质量工程师验证的结构化假设。你不负责最终质量判定、根因确认或调机决策。

一、硬约束
1. 首先调用 get_alert_context。分析外径异常时，还必须调用 get_metric_definition、get_batch_measurements、get_equipment_window 和 get_reference_measurements；工具返回空记录也要作为证据缺口报告，不能只凭当前单点和指标字典下结论。分析其他指标时，根据事件需要调用其余工具。
2. 只使用工具返回的数据作为观察事实。不得编造记录、数值、标准条款、设备状态、工艺设定、米重/产量、真空、冷却、熔体温度、原料批次、材料检测或因果关系。
3. 严格区分：观察事实、待验证假设、反向/不支持证据、缺失证据、预期伴随信号和验证动作。时间接近、同批次共现或相关变化均不等于因果。
4. 判定限值只使用工具返回的当前产品规格限值。规格限值回答是否越界；同规格正常记录只回答与历史较好状态是否不同；工艺参数只用于原因排查，三类基准不得混用。演示或未审批限值不得表述为正式合格判定。
5. 工程师确认前不得宣称最终根因，不得给出自动放行、报废、停产或具体调机数值。验证动作必须可执行，并保留现场受控流程和人工批准。
6. 每条结论必须引用真实 evidenceSourceIds。confidence 只表示证据的完整性、可比性与时序匹配程度，不是根因概率；单点、跨批次可比性不足或仅同期相关时应降低 confidence。
7. 数据不足时明确暂停对应归因，不得为了凑结论猜测，也不得用通用机理冒充当前事件证据。

二、必须遵循的分析顺序
1. 测量与数据有效性：先核对事件、规格、样管、指标口径、数据来源和当前记录；检查外径与同截面最大/最小外径、不圆度、壁厚之间是否自洽。量具、测量温度、调节时间、截面位置或原始记录未提供时列入缺失证据。
2. 异常形态：根据现有数据说明是偏大、偏小、接近边界、不圆、连续趋势、离散波动或数据疑点。只有时间序列足够时才讨论周期、漂移或阶跃；没有在线/离线成对数据时，不得判断后收缩。
3. 三层对照：分别完成当前规格限值对照、同批次前序趋势、同规格正常参考记录对照。参考批次若未证明同产线、同口模/定径套、同层结构、同配方、同测量方法和相近速度，只能作为弱参考，不能称为控制限或最佳工艺窗口。
4. 时间对齐：检验时间不当然等于样管在机头、定径箱或测径仪处的生产时间。若缺少生产时间/长度码、设备到检测点距离、线速度和检测延迟，只能称“同批次且接近检验时刻的设备记录”，不得称“该样管对应参数”或“同期因果证据”。
5. 机理假设：先用外径、壁厚、不圆度和设备变化的组合缩小机制，再分别提出设备/生产外因与材料性能内因。不要把“温度、压力、牵引”机械罗列成三个根因，也不要为每个字段强行生成一条结论。
6. 竞争性验证：每个关键假设都要写出支持它的事实、削弱它的事实、缺什么、若成立还应看到什么，以及怎样用最小且受控的现场动作区分竞争假设。

三、外径异常的专业判读规则
1. 外径是结果变量，不与单一参数一一对应。最终外径由挤出量/线速度关系、口模膨胀与离模牵伸、真空定径接触、冷却冻结、牵引稳定性以及结晶和离线收缩共同决定。
2. 外径偏小且壁厚同步变薄时，可把“牵引相对挤出量升高或挤出量下降”列为待验证路径；只有观察到牵引、压力等相符变化时才算部分支持。定径能力充分时，牵引变化可能先反映为壁厚或米重变化，不能写成“牵引升高必然使外径变小”。
3. 外径偏大且最小/最大壁厚同步增大时，可把“相对供料量上升或线速度下降”列为待验证路径；仍需用米重、质量挤出量、螺杆转速和完成对齐的牵引记录区分。定径约束充分时，供料与速度变化也可能先表现为壁厚变化，不能写成“牵引降低必然使外径变大”。
4. 外径变化明显而最小/最大壁厚和不圆度没有相应变化时，应优先核查测量温度与方法、真空定径、冷却及离线收缩。现有最小/最大壁厚不能代替周向平均壁厚；当前工具没有真空、冷却、米重和在线/离线成对数据时，必须明确证据缺口。
5. 最小壁厚下降而最大壁厚稳定或上升、代表性外径大致稳定时，应优先验证壁厚偏心、机头芯模同心度、熔体周向分配和冷却/牵引偏载，不应仅归因为总挤出量不足。没有周向壁厚点位时只能形成弱假设。
6. 代表性外径与不圆度分开分析，并先确认 outer_diameter_mm 的测量口径；代表性外径偏移更偏向物料量—牵伸—定径—收缩链，不圆度升高更偏向周向冷却/真空不均、支撑下垂、壁厚偏心、定径接触或测量截面。不得用代表性外径正常否定局部不圆。
7. 时间形态用于定位机制而不是确认根因：孤立单点先查测量/取样；阶跃优先核查换料、调机、启停或测量方法变化；缓慢漂移关注热平衡、滤网/流道阻力、冷却能力和供料稳定性；周期波动关注供料、螺杆、牵引、真空/冷却控制周期或测量节拍。只有采样频率和时长足够且完成时间对齐时才能使用这些标签。
8. 温度方向不是固定因果。设备温度字段不等于真实熔体温度；温度会同时改变黏度、机头压力、口模膨胀、熔体强度、冷却负荷和结晶收缩。没有温区含义、设定/反馈和熔体温度时，只能提出条件式机理。
9. 压力主要是熔体输送、黏度和流动阻力的状态信号，不应直接命名为根因。应结合牵引、尺寸趋势、停机/换料/滤网/螺杆转速等证据区分产量变化、黏度变化或流道阻力变化。
10. 材料内因可包括MFR/分子量变化、热氧降解和停留时间、母料/填料及载体差异、污染或牌号切换、结晶与后收缩；多层管还包括层比和各层流变匹配。只有当前数据出现无法由外因充分解释的稳定偏移、换料线索或在线/离线差异时才提高其优先级。
11. 米重、质量挤出量、线速度和完整壁厚分布可用于质量守恒交叉验证；工具未返回这些数据时，只能把检查它们作为验证动作，禁止计算或声称质量守恒已经成立/失衡。
12. 材料检测按假设选择：MFR用于流动性/可能降解对比，DSC用于熔融结晶行为，密度与灰分/TGA用于组分或填料差异，FTIR用于污染/氧化线索，OIT或流变测试用于稳定性和黏弹性。不得无差别要求全部检测，也不得把检测建议写成已有结果。

四、结构化输出要求
1. 输出2到6条高信息量结论，优先覆盖：测量/数据有效性、异常形态与三层对照、最有区分度的设备/生产机理、必要时的材料机理。证据不足的因素可以合并为一条“暂不能归因”的结论。
2. category 使用明确领域名称。hypothesis 必须是可证伪的待验证陈述，并简述对应工艺或材料机理。
3. evidence 字段按“支持证据：...；反向或不支持证据：...”书写；没有反向记录时写明“现有工具未提供可核对的反向证据”，不得虚构。
4. missingEvidence 具体列出会改变判断的关键资料，不写笼统的“需要更多数据”。validationAction 按“预期伴随信号：...；验证动作：...”书写，并说明如何确认或排除该假设。
5. summary 必须概括异常形态、最有区分度的事实、当前优先验证路径和不能下结论的边界。riskAssessment 说明的是当前质量/诊断风险，不替代正式产品处置。
6. analysisLimitations 至少说明时间对齐、参考批次可比性、未接入工艺/材料字段或标准审批状态中实际存在的限制。
7. 使用简洁、专业、可审查的中文，不输出内部隐式思维链。`;

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

export async function generateLangChainAgentAnalysis(
  alertId: number,
  config: QualityAgentConfig,
  reporter?: AnalysisProgressReporter,
  conclusionReporter?: ConclusionDraftReporter
): Promise<AnalysisGenerationResult> {
  if (!config.apiKey) throw new Error('Agent模式未配置API密钥');
  const startedAt = Date.now();
  await reportAnalysisProgress(reporter, { stage: 'preparing', status: 'running', message: '正在读取预警事件与分析边界' });
  const context = await loadAlertAgentContext(alertId);
  if (!context) throw new Error('预警事件不存在');
  await reportAnalysisProgress(reporter, {
    stage: 'preparing', status: 'success', message: `已锁定事件 ${context.event_no} 与批次 ${context.batch_no}`,
    detail: `指标 ${context.metric_code}，触发规则 ${context.rule_name}`,
  });
  const toolTrace: ToolTraceItem[] = [];
  const tools = createQualityAgentTools(context, toolTrace, reporter);
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
    // 强制通过工具策略生成结构化输出，兼容更多支持函数调用的模型与OpenAI兼容网关。
    responseFormat: toolStrategy(QualityAnalysisSchema),
  });

  await reportAnalysisProgress(reporter, {
    stage: 'model', status: 'running', message: '模型开始规划取证步骤并调用质量数据工具',
    detail: '结论卡片会随生成逐条出现在页面下方；只展示可审计工具与证据轨迹，不展示模型内部隐式思维链',
  });

  /**
   * 流式消费而不是 invoke：`toolStrategy` 的结构化输出就是一次工具调用的参数，
   * 网关会把参数按增量块推下来，逐块解析即可把结论卡片逐条送到页面。
   *
   * 与 8D 生成同一套做法：工具调用的 `index` 在每一轮模型回复里都从 0 重新开始，
   * 所以按 tool call 的 `id` 分开累积（每个 tool call 的首块都会带 id），
   * 数据工具的 JSON 不会命中 conclusions，两次调用也不会被拼到一起。
   */
  const toolCallKeyByIndex = new Map<number, string>();
  const parsers = new Map<string, ReturnType<typeof createConclusionParser>>();
  const pendingFrames = new Map<number, ConclusionDraftEvent>();
  let lastFlushAt = 0;
  const flushFrames = (force = false) => {
    if (!pendingFrames.size || !conclusionReporter) { pendingFrames.clear(); return; }
    const now = Date.now();
    // 时间节流：同一条结论只推最新文本（帧里带的是完整字段，不是增量），
    // 但结论开始/结束这类边界必须立刻推，否则页面会晚一步看到卡片切换。
    if (!force && now - lastFlushAt < DRAFT_FLUSH_INTERVAL_MS) return;
    lastFlushAt = now;
    for (const event of [...pendingFrames.values()].sort((left, right) => left.index - right.index)) conclusionReporter(event);
    pendingFrames.clear();
  };

  const messageStream = await agent.stream({
    messages: [{
      role: 'user',
      content: `请分析预警事件 ${context.event_no}。当前触发规则为“${context.rule_name}”，异常指标为 ${context.metric_code}。请严格按“测量与数据有效性→异常形态→规格/同批次/正常参考三层对照→时间对齐→成型链与材料链竞争假设→反证及受控验证”的顺序先取证，再形成2到6条待工程师验证的结论。外径异常不得简化为单一工艺参数的直接因果；工具未提供的数据必须写入缺失证据，不得补造。`,
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
      if (!parser) { parser = createConclusionParser(); parsers.set(key, parser); }
      for (const event of parser.push(chunk.args)) pendingFrames.set(event.index, event);
      flushFrames();
    }
  }
  flushFrames(true);

  await reportAnalysisProgress(reporter, { stage: 'validation', status: 'running', message: '工具调用结束，正在校验结构化分析结果' });

  /**
   * 权威结果只认流结束后完整的 JSON.parse + zod 校验，不认增量解析结果：
   * 增量解析只负责页面展示，万一它遇到边界情况，落库的结论也不会被污染。
   */
  let output: QualityAnalysisOutput | null = null;
  for (const parser of parsers.values()) {
    if (!parser.hasConclusions()) continue;
    try {
      output = QualityAnalysisSchema.parse(JSON.parse(parser.raw()));
      break;
    } catch {
      // 不是诊断结构化输出（例如数据工具的参数），继续找下一个
    }
  }
  if (!output) throw new Error('Agent未返回符合Schema的结构化分析结果');
  const messages = streamedMessages;
  await reportAnalysisProgress(reporter, {
    stage: 'validation', status: 'success', message: `结构化校验通过，生成 ${output.conclusions.length} 条待验证结论`,
    detail: `累计调用 ${toolTrace.length} 次数据工具`,
  });

  return {
    output,
    evidenceSnapshot: { alert: context, toolEvidence: toolTrace },
    engineType: 'agent',
    modelName: config.model,
    promptVersion: PROMPT_VERSION,
    agentVersion: AGENT_VERSION,
    toolTrace,
    tokenUsage: collectUsage(messages),
    rawResponse: summarizeMessages(messages),
    latencyMs: Date.now() - startedAt,
  };
}
