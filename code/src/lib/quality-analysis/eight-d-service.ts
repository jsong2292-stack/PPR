import { dbClient } from '@/lib/quality';
import { getQualityAgentConfig, type QualityAnalysisMode } from './config';
import { generateEightDAgentReport, loadEightDContext, type EightDAnalysisContext, type EightDConclusionInput } from './eight-d-agent';
import { reportAnalysisProgress, type AnalysisProgressReporter, type EightDDraftReporter, type EightDGenerationResult, type EightDReportOutput } from './types';

const TEMPLATE_PROMPT_VERSION = 'quality-8d-template-v1.0';

/** 事件限值按指标取列，与诊断页判定依据卡片、判定引擎 resolveRange 的口径一致。 */
const limitColumns: Record<string, { lower?: string; upper: string }> = {
  outer_diameter: { lower: 'outer_lower_mm', upper: 'outer_upper_mm' },
  min_wall_thickness: { lower: 'wall_lower_mm', upper: 'wall_upper_mm' },
  ovality: { upper: 'ovality_upper_mm' },
};

const toNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** 限值区间与偏差文字，供规则模板的 D2 使用。 */
function limitBreakdown(context: EightDAnalysisContext) {
  const config = limitColumns[String(context.metric_code)];
  const upper = config ? toNumber(context[config.upper]) : null;
  const lower = config ? (config.lower ? toNumber(context[config.lower]) ?? 0 : 0) : null;
  const observed = toNumber(context.observed_value);
  const interval = upper === null ? '限值待确认' : lower === null ? `≤ ${upper.toFixed(3)} mm` : `${lower.toFixed(3)} mm–${upper.toFixed(3)} mm`;
  let deviation = '偏差待确认';
  if (observed !== null && upper !== null && lower !== null) {
    if (observed > upper) deviation = `高于上限 ${(observed - upper).toFixed(3)} mm`;
    else if (observed < lower) deviation = `低于下限 ${(lower - observed).toFixed(3)} mm`;
    else deviation = '落在标准区间内';
  }
  return { interval, observed, deviation };
}

async function metricName(code: unknown) {
  const metric = await dbClient.queryOne<Record<string, unknown>>('SELECT name, unit FROM ppr_metric WHERE code=?', [String(code ?? '')]);
  return metric ? String(metric.name) : String(code ?? '异常指标');
}

/** 把一条结论卡片整理成 8D 的根因条目文本，确认类必须带上工程师的实际发现与意见。 */
function conclusionBlock(item: EightDConclusionInput, index: number) {
  const lines = [
    `${index + 1}. 【${item.category}】${item.hypothesis}`,
  ];
  if (item.engineer_decision === 'confirmed') {
    lines.push(`   实际发现：${item.actual_finding || '工程师已确认，但未填写实际发现，待补充'}`);
    lines.push(`   工程师意见：${item.engineer_comment || '未填写'}`);
  } else if (item.engineer_decision === 'rejected') {
    lines.push(`   否决理由：${item.engineer_comment || '未填写'}`);
    if (item.actual_finding) lines.push(`   实际发现：${item.actual_finding}`);
  } else {
    lines.push('   状态：未经工程师确认，不能作为根因');
    lines.push(`   支持证据：${item.evidence || '无'}`);
    lines.push(`   缺失证据：${item.missing_evidence || '待补充'}`);
    lines.push(`   建议验证动作：${item.validation_action || '待补充'}`);
  }
  return lines.join('\n');
}

/**
 * 规则模板降级：不调用大模型，只用真实数据拼装 D1–D4，并把 D5–D8 留成明确的待办占位。
 * 只有 Agent 不可用（未配置密钥或调用失败且允许降级）时才会走到这里。
 */
