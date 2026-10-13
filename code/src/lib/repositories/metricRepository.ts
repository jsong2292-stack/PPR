/**
 * 质量指标与规格限值（repository）。
 *
 * 指标是「字典驱动」的：新增一个测量指标不需要 ALTER TABLE，
 * 只需要在 quality_metric 里加一行、在 metric_spec_limit 里配置限值。
 * 因此这里的接口都返回「按 code 索引的字典」，业务层用 code 而不是硬编码 id。
 */
import { query, queryOne, type RowDataPacket } from '../db';

export interface MetricDefinition {
  id: number;
  code: string;
  name: string;
  unit: string | null;
  decimalScale: number;
  /** primary=参与判定，raw=原始测点，derived=计算指标 */
  metricRole: 'primary' | 'raw' | 'derived';
  derivedExpr: string | null;
  checkDirectionHint: string | null;
  sortNo: number;
}

export interface SpecLimitDefinition {
  specId: number;
  specCode: string;
  specName: string;
  metricId: number;
  metricCode: string;
  lowerLimit: number | null;
  upperLimit: number | null;
  limitType: string;
  calibrationStatus: string;
  standardRef: string | null;
}

interface MetricRow extends RowDataPacket {
  id: number;
  code: string;
  name: string;
  unit: string | null;
  decimal_scale: number;
  metric_role: MetricDefinition['metricRole'];
  derived_expr: string | null;
  check_direction_hint: string | null;
  sort_no: number;
}

/** 全部指标定义，按展示顺序 */
export async function listMetrics(): Promise<MetricDefinition[]> {
  const rows = await query<MetricRow>(
    `SELECT id, code, name, unit, decimal_scale, metric_role, derived_expr, check_direction_hint, sort_no
       FROM quality_metric
      WHERE status = 'enabled' AND is_deleted = 0
      ORDER BY sort_no, id`,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    code: String(row.code),
    name: String(row.name),
    unit: row.unit,
    decimalScale: Number(row.decimal_scale),
    metricRole: row.metric_role,
    derivedExpr: row.derived_expr,
    checkDirectionHint: row.check_direction_hint,
    sortNo: Number(row.sort_no),
  }));
}

/** 以 code 为键的指标字典 */
export async function metricDictionary(): Promise<Map<string, MetricDefinition>> {
  const metrics = await listMetrics();
  return new Map(metrics.map((metric) => [metric.code, metric]));
}

/** 以 id 为键的指标字典 */
export async function metricDictionaryById(): Promise<Map<number, MetricDefinition>> {
  const metrics = await listMetrics();
  return new Map(metrics.map((metric) => [metric.id, metric]));
}

/** 除不圆度外的「参与判定」指标；不圆度为派生指标，取不到原始外径时无数据 */
export async function primaryMetrics(): Promise<MetricDefinition[]> {
  const metrics = await listMetrics();
  return metrics.filter((metric) => metric.metricRole === 'primary');
}

/** 某规格的限值（按 metricId 索引） */
export async function specLimitsForSpec(specId: number): Promise<Map<number, SpecLimitDefinition>> {
  const rows = await query<RowDataPacket>(
    `SELECT l.spec_id, l.metric_id, l.lower_limit, l.upper_limit, l.limit_type,
            l.calibration_status, l.standard_ref,
            s.code AS spec_code, s.name AS spec_name, m.code AS metric_code
       FROM metric_spec_limit l
       JOIN product_spec s ON s.id = l.spec_id
       JOIN quality_metric m ON m.id = l.metric_id
      WHERE l.spec_id = ?`,
    [specId],
  );

  const map = new Map<number, SpecLimitDefinition>();
  for (const row of rows) {
    const metricId = Number(row.metric_id);
    map.set(metricId, {
      specId: Number(row.spec_id),
      specCode: String(row.spec_code),
      specName: String(row.spec_name),
      metricId,
      metricCode: String(row.metric_code),
      lowerLimit: row.lower_limit === null ? null : Number(row.lower_limit),
      upperLimit: row.upper_limit === null ? null : Number(row.upper_limit),
      limitType: String(row.limit_type ?? ''),
      calibrationStatus: String(row.calibration_status ?? ''),
      standardRef: (row.standard_ref as string) ?? null,
    });
  }
  return map;
}

/** 规格基本信息（判定时用于识别与规格明显不符的记录） */
export async function findSpec(
  specId: number,
): Promise<{ id: number; code: string; name: string; nominalOuterDiameter: number | null; nominalWallThickness: number | null } | null> {
  const row = await queryOne<RowDataPacket>(
    `SELECT id, code, name, nominal_outer_diameter_mm, nominal_wall_thickness_mm
       FROM product_spec WHERE id = ?`,
    [specId],
  );
  if (!row) return null;
  return {
    id: Number(row.id),
    code: String(row.code),
    name: String(row.name),
    nominalOuterDiameter:
      row.nominal_outer_diameter_mm === null ? null : Number(row.nominal_outer_diameter_mm),
    nominalWallThickness:
      row.nominal_wall_thickness_mm === null ? null : Number(row.nominal_wall_thickness_mm),
  };
}
