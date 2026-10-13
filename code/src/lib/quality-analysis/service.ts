import { getQualityAgentConfig, type QualityAnalysisMode } from './config';
import { generateLangChainAgentAnalysis } from './langchain-agent';
import { generateRuleAnalysis } from './rule-engine';
import type { AnalysisGenerationResult } from './types';

/** 根据系统配置选择规则引擎或LangChain Agent；Agent失败时可配置自动降级。 */
export async function generateQualityAnalysis(
  alertId: number,
  requestedMode?: QualityAnalysisMode
): Promise<{ result: AnalysisGenerationResult; configuredMode: QualityAnalysisMode; agentConfigured: boolean }> {
  const config = await getQualityAgentConfig(requestedMode);
  if (config.mode === 'rule') {
    return { result: await generateRuleAnalysis(alertId), configuredMode: config.mode, agentConfigured: config.configured };
  }
  if (!config.configured) {
    const reason = 'Agent模式已启用，但未配置 QUALITY_AGENT_API_KEY 或 OPENAI_API_KEY';
    if (!config.fallbackToRule) throw new Error(reason);
    return { result: await generateRuleAnalysis(alertId, reason), configuredMode: config.mode, agentConfigured: false };
  }
  try {
    return { result: await generateLangChainAgentAnalysis(alertId, config), configuredMode: config.mode, agentConfigured: true };
  } catch (error) {
    const reason = `LangChain Agent调用失败：${error instanceof Error ? error.message : '未知错误'}`;
    if (!config.fallbackToRule) throw error;
    return { result: await generateRuleAnalysis(alertId, reason), configuredMode: config.mode, agentConfigured: true };
  }
}