export async function buildEightDTemplate(
  analysisId: number,
  fallbackReason?: string,
  reporter?: AnalysisProgressReporter
): Promise<EightDGenerationResult> {
  const startedAt = Date.now();
  await reportAnalysisProgress(reporter, { stage: 'rule', status: 'running', message: '规则模板模式：按事件事实与结论卡片拼装 8D 草稿' });
  const context = await loadEightDContext(analysisId);
  if (!context) throw new Error('分析任务不存在');
  const { interval, observed, deviation } = limitBreakdown(context);
  const label = await metricName(context.metric_code);
  const confirmed = context.conclusions.filter((item) => item.engineer_decision === 'confirmed');
  const rejected = context.conclusions.filter((item) => item.engineer_decision === 'rejected');
  const pending = context.conclusions.filter((item) => item.engineer_decision === 'pending');

  const d1 = [
    '质量工程师（主责）：负责结论验证、根因确认与报告定稿。',
    '生产领班：负责现场记录、异常时段产品隔离与临时处置执行。',
    '设备工程师：负责设备运行记录与工艺参数核查。',
    '检验员：负责异常时段产品的加密复测与原始记录核对。',
    '成员姓名、批准人与具体分工待确认。',
  ].join('\n');

  const d2 = [
    `【What 问题】${context.spec_name} / 批次 ${context.batch_no} 的${label}触发“${context.rule_name}”。`,
    `【Where 发生位置】生产批次 ${context.batch_no}，生产班组 ${context.production_group || '待确认'}；具体机台与工序位置待确认。`,
    `【When 时间】异常检验时刻 ${context.inspect_time}；检验时间不等于该样管在机头的生产时间，生产时间与检测延迟待确认。`,
    `【Which 判定依据】标准区间 ${interval}，实测值 ${observed === null ? '无数据' : `${observed.toFixed(3)} mm`}，${deviation}；触发规则 ${context.rule_code} · ${context.rule_name}。`,
    `【How 异常形态】${context.threshold_text || '触发阈值文本待确认'}。`,
    `【Who 涉及】质量工程师、生产领班、设备工程师、检验员；影响客户与出货情况待确认。`,
    `【How much 影响范围】按异常时段估算涉及长度待核定；估算值不等于实际隔离量。`,
  ].join('\n');

  const d3 = [
    `隔离异常检验时刻（${context.inspect_time}）前后的相关产品与在制品，隔离范围由质量工程师最终核定。`,
    '核对原始检验记录与设备运行记录，确认异常时段是否有换料、调机、启停或测量方法变化。',
    '对隔离范围产品加密复测，复测频次与判定口径由质量工程师确认。',
    confirmed.length
      ? `结合已确认结论补充围堵：${confirmed.map((item) => item.validation_action || item.hypothesis).join('；')}`
      : '尚无工程师确认的结论，围堵措施暂按上述通用动作执行，完成后需回填实际执行情况。',
  ].join('\n');

  const d4 = confirmed.length
    ? [
      '一、已确认根因（来源：工程师确认的结论卡片）',
      confirmed.map((item, index) => conclusionBlock(item, index)).join('\n'),
      '',
      '二、已排除或已否决的原因',
      rejected.length ? rejected.map((item, index) => conclusionBlock(item, index)).join('\n') : '无',
      '',
      '三、仍待验证的假设（未经确认，不能作为根因）',
      pending.length ? pending.map((item, index) => conclusionBlock(item, index)).join('\n') : '无',
    ].join('\n')
    : [
      '一、根因尚未确认',
      '当前没有工程师已确认的结论，本报告不能给出根因。请返回诊断页完成结论验证后再定稿。',
      '',
      '二、待验证假设（未经确认，不能作为根因）',
      context.conclusions.length
        ? context.conclusions.map((item, index) => conclusionBlock(item, index)).join('\n')
        : '本次分析没有结论卡片，无法形成根因假设。',
      '',
      '三、诊断分析摘要（Agent 意见，非工程师结论）',
      context.summary || '无',
    ].join('\n');

  const firstConfirmed = confirmed[0];
  const d5 = firstConfirmed
    ? [`围绕已确认根因【${firstConfirmed.category}】选择永久纠正措施：`, `- ${firstConfirmed.validation_action || '纠正措施待工程师填写'}`, '候选措施需要质量工程师与现场负责人批准后实施；规则模板不代为选定措施。'].join('\n')
    : '尚无已确认根因，永久纠正措施待根因确认后填写。';
  const d6 = '待填写：实施步骤、责任角色、验证批次与判定口径；规则模板不生成实施与验证结论，需工程师在措施实施后回填结果。';
  const d7 = '待填写：需要更新的检验频次、预警规则阈值、设备点检标准与作业指导书；阈值变更需业务确认。';
  const d8 = confirmed.length
    ? '待确认：完成 D5–D7 实施与效果验证、补齐遗留事项后，由质量工程师与生产负责人确认结案并完成团队认可。'
    : '根因尚未确认，暂不具备结案条件。';

  const output: EightDReportOutput = {
    title: `${context.event_no} ${context.batch_no} ${label}过程质量异常8D报告`,
    d1, d2, d3, d4, d5, d6, d7, d8,
  };

  await reportAnalysisProgress(reporter, {
    stage: 'rule', status: 'success',
    message: `规则模板已生成 D1–D4（确认 ${confirmed.length} / 否决 ${rejected.length} / 待验证 ${pending.length}）`,
    detail: 'D5–D8 保留为待工程师填写项，模板不会代写未发生的措施与结果',
  });

  return {
    output,
    engineType: 'rule',
    promptVersion: TEMPLATE_PROMPT_VERSION,
    toolTrace: [],
    latencyMs: Date.now() - startedAt,
    fallbackReason,
  };
}

