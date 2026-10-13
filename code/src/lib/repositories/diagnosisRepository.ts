/**
 * 诊断证据仓储。
 *
 * 诊断结论必须能被逐层核对，所以每条依据都要回指到具体记录。
 * 这里按「证据层」组织查询：
 *   测量数据层 —— 抽检记录、壁厚测点、产品数据（对应 v_product_data_wide）
 *   工艺参数层 —— 工艺记录与温区实测/设定偏差
 *   设备采集层 —— 设备读数（温度 / 压力 / 牵引速度）
 *   参考对照层 —— 同规格正常批次的统计量（中位数 / 观察范围）
 *
 * 规约：任何一层查不到数据时返回空数组，由上层写成「缺失证据」，
 * 绝不用 0 或空字符串冒充数据。
 */
import { query, queryOne, type RowDataPacket } from '../db';

export interface WallPointRow {
  recordId: number;
  recordCode: string;
  pointNo: number;
  positionDesc: string | null;
  valueMm: number | null;
}

export interface ProductDataRow {
  id: number;
  code: string;
  batchNo: string;
  productionDate: string | null;
  dataSourceName: string | null;
  outerDiameterMm: number | null;
  minWallThicknessMm: number | null;
  maxWallThicknessMm: number | null;
  /** 原始不圆度（台账直接录入） */
  ovalityMm: number | null;
  /** 有效不圆度：优先原始值，否则由同截面最大/最小外径计算 */
  ovalityEffectiveMm: number | null;
}

export interface ProcessRecordRow {
  id: number;
  code: string;
  batchId: number;
  batchNo: string;
  equipmentName: string | null;
  recordTime: string;
  timeMatchStatus: string;
  haulOffFeedbackMpm: number | null;
  pipeLineSpeedMpm: number | null;
  massOutputKgh: number | null;
}

export interface ProcessZoneRow {
  processRecordId: number;
  zoneCode: string;
  zoneName: string;
  setpointC: number | null;
  feedbackC: number | null;
  deviationC: number | null;
}

export interface EquipmentReadingRow {
  id: number;
  code: string;
  equipmentCode: string | null;
  equipmentName: string | null;
  collectTime: string;
  temperatureC: number | null;
  pressureMpa: number | null;
  haulOffSpeedMpm: number | null;
  dataSourceName: string | null;
}

/** 某批次的抽检记录（按时间正序） */
export async function listRecordTimeline(batchId: number) {
  return query<RowDataPacket>(
    `SELECT r.id, r.code, r.inspect_time AS inspectTime, r.quality_flag AS qualityFlag,
            r.record_status AS recordStatus
       FROM inspection_record r
      WHERE r.batch_id = ?
      ORDER BY r.inspect_time ASC, r.id ASC`,
    [batchId],
  );
}

/** 壁厚测点（若台账录入了分点壁厚） */
export async function listWallPoints(recordIds: number[]): Promise<WallPointRow[]> {
  if (!recordIds.length) return [];
  const placeholders = recordIds.map(() => '?').join(',');
  const rows = await query<RowDataPacket>(
    `SELECT p.record_id AS recordId, r.code AS recordCode, p.point_no AS pointNo,
            p.position_desc AS positionDesc, p.value_mm AS valueMm
       FROM inspection_wall_point p
       JOIN inspection_record r ON r.id = p.record_id
      WHERE p.record_id IN (${placeholders})
      ORDER BY p.record_id, p.point_no`,
    recordIds,
  );
  return rows.map((row) => ({
    recordId: Number(row.recordId),
    recordCode: String(row.recordCode),
    pointNo: Number(row.pointNo),
    positionDesc: row.positionDesc === null ? null : String(row.positionDesc),
    valueMm: row.valueMm === null ? null : Number(row.valueMm),
  }));
}

/** 产品数据（在线测量台账） */
export async function listProductData(options: {
  batchId?: number;
  specId?: number;
  limit?: number;
}): Promise<ProductDataRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (options.batchId) {
    where.push('batch_no = (SELECT batch_no FROM production_batch WHERE id = ?)');
    params.push(options.batchId);
  }
  return query<RowDataPacket>(
    `SELECT id, code, batch_no AS batchNo, production_date AS productionDate,
            data_source_name AS dataSourceName, outer_diameter_mm AS outerDiameterMm,
            min_wall_thickness_mm AS minWallThicknessMm,
            max_wall_thickness_mm AS maxWallThicknessMm, ovality_mm AS ovalityMm,
            ovality_effective_mm AS ovalityEffectiveMm
       FROM v_product_data_wide
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY production_date DESC, id DESC
      LIMIT ?`,
    [...params, options.limit ?? 50],
  ).then((rows) =>
    rows.map((row) => ({
      id: Number(row.id),
      code: String(row.code),
      batchNo: String(row.batchNo),
      productionDate: row.productionDate === null ? null : String(row.productionDate),
      dataSourceName: row.dataSourceName === null ? null : String(row.dataSourceName),
      outerDiameterMm: row.outerDiameterMm === null ? null : Number(row.outerDiameterMm),
      minWallThicknessMm: row.minWallThicknessMm === null ? null : Number(row.minWallThicknessMm),
      maxWallThicknessMm: row.maxWallThicknessMm === null ? null : Number(row.maxWallThicknessMm),
      ovalityMm: row.ovalityMm === null ? null : Number(row.ovalityMm),
      ovalityEffectiveMm:
        row.ovalityEffectiveMm === null ? null : Number(row.ovalityEffectiveMm),
    })),
  );
}

