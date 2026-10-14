import { tool } from 'langchain';
import { z } from 'zod';
import { dbClient } from '@/lib/quality';
import { reportAnalysisProgress, type AnalysisProgressReporter, type ToolTraceItem } from './types';

type Row = Record<string, unknown>;

export interface AlertAgentContext extends Row {
  id: number;
  batch_id: number;
  spec_id: number;
  metric_code: string;
  inspect_time: string;
}

export async function loadAlertAgentContext(alertId: number): Promise<AlertAgentContext | null> {
  return dbClient.queryOne<AlertAgentContext>(`SELECT a.*, m.record_no, m.sample_no, m.inspect_time,
    m.outer_diameter_mm, m.min_wall_thickness_mm, m.max_wall_thickness_mm,
    m.max_outer_diameter_mm, m.min_outer_diameter_mm, m.ovality_mm, m.data_source,
    b.id AS batch_id, b.batch_no, b.production_group, b.spec_id,
    s.name AS spec_name, s.outer_lower_mm, s.outer_upper_mm,
    s.wall_lower_mm, s.wall_upper_mm, s.ovality_upper_mm
    FROM ppr_alert_event a
    JOIN ppr_product_measurement m ON m.id=a.measurement_id
    JOIN ppr_batch b ON b.id=m.batch_id
    JOIN ppr_product_spec s ON s.id=b.spec_id
    WHERE a.id=?`, [alertId]);
}

const TOOL_LABELS: Record<string, string> = {
  get_alert_context: '读取预警、批次与规格上下文',
  get_batch_measurements: '查询同批次产品检验序列',
  get_equipment_window: '查询异常时段设备采集数据',
  get_reference_measurements: '查询同规格正常参考批次',
  get_metric_definition: '读取指标口径与规格限值',
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

/** 创建只允许访问当前预警上下文的白名单工具，Agent 无法提交任意 SQL 或任意业务ID。 */
export function createQualityAgentTools(
  context: AlertAgentContext,
  traces: ToolTraceItem[],
  reporter?: AnalysisProgressReporter
) {
  const getAlertContext = tool(
    async () => trace(traces, 'get_alert_context', {}, reporter, async () => context),
    {
      name: 'get_alert_context',
      description: '获取当前预警事件、触发记录、生产批次、产品规格和限值。分析必须首先调用。',
      schema: z.object({}),
    }
  );

  const getBatchMeasurements = tool(
    async ({ limit }: { limit: number }) => trace(traces, 'get_batch_measurements', { limit }, reporter, async () => {
      const safeLimit = Math.max(3, Math.min(30, limit));
      return dbClient.queryAll<Row>(`SELECT id, record_no, sample_no, inspect_time,
        outer_diameter_mm, min_wall_thickness_mm, max_wall_thickness_mm,
        max_outer_diameter_mm, min_outer_diameter_mm, ovality_mm,
        data_source, quality_flag, remark
        FROM ppr_product_measurement
        WHERE batch_id=? AND inspect_time<=?
        ORDER BY inspect_time DESC LIMIT ?`, [context.batch_id, context.inspect_time, safeLimit]);
    }),
    {
      name: 'get_batch_measurements',
      description: '获取当前批次、异常时刻之前的外径、壁厚和不圆度检验序列，用于判断异常形态、尺寸组合、连续趋势和离散波动；检验时间不当然等于样管在设备处的生产时间。',
      schema: z.object({ limit: z.number().int().min(3).max(30).default(10) }),
    }
  );

  const getEquipmentWindow = tool(
    async ({ windowMinutes }: { windowMinutes: number }) => trace(traces, 'get_equipment_window', { windowMinutes }, reporter, async () => {
      const safeWindow = Math.max(30, Math.min(1440, windowMinutes));
      return dbClient.queryAll<Row>(`SELECT r.id, r.record_no, r.collect_time, r.temperature_c,
        r.pressure_mpa, r.haul_off_speed_mpm, r.data_source, r.remark,
        e.code AS equipment_code, e.name AS equipment_name, t.name AS equipment_type
        FROM ppr_equipment_reading r
        JOIN ppr_equipment e ON e.id=r.equipment_id
        JOIN ppr_equipment_type t ON t.id=e.type_id
        WHERE r.batch_id=? AND ABS(TIMESTAMPDIFF(MINUTE,r.collect_time,?))<=?
        ORDER BY r.collect_time`, [context.batch_id, context.inspect_time, safeWindow]);
    }),
    {
      name: 'get_equipment_window',
      description: '获取异常检验时刻前后的温度、压力和牵引速度记录。时间接近只能作为相关线索；未完成生产时间、长度码、距离和检测延迟对齐时，不得称为该样管对应参数或因果证据。',
      schema: z.object({ windowMinutes: z.number().int().min(30).max(1440).default(240) }),
    }
  );

  const getReferenceMeasurements = tool(
    async ({ limit }: { limit: number }) => trace(traces, 'get_reference_measurements', { limit }, reporter, async () => {
      const safeLimit = Math.max(3, Math.min(50, limit));
      return dbClient.queryAll<Row>(`SELECT m.id, m.record_no, m.inspect_time,
        m.outer_diameter_mm, m.min_wall_thickness_mm, m.max_wall_thickness_mm,
        m.max_outer_diameter_mm, m.min_outer_diameter_mm, m.ovality_mm,
        m.quality_flag, b.batch_no, b.production_group
        FROM ppr_product_measurement m
        JOIN ppr_batch b ON b.id=m.batch_id
        WHERE b.spec_id=? AND b.id<>? AND m.quality_flag='normal'
        ORDER BY m.inspect_time DESC LIMIT ?`, [context.spec_id, context.batch_id, safeLimit]);
    }),
    {
      name: 'get_reference_measurements',
      description: '获取相同产品规格的其他正常标记批次记录，用于较好状态参考；若同产线、口模/定径套、层结构、配方、速度和测量方法未确认，跨批次差异只能作弱参考，不能称为正式控制限或最佳工艺窗口。',
      schema: z.object({ limit: z.number().int().min(3).max(50).default(15) }),
    }
  );

  const getMetricDefinition = tool(
    async () => trace(traces, 'get_metric_definition', {}, reporter, async () => {
      const dictionary = await dbClient.queryOne<Row>(
        'SELECT code, name, unit, influences, description FROM ppr_metric WHERE code=?',
        [context.metric_code]
      );
      // 判定限值一律取当前批次的产品规格，不再使用 ppr_metric 的通用限值。
      const specLimits: Record<string, { lower: unknown; upper: unknown }> = {
        outer_diameter: { lower: context.outer_lower_mm, upper: context.outer_upper_mm },
        min_wall_thickness: { lower: context.wall_lower_mm, upper: context.wall_upper_mm },
        ovality: { lower: 0, upper: context.ovality_upper_mm },
      };
      const limit = specLimits[String(context.metric_code)] ?? { lower: null, upper: null };
      return {
        ...(dictionary ?? {}),
        metric_code: context.metric_code,
        spec_id: context.spec_id,
        spec_name: context.spec_name,
        lower_limit: limit.lower,
        upper_limit: limit.upper,
        limit_source: '产品规格（ppr_product_spec）标准限值',
      };
    }),
    {
      name: 'get_metric_definition',
      description: '获取异常指标口径、单位、通用影响因素和当前产品规格限值。影响因素只是排查方向，不是当前事件证据；规格限值与正常参考范围、工艺窗口不得混用。',
      schema: z.object({}),
    }
  );

  return [getAlertContext, getBatchMeasurements, getEquipmentWindow, getReferenceMeasurements, getMetricDefinition];
}
