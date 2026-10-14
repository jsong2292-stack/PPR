/**
 * 批次数据清理（按来源分开，不跨来源级联）。
 *
 * 批次不是表：`ppr_batch` 是按 `batch_no` 把产品检验记录与设备采集数据聚合出来的视图。
 * 产品数据与设备数据之间只有「批次号」这一个字符串关联，谁也不从属于谁，
 * 所以清理也必须分开，谁的数据清谁：
 *
 *   - 批次总览 / 规格下钻页 → 清理该批次的【检验记录】
 *     （连带由这些记录产生的预警事件：事件挂在 `measurement_id` 上，不跟着删就成孤儿数据）
 *   - 设备台账批次页 → 清理【本设备】在该批次下的【采集数据】
 *     （不动产品检验记录，也不动同一批次下别的设备的采集数据）
 *
 * 两边都清空后，这个批次号下没数据了，视图里自然就没有它了 —— 「批次消失」是清理的结果，不是清理的对象。
 * 8D 归档保护只挂在检验记录这条路径上：预警事件/诊断/报告都是从检验记录派生的。
 */
import * as dbClient from '@/storage/database/mysql-client';

export interface MeasurementCleanup {
  batchNo: string;
  /** 该批次下的检验记录条数（ppr_product_measurement） */
  measurements: number;
  /** 由这些检验记录产生的预警事件条数 */
  alerts: number;
  /** 由这些预警事件产生的 8D 报告份数 */
  reports: number;
  /** 状态为「归档」的 8D 报告编号；非空即禁止清理 */
  archivedReports: string[];
}

/** 拼一句给用户看的中文说明（前端二次确认框直接复用）。 */
export function describeMeasurementCleanup(info: MeasurementCleanup): string {
  const head = `批次「${info.batchNo}」下有 ${info.measurements} 条检验记录`;
  const derived: string[] = [];
  if (info.alerts > 0) derived.push(`${info.alerts} 条预警事件`);
  if (info.reports > 0) derived.push(`${info.reports} 份 8D 报告`);
  const tail = derived.length ? `，以及由此产生的 ${derived.join('、')}。` : '。';
  return `${head}${tail}只会清理产品侧的检验记录，不影响设备采集数据。删除后不可恢复。`;
}

export function describeArchivedReports(info: MeasurementCleanup): string {
  return `批次「${info.batchNo}」下的检验记录已归档为 8D 报告（${info.archivedReports.join('、')}），为保证归档留痕不能清理。请先在历史分析中处理这些报告。`;
}

/** 统计该批次检验记录侧的关联数据；批次号不存在时返回全 0。 */
export async function loadMeasurementCleanup(batchNo: string): Promise<MeasurementCleanup> {
  const counts = await dbClient.queryOne<{ measurements: number; alerts: number; reports: number }>(
    `SELECT
       (SELECT COUNT(*) FROM ppr_product_measurement m WHERE m.batch_no=?) AS measurements,
       (SELECT COUNT(*) FROM ppr_alert_event a
          JOIN ppr_product_measurement m ON m.id=a.measurement_id WHERE m.batch_no=?) AS alerts,
       (SELECT COUNT(*) FROM ppr_eight_d_report d
          JOIN ppr_analysis_run ar ON ar.id=d.analysis_id
          JOIN ppr_alert_event a ON a.id=ar.alert_id
          JOIN ppr_product_measurement m ON m.id=a.measurement_id WHERE m.batch_no=?) AS reports`,
    [batchNo, batchNo, batchNo]
  );

  // 已归档的报告是留痕证据：只要这里非空就禁止清理这批检验记录。
  const archives = await dbClient.queryAll<{ report_no: string }>(
    `SELECT d.report_no FROM ppr_eight_d_report d
       JOIN ppr_analysis_run ar ON ar.id=d.analysis_id
       JOIN ppr_alert_event a ON a.id=ar.alert_id
       JOIN ppr_product_measurement m ON m.id=a.measurement_id
      WHERE m.batch_no=? AND d.status='finalized' ORDER BY d.id`,
    [batchNo]
  );

  return {
    batchNo,
    measurements: Number(counts?.measurements ?? 0),
    alerts: Number(counts?.alerts ?? 0),
    reports: Number(counts?.reports ?? 0),
    archivedReports: archives.map((row) => String(row.report_no)),
  };
}

/**
 * 清理该批次的检验记录（连带其预警事件，事件会继续级联到诊断任务/结论与 8D 报告）。
 * 顺序必须是 预警事件 → 检验记录。调用方需先确认没有历史归档。
 */
export async function cleanupBatchMeasurements(batchNo: string): Promise<{ measurements: number; alerts: number }> {
  return dbClient.transaction(async (client) => {
    const alerts = await client.query(
      `DELETE a FROM ppr_alert_event a
         JOIN ppr_product_measurement m ON m.id=a.measurement_id
        WHERE m.batch_no=?`,
      [batchNo]
    );
    const measurements = await client.query('DELETE FROM ppr_product_measurement WHERE batch_no=?', [batchNo]);
    return { measurements: measurements.affectedRows, alerts: alerts.affectedRows };
  });
}

/** 该设备在该批次下的采集数据条数。 */
export async function countEquipmentBatchReadings(equipmentId: number, batchNo: string): Promise<number> {
  const row = await dbClient.queryOne<{ n: number }>(
    'SELECT COUNT(*) AS n FROM ppr_equipment_reading WHERE equipment_id=? AND batch_no=?',
    [equipmentId, batchNo]
  );
  return Number(row?.n ?? 0);
}

export function describeEquipmentReadingCleanup(equipmentName: string, batchNo: string, count: number): string {
  return `「${equipmentName}」在批次「${batchNo}」下有 ${count} 条采集数据。只会清理这台设备的采集数据，不影响产品检验记录，也不影响同一批次下其他设备的采集数据。删除后不可恢复。`;
}

/** 清理本设备在该批次下的采集数据（只按 equipment_id + batch_no 删，不碰产品数据）。 */
export async function cleanupEquipmentBatchReadings(equipmentId: number, batchNo: string): Promise<number> {
  const result = await dbClient.query(
    'DELETE FROM ppr_equipment_reading WHERE equipment_id=? AND batch_no=?',
    [equipmentId, batchNo]
  );
  return result.affectedRows;
}