/** 工艺记录（含温区） */
export async function listProcessRecords(
  batchId: number,
  limit = 200,
): Promise<{ records: ProcessRecordRow[]; zones: ProcessZoneRow[] }> {
  const rows = await query<RowDataPacket>(
    `SELECT p.id, p.code, p.batch_id AS batchId, b.batch_no AS batchNo,
            e.name AS equipmentName, p.record_time AS recordTime,
            p.time_match_status AS timeMatchStatus,
            p.haul_off_feedback_mpm AS haulOffFeedbackMpm,
            p.pipe_line_speed_mpm AS pipeLineSpeedMpm,
            p.mass_output_kgh AS massOutputKgh
       FROM process_record p
       JOIN production_batch b ON b.id = p.batch_id
       LEFT JOIN equipment e ON e.id = p.equipment_id
      WHERE p.batch_id = ?
      ORDER BY p.record_time ASC
      LIMIT ?`,
    [batchId, limit],
  );

  const records: ProcessRecordRow[] = rows.map((row) => ({
    id: Number(row.id),
    code: String(row.code),
    batchId: Number(row.batchId),
    batchNo: String(row.batchNo),
    equipmentName: row.equipmentName === null ? null : String(row.equipmentName),
    recordTime: String(row.recordTime),
    timeMatchStatus: String(row.timeMatchStatus ?? ''),
    haulOffFeedbackMpm:
      row.haulOffFeedbackMpm === null ? null : Number(row.haulOffFeedbackMpm),
    pipeLineSpeedMpm: row.pipeLineSpeedMpm === null ? null : Number(row.pipeLineSpeedMpm),
    massOutputKgh: row.massOutputKgh === null ? null : Number(row.massOutputKgh),
  }));

  if (!records.length) return { records: [], zones: [] };

  const zoneRows = await query<RowDataPacket>(
    `SELECT z.process_record_id AS processRecordId, t.code AS zoneCode, t.name AS zoneName,
            z.setpoint_c AS setpointC, z.feedback_c AS feedbackC, z.deviation_c AS deviationC
       FROM process_zone_value z
       JOIN temp_zone t ON t.id = z.zone_id
      WHERE z.process_record_id IN (${records.map(() => '?').join(',')})
      ORDER BY z.process_record_id, t.sort_no`,
    records.map((record) => record.id),
  );

  const zones: ProcessZoneRow[] = zoneRows.map((row) => ({
    processRecordId: Number(row.processRecordId),
    zoneCode: String(row.zoneCode),
    zoneName: String(row.zoneName),
    setpointC: row.setpointC === null ? null : Number(row.setpointC),
    feedbackC: row.feedbackC === null ? null : Number(row.feedbackC),
    deviationC: row.deviationC === null ? null : Number(row.deviationC),
  }));

  return { records, zones };
}

/** 设备采集读数 */
export async function listEquipmentReadings(
  batchId: number,
  limit = 200,
): Promise<EquipmentReadingRow[]> {
  const rows = await query<RowDataPacket>(
    `SELECT v.id, v.code, v.equipment_code AS equipmentCode, v.equipment_name AS equipmentName,
            v.collect_time AS collectTime, v.temperature_c AS temperatureC,
            v.pressure_mpa AS pressureMpa, v.haul_off_speed_mpm AS haulOffSpeedMpm,
            v.data_source_name AS dataSourceName
       FROM v_equipment_reading_wide v
      WHERE v.batch_no = (SELECT batch_no FROM production_batch WHERE id = ?)
      ORDER BY v.collect_time ASC
      LIMIT ?`,
    [batchId, limit],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    code: String(row.code),
    equipmentCode: row.equipmentCode === null ? null : String(row.equipmentCode),
    equipmentName: row.equipmentName === null ? null : String(row.equipmentName),
    collectTime: String(row.collectTime),
    temperatureC: row.temperatureC === null ? null : Number(row.temperatureC),
    pressureMpa: row.pressureMpa === null ? null : Number(row.pressureMpa),
    haulOffSpeedMpm: row.haulOffSpeedMpm === null ? null : Number(row.haulOffSpeedMpm),
    dataSourceName: row.dataSourceName === null ? null : String(row.dataSourceName),
  }));
}

