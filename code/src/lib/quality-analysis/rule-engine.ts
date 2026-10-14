import { dbClient } from '@/lib/quality';
import { loadAlertAgentContext } from './data-tools';
import { reportAnalysisProgress, type AnalysisGenerationResult, type AnalysisProgressReporter, type QualityAnalysisOutput } from './types';

type Row = Record<string, unknown>;
const PROMPT_VERSION = 'rule-v2.0';

export async function generateRuleAnalysis(
  alertId: number,
  fallbackReason?: string,
  reporter?: AnalysisProgressReporter
): Promise<AnalysisGenerationResult> {
  const startedAt = Date.now();
  await reportAnalysisProgress(reporter, { stage: 'rule', status: 'running', message: '规则引擎正在读取预警与规格限值' });
  const alert = await loadAlertAgentContext(alertId);
  if (!alert) throw new Error('预警事件不存在');
  await reportAnalysisProgress(reporter, { stage: 'rule', status: 'running', message: '正在关联同批次产品趋势与按检验时刻距离排序的设备数据' });
  const measurements = await dbClient.queryAll<Row>(`SELECT * FROM ppr_product_measurement
    WHERE batch_id=? AND inspect_time<=? ORDER BY inspect_time DESC LIMIT 5`, [alert.batch_id, alert.inspect_time]);
  const readings = await dbClient.queryAll<Row>(`SELECT r.*, e.name AS equipment_name
    FROM ppr_equipment_reading r JOIN ppr_equipment e ON e.id=r.equipment_id
    WHERE r.batch_id=? ORDER BY ABS(TIMESTAMPDIFF(MINUTE,r.collect_time,?)) LIMIT 4`, [alert.batch_id, alert.inspect_time]);
  const metric = String(alert.metric_code);
  const valueMap: Record<string, string> = { outer_diameter: 'outer_diameter_mm', min_wall_thickness: 'min_wall_thickness_mm', ovality: 'ovality_mm' };
  const key = valueMap[metric] || 'outer_diameter_mm';
  const values = measurements.map((item) => Number(item[key])).filter(Number.isFinite).reverse();
  const delta = values.length > 1 ? values.at(-1)! - values[0] : 0;
  await reportAnalysisProgress(reporter, {
    stage: 'rule', status: 'success', message: '证据关联完成',
    detail: `产品记录 ${measurements.length} 条，设备记录 ${readings.length} 条`,
  });
  const output: QualityAnalysisOutput = {
    summary: `${alert.event_no} 在批次 ${alert.batch_no} 触发“${alert.rule_name}”。规则引擎已关联同批次检验与按检验时刻距离排序的设备数据，但尚未完成样管生产时间对齐；以下内容均为待工程师验证的排查线索。`,
    riskAssessment: { level: String(alert.risk_level) as QualityAnalysisOutput['riskAssessment']['level'], reason: String(alert.threshold_text || alert.rule_name) },
    conclusions: [
      {
        category: '触发规则与限值对照',
        hypothesis: `${alert.rule_name}：当前观测值 ${alert.observed_value ?? '无数据'} mm，${alert.threshold_text || '需复核适用限值'}。`,
        evidence: `支持证据：记录 ${alert.record_no} / 样管 ${alert.sample_no} / ${alert.inspect_time}，来源 ${alert.data_source}；反向或不支持证据：规则模式未复核量具、原始记录和测量方法。`,
        missingEvidence: '正式标准条款、量具状态、原始检验单与测量方法仍需现场确认。',
        validationAction: '预期伴随信号：复测结果与原始记录在同一测量条件下可重复；验证动作：复核样管身份、原始测量值、适用规格和测量方法，演示限值不直接等同合格判定。',
        confidence: 0.95,
        evidenceSourceIds: [String(alert.record_no), String(alert.event_no)],
      },
      {
        category: '变化趋势观察',
        hypothesis: values.length > 1 ? `最近 ${values.length} 个同批次可比较点由 ${values[0].toFixed(3)} 变化至 ${values.at(-1)!.toFixed(3)} mm，净变化 ${delta >= 0 ? '+' : ''}${delta.toFixed(3)} mm。` : '同批次可比较数据不足，暂不能形成趋势判断。',
        evidence: `支持证据：${measurements.map((item) => `${item.inspect_time}: ${item[key] ?? '无数据'} mm`).reverse().join('；') || '无可用趋势记录'}；反向或不支持证据：当前只读取异常时刻及之前最多 5 点，无法核对异常后的恢复情况。`,
        missingEvidence: '停机、换规格、生产连续性和检测延迟信息未完全确认。',
        validationAction: '预期伴随信号：若为真实过程趋势，相邻样管应出现方向一致且可重复的变化；验证动作：补齐异常前后连续抽检点并核对运行日志，区分连续趋势与离散波动。',
        confidence: values.length >= 3 ? 0.8 : 0.45,
        evidenceSourceIds: measurements.map((item) => String(item.record_no)),
      },
      {
        category: '设备时序待对齐',
        hypothesis: readings.length ? `同批次中按检验时刻距离关联到 ${readings.length} 条设备采集数据，可核查温度、压力与牵引速度是否存在相符变化，但不能称为该样管对应参数。` : '未关联到同批次设备数据，暂不能讨论设备因素。',
        evidence: `支持证据：${readings.map((item) => `${item.collect_time} ${item.equipment_name}: 温度${item.temperature_c ?? '-'}℃ / 压力${item.pressure_mpa ?? '-'}MPa / 牵引${item.haul_off_speed_mpm ?? '-'}m/min`).join('；') || '无可用设备证据'}；反向或不支持证据：尚未用生产时间、长度码、设备距离和检测延迟完成样管对齐。`,
        missingEvidence: '样管生产时间或长度码、设备至检测点距离、检测延迟、设备设定值、调机记录、报警和运行状态尚未接入。',
        validationAction: '预期伴随信号：若设备变化与尺寸异常相关，完成物料追踪后应在对应管段重复出现方向一致的尺寸响应；验证动作：先完成时序对齐，再由设备工程师核对设定值、反馈值、调机与报警记录。',
        confidence: readings.length ? 0.55 : 0.2,
        evidenceSourceIds: readings.map((item) => String(item.record_no)),
      },
    ],
    analysisLimitations: ['规则参数和限值为演示配置', '设备记录尚未与样管生产时间或长度码精确对齐', '没有计算因果关系', '最终根因和产品处置必须由工程师确认'],
  };
  await reportAnalysisProgress(reporter, { stage: 'validation', status: 'success', message: `规则分析完成，生成 ${output.conclusions.length} 条待验证结论` });
  return {
    output,
    evidenceSnapshot: { alert, measurements: measurements.slice().reverse(), readings },
    engineType: 'rule',
    promptVersion: PROMPT_VERSION,
    toolTrace: [],
    latencyMs: Date.now() - startedAt,
    fallbackReason,
  };
}