/**
 * 8D 生成入口：按系统配置调用 8D 生成 Agent，失败时可降级到规则模板。
 * 与诊断分析共用 quality_analysis_mode / quality_agent_* 配置，避免出现两套模型设置。
 */
export async function generateEightD(
  analysisId: number,
  requestedMode?: QualityAnalysisMode,
  reporter?: AnalysisProgressReporter,
  draftReporter?: EightDDraftReporter
): Promise<{ result: EightDGenerationResult; configuredMode: QualityAnalysisMode; agentConfigured: boolean }> {
  const config = await getQualityAgentConfig(requestedMode);
  await reportAnalysisProgress(reporter, {
    stage: 'preparing', status: 'success',
    message: `8D 生成已选择${config.mode === 'agent' ? 'LangChain Agent' : '规则模板'}模式`,
    detail: config.mode === 'agent' ? `模型 ${config.model}` : '本次生成不调用外部模型',
  });
  if (config.mode === 'rule') {
    return { result: await buildEightDTemplate(analysisId, undefined, reporter), configuredMode: config.mode, agentConfigured: config.configured };
  }
  if (!config.configured) {
    const reason = 'Agent模式已启用，但未配置 QUALITY_AGENT_API_KEY 或 OPENAI_API_KEY';
    await reportAnalysisProgress(reporter, { stage: 'fallback', status: 'warning', message: 'Agent不可用，准备降级到规则模板', detail: reason });
    if (!config.fallbackToRule) throw new Error(reason);
    return { result: await buildEightDTemplate(analysisId, reason, reporter), configuredMode: config.mode, agentConfigured: false };
  }
  try {
    return { result: await generateEightDAgentReport(analysisId, config, reporter, draftReporter), configuredMode: config.mode, agentConfigured: true };
  } catch (error) {
    const reason = `8D 生成 Agent 调用失败：${error instanceof Error ? error.message : '未知错误'}`;
    await reportAnalysisProgress(reporter, { stage: 'fallback', status: 'warning', message: 'Agent调用失败，准备降级到规则模板', detail: reason });
    if (!config.fallbackToRule) throw error;
    return { result: await buildEightDTemplate(analysisId, reason, reporter), configuredMode: config.mode, agentConfigured: true };
  }
}