/** 同规格的参考批次（用于「参考对照」层） */
export async function listReferenceBatches(options: {
  specId: number;
  excludeBatchId: number;
  limit?: number;
}): Promise<Array<{ batchId: number; batchNo: string; productionGroup: string | null; recordCount: number }>> {
  const rows = await query<RowDataPacket>(
    `SELECT b.id AS batchId, b.batch_no AS batchNo, b.production_group AS productionGroup,
            (SELECT COUNT(*) FROM inspection_record r WHERE r.batch_id = b.id) AS recordCount
       FROM production_batch b
      WHERE b.spec_id = ?
        AND b.id <> ?
        AND b.is_deleted = 0
        AND EXISTS (SELECT 1 FROM inspection_record r2 WHERE r2.batch_id = b.id)
      ORDER BY b.start_time DESC, b.id DESC
      LIMIT ?`,
    [options.specId, options.excludeBatchId, options.limit ?? 5],
  );
  return rows.map((row) => ({
    batchId: Number(row.batchId),
    batchNo: String(row.batchNo),
    productionGroup: row.productionGroup === null ? null : String(row.productionGroup),
    recordCount: Number(row.recordCount),
  }));
}

/** 参考批次的指标统计量（中位数 / 最小 / 最大） */
export async function referenceStatsForBatch(
  batchId: number,
  metricId: number,
): Promise<{ count: number; median: number | null; min: number | null; max: number | null }> {
  const row = await queryOne<RowDataPacket>(
    `SELECT COUNT(v.metric_value) AS cnt,
            MIN(v.metric_value) AS \`minValue\`,
            MAX(v.metric_value) AS \`maxValue\`
       FROM inspection_record r
       JOIN inspection_value v ON v.record_id = r.id AND v.metric_id = ?
      WHERE r.batch_id = ?`,
    [metricId, batchId],
  );
  const count = Number(row?.cnt ?? 0);
  if (!count) return { count: 0, median: null, min: null, max: null };

  // 中位数用「取中间一到两行求平均」的办法算，LIMIT / OFFSET 由 Node 侧算好再传参。
  // 不写成 `LIMIT 2 - (SELECT ...) MOD 2` 这类表达式：MySQL 的 LIMIT 不接受表达式，
  // 只有参考批次该指标确实有数据时才会执行到这里，隐蔽性很强（曾经只在 R1 事件上暴露）。
  const offset = Math.floor((count - 1) / 2);
  const limit = count % 2 === 0 ? 2 : 1;

  const medianRow = await queryOne<RowDataPacket>(
    `SELECT AVG(mid) AS median FROM (
       SELECT v.metric_value AS mid
         FROM inspection_record r
         JOIN inspection_value v ON v.record_id = r.id AND v.metric_id = ?
        WHERE r.batch_id = ?
        ORDER BY v.metric_value
        LIMIT ? OFFSET ?
     ) AS t`,
    [metricId, batchId, limit, offset],
  );

  return {
    count,
    median: medianRow?.median === null || medianRow?.median === undefined ? null : Number(medianRow.median),
    min: row?.minValue === null || row?.minValue === undefined ? null : Number(row.minValue),
    max: row?.maxValue === null || row?.maxValue === undefined ? null : Number(row.maxValue),
  };
}

/** 指标对应的过程参数（metric_influence） */
export async function influencesForMetric(metricId: number): Promise<
  Array<{ parameterId: number; code: string; name: string; unit: string; remark: string | null }>
> {
  const rows = await query<RowDataPacket>(
    `SELECT p.id AS parameterId, p.code, p.name, p.unit, i.remark
       FROM metric_influence i
       JOIN process_parameter p ON p.id = i.parameter_id
      WHERE i.metric_id = ?
      ORDER BY p.sort_no, p.id`,
    [metricId],
  );
  return rows.map((row) => ({
    parameterId: Number(row.parameterId),
    code: String(row.code),
    name: String(row.name),
    unit: String(row.unit),
    remark: row.remark === null ? null : String(row.remark),
  }));
}

/** QMS/MES 核对记录 */
export async function listConsistencyChecks(recordIds: number[]) {
  if (!recordIds.length) return [];
  const rows = await query<RowDataPacket>(
    `SELECT c.id, c.record_id AS recordId, r.code AS recordCode, m.name AS metricName,
            c.primary_value AS primaryValue, c.secondary_value AS secondaryValue,
            c.diff_value AS diffValue, c.tolerance_value AS toleranceValue, c.result,
            c.matched_time AS matchedTime, c.conclusion_note AS conclusionNote
       FROM data_consistency_check c
       JOIN inspection_record r ON r.id = c.record_id
       JOIN quality_metric m ON m.id = c.metric_id
      WHERE c.record_id IN (${recordIds.map(() => '?').join(',')})
      ORDER BY c.id`,
    recordIds,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    recordId: Number(row.recordId),
    recordCode: String(row.recordCode),
    metricName: String(row.metricName),
    primaryValue: Number(row.primaryValue),
    secondaryValue: Number(row.secondaryValue),
    diffValue: Number(row.diffValue),
    toleranceValue: Number(row.toleranceValue),
    result: String(row.result),
    matchedTime: row.matchedTime === null ? null : String(row.matchedTime),
    conclusionNote: row.conclusionNote === null ? null : String(row.conclusionNote),
  }));
}
