import { getConfigFlag, getConfigNumber, getConfigValue } from '@/lib/system-config';

export type QualityAnalysisMode = 'rule' | 'agent';

export interface QualityAgentConfig {
  mode: QualityAnalysisMode;
  configured: boolean;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  fallbackToRule: boolean;
  maxToolRounds: number;
  timeoutMs: number;
  reasoningEffort: 'none' | 'minimal' | 'low' | 'medium' | 'high';
  useResponsesApi: boolean;
  thinkingMode: 'auto' | 'enabled' | 'disabled';
}

function normalizeMode(value: string | null | undefined): QualityAnalysisMode {
  return value === 'agent' ? 'agent' : 'rule';
}

/**
 * 分析模式优先读取 system_config，环境变量作为部署级默认值。
 * API 密钥只允许来自环境变量，禁止写入数据库。
 */
export async function getQualityAgentConfig(requestedMode?: QualityAnalysisMode): Promise<QualityAgentConfig> {
  const storedMode = await getConfigValue('quality_analysis_mode');
  const mode = requestedMode ?? normalizeMode(storedMode ?? process.env.QUALITY_ANALYSIS_MODE);
  const model = (await getConfigValue('quality_agent_model')) || process.env.QUALITY_AGENT_MODEL || 'gpt-6-luna';
  const apiKey = process.env.QUALITY_AGENT_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = process.env.QUALITY_AGENT_BASE_URL || process.env.OPENAI_BASE_URL;
  const fallbackToRule = await getConfigFlag(
    'quality_agent_fallback_to_rule',
    process.env.QUALITY_AGENT_FALLBACK_TO_RULE !== 'false'
  );
  const maxToolRounds = await getConfigNumber(
    'quality_agent_max_tool_rounds',
    Number(process.env.QUALITY_AGENT_MAX_TOOL_ROUNDS || 8)
  );
  const timeoutMs = Number(process.env.QUALITY_AGENT_TIMEOUT_MS || 90000);
  const configuredEffort = (await getConfigValue('quality_agent_reasoning_effort')) || process.env.QUALITY_AGENT_REASONING_EFFORT || 'low';
  const reasoningEffort = ['none', 'minimal', 'low', 'medium', 'high'].includes(configuredEffort)
    ? configuredEffort as QualityAgentConfig['reasoningEffort']
    : 'low';
  const useResponsesApi = process.env.QUALITY_AGENT_USE_RESPONSES_API !== 'false';
  const configuredThinkingMode = process.env.QUALITY_AGENT_THINKING_MODE || (useResponsesApi ? 'auto' : 'disabled');
  const thinkingMode = ['auto', 'enabled', 'disabled'].includes(configuredThinkingMode)
    ? configuredThinkingMode as QualityAgentConfig['thinkingMode']
    : 'disabled';

  return {
    mode,
    configured: Boolean(apiKey),
    model,
    apiKey,
    baseUrl,
    fallbackToRule,
    maxToolRounds: Math.max(2, Math.min(20, maxToolRounds)),
    timeoutMs: Math.max(10000, Math.min(300000, timeoutMs)),
    reasoningEffort,
    useResponsesApi,
    thinkingMode,
  };
}
