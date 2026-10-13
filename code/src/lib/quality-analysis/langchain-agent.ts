import { createAgent, toolStrategy } from 'langchain';
import { ChatOpenAI } from '@langchain/openai';
import { createQualityAgentTools, loadAlertAgentContext } from './data-tools';
import { QualityAnalysisSchema, type AnalysisGenerationResult, type ToolTraceItem } from './types';
import type { QualityAgentConfig } from './config';

const PROMPT_VERSION = 'quality-agent-v1.0';
const AGENT_VERSION = 'langchain-create-agent-v1';

const SYSTEM_PROMPT = `你是PPR管材过程质量异常分析Agent。你的任务是调用提供的只读工具获取证据，并输出供质量工程师验证的结构化分析。

必须遵守：
1. 首先调用 get_alert_context；随后根据需要调用产品趋势、同期设备、参考批次和指标定义工具。
2. 只使用工具返回的数据，不得编造记录、数值、标准条款、设备状态或因果关系。
3. 区分“观察事实”“待验证假设”“缺失证据”“验证动作”。同期变化不代表因果。
4. 演示限值不能表述为正式合格判定；不得在工程师确认前宣称最终根因。
5. 每条结论必须列出证据来源编号，并给出0到1的置信度。置信度表示证据完备程度，不是根因概率。
6. 数据不足时明确说明不足，不要为了凑结论而猜测。
7. 使用简洁、专业的中文输出。`;

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

export async function generateLangChainAgentAnalysis(alertId: number, config: QualityAgentConfig): Promise<AnalysisGenerationResult> {
  if (!config.apiKey) throw new Error('Agent模式未配置API密钥');
  const startedAt = Date.now();
  const context = await loadAlertAgentContext(alertId);
  if (!context) throw new Error('预警事件不存在');
  const toolTrace: ToolTraceItem[] = [];
  const tools = createQualityAgentTools(context, toolTrace);
  const useResponsesApi = process.env.QUALITY_AGENT_USE_RESPONSES_API !== 'false';

  const model = new ChatOpenAI({
    model: config.model,
    apiKey: config.apiKey,
    useResponsesApi,
    timeout: config.timeoutMs,
    maxRetries: 2,
    reasoning: config.reasoningEffort === 'none' ? undefined : { effort: config.reasoningEffort },
    configuration: config.baseUrl ? { baseURL: config.baseUrl } : undefined,
  });

  const agent = createAgent({
    model,
    tools,
    systemPrompt: SYSTEM_PROMPT,
    // 强制通过工具策略生成结构化输出，兼容更多支持函数调用的模型与OpenAI兼容网关。
    responseFormat: toolStrategy(QualityAnalysisSchema),
  });

  const result = await agent.invoke({
    messages: [{
      role: 'user',
      content: `请分析预警事件 ${context.event_no}。必须先取证，再形成2到6条待工程师验证的结论。当前触发规则为“${context.rule_name}”，异常指标为 ${context.metric_code}。`,
    }],
  }, {
    recursionLimit: config.maxToolRounds * 2 + 4,
  });

  if (!result.structuredResponse) throw new Error('Agent未返回符合Schema的结构化分析结果');
  const output = QualityAnalysisSchema.parse(result.structuredResponse);
  const messages = Array.isArray(result.messages) ? result.messages : [];

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
