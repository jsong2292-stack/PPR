/**
 * 批次清理（按批次号）。
 *
 * 批次已经不是表了：`ppr_batch` 是按 batch_no 聚合出来的视图，
 * 所以「删除批次」= 把这个批次号下的检验记录与设备采集数据一起清掉，视图里自然就没有这个批次了。
 *
 * 这里把「该批次号下到底挂了什么」算清楚，交给调用方决定：
 *   - 有历史归档的 8D 报告 → 一律拒绝删除，保住归档留痕；
 *   - 其余关联数据 → 用户二次确认后按 预警事件 → 采集数据 → 检验记录 的顺序在一个事务里清掉。
 */
import * as dbClient from '@/storage/database/mysql-client';

export interface BatchDependents {
  batchNo: string | null;
  /** 检验记录条数（ppr_product_measurement） */
  measurements: number;
  /** 设备采集条数（ppr_equipment_reading） */
  readings: number;
  /** 由该批次检验记录产生的预警事件条数 */
  alerts: number;
  /** 由这些预警事件产生的 8D 报告份数 */
  reports: number;
  /** 已归档 8D 报告的归档号；非空即禁止删除 */
  archivedReports: string[];
}

export function hasBatchDependents(dependents: BatchDependents): boolean {
  return dependents.measurements > 0 || dependents.readings > 0;
}

/** 拼一句给用户看的中文说明，前端确认框直接复用。 */
export function describeBatchDependents(dependents: BatchDependents): string {
  const parts: string[] = [];
  if (dependents.measurements > 0) parts.push(`${dependents.measurements} 条检验记录`);
  if (dependents.readings > 0) parts.push(`${dependents.readings} 条设备采集数据`);
  const derived: string[] = [];
  if (dependents.alerts > 0) derived.push(`${dependents.alerts} 条预警事件`);
  if (dependents.reports > 0) derived.push(`${dependents.reports} 份 8D 报告`);
  const batchLabel = dependents.batchNo ? `批次「${dependents.batchNo}」` : '该批次';
  const head = `${batchLabel}下还有 ${parts.join('、')}`;
  return derived.length ? `${head}，以及由此产生的 ${derived.join('、')}。删除后不可恢复。` : `${head}。删除后不可恢复。`;
}

/** 统计批次号下挂的关联数据；批次号不存在时返回全 0。 */
export async function loadBatchDependents(batchNo: string): Promise<BatchDependents> {
  const counts = await dbClient.queryOne<{
    measurements: number;
    readings: number;
    alerts: number;
    reports: number;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM ppr_product_measurement m WHERE m.batch_no=?) AS measurements,
       (SELECT COUNT(*) FROM ppr_equipment_reading r WHERE r.batch_no=?) AS readings,
       (SELECT COUNT(*) FROM ppr_alert_event a
          JOIN ppr_product_measurement m ON m.id=a.measurement_id WHERE m.batch_no=?) AS alerts,
       (SELECT COUNT(*) FROM ppr_eight_d_report d
          JOIN ppr_analysis_run ar ON ar.id=d.analysis_id
          JOIN ppr_alert_event a ON a.id=ar.alert_id
          JOIN ppr_product_measurement m ON m.id=a.measurement_id WHERE m.batch_no=?) AS reports`,
    [batchNo, batchNo, batchNo, batchNo]
  );

  // 归档表对报告是 RESTRICT：只要这里非空，级联删除一定会在删报告那步失败，所以提前拦下来。
  const archives = await dbClient.queryAll<{ archive_no: string }>(
    `SELECT h.archive_no FROM ppr_history_archive h
       JOIN ppr_eight_d_report d ON d.id=h.report_id
       JOIN ppr_analysis_run ar ON ar.id=d.analysis_id
       JOIN ppr_alert_event a ON a.id=ar.alert_id
       JOIN ppr_product_measurement m ON m.id=a.measurement_id
      WHERE m.batch_no=? ORDER BY h.id`,
    [batchNo]
  );

  const hasAny = Number(counts?.measurements ?? 0) + Number(counts?.readings ?? 0) > 0;
  return {
    batchNo: hasAny ? batchNo : null,
    measurements: Number(counts?.measurements ?? 0),
    readings: Number(counts?.readings ?? 0),
    alerts: Number(counts?.alerts ?? 0),
    reports: Number(counts?.reports ?? 0),
    archivedReports: archives.map((row) => String(row.archive_no)),
  };
}

/**
 * 按批次号清空数据：顺序必须是 预警事件 → 采集数据 → 检验记录。
 * 预警事件会继续级联到诊断任务、诊断结论与 8D 报告；调用方需先确认没有历史归档。
 */
export async function cascadeDeleteBatch(batchNo: string): Promise<void> {
  await dbClient.transaction(async (client) => {
    await client.query(
      `DELETE a FROM ppr_alert_event a
         JOIN ppr_product_measurement m ON m.id=a.measurement_id
        WHERE m.batch_no=?`,
      [batchNo]
    );
    await client.query('DELETE FROM ppr_equipment_reading WHERE batch_no=?', [batchNo]);
    await client.query('DELETE FROM ppr_product_measurement WHERE batch_no=?', [batchNo]);
  });
}
