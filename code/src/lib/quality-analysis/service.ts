import { getQualityAgentConfig, type QualityAnalysisMode } from './config';
import { generateLangChainAgentAnalysis } from './langchain-agent';
import { generateRuleAnalysis } from './rule-engine';
import { reportAnalysisProgress, type AnalysisGenerationResult, type AnalysisProgressReporter, type ConclusionDraftReporter } from './types';

/** 根据系统配置选择规则引擎或LangChain Agent；Agent失败时可配置自动降级。 */
export async function generateQualityAnalysis(
  alertId: number,
  requestedMode?: QualityAnalysisMode,
  reporter?: AnalysisProgressReporter,
  conclusionReporter?: ConclusionDraftReporter
): Promise<{ result: AnalysisGenerationResult; configuredMode: QualityAnalysisMode; agentConfigured: boolean }> {
  const config = await getQualityAgentConfig(requestedMode);
  await reportAnalysisProgress(reporter, {
    stage: 'preparing', status: 'success',
    message: `已选择${config.mode === 'agent' ? 'LangChain Agent' : '规则引擎'}模式`,
    detail: config.mode === 'agent' ? `模型 ${config.model}` : '本次分析不调用外部模型',
  });
  if (config.mode === 'rule') {
    return { result: await generateRuleAnalysis(alertId, undefined, reporter), configuredMode: config.mode, agentConfigured: config.configured };
  }
  if (!config.configured) {
    const reason = 'Agent模式已启用，但未配置 QUALITY_AGENT_API_KEY 或 OPENAI_API_KEY';
    await reportAnalysisProgress(reporter, { stage: 'fallback', status: 'warning', message: 'Agent不可用，准备降级到规则引擎', detail: reason });
    if (!config.fallbackToRule) throw new Error(reason);
    return { result: await generateRuleAnalysis(alertId, reason, reporter), configuredMode: config.mode, agentConfigured: false };
  }
  try {
    return { result: await generateLangChainAgentAnalysis(alertId, config, reporter, conclusionReporter), configuredMode: config.mode, agentConfigured: true };
  } catch (error) {
    const reason = `LangChain Agent调用失败：${error instanceof Error ? error.message : '未知错误'}`;
    await reportAnalysisProgress(reporter, { stage: 'fallback', status: 'warning', message: 'Agent调用失败，准备降级到规则引擎', detail: reason });
    if (!config.fallbackToRule) throw error;
    return { result: await generateRuleAnalysis(alertId, reason, reporter), configuredMode: config.mode, agentConfigured: true };
  }
}
