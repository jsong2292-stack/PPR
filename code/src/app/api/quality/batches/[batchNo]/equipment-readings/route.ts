import { NextResponse } from 'next/server';
import { queryAll, queryOne } from '@/storage/database/mysql-client';
import { requireAdmin } from '@/lib/auth';
import { fail, failFrom } from '@/lib/api';
import { readingColumnsForType } from '@/lib/quality-equipment';

export const runtime = 'nodejs';

/**
 * 批次下的全部设备采集数据（跨设备汇总，供趋势卡片使用）。
 *
 *   GET /api/quality/batches/{批次号}/equipment-readings
 *   → { batch, equipments, linkedEquipment, readings, recordCount, dataColumns }
 *
 * 批次号是唯一关联键：batch 来自 ppr_batch 视图，equipments 由这批采集数据里出现过的设备反推
 * （不再有「批次归属哪台设备」的持久字段）。
 */
export async function GET(_request: Request, context: { params: Promise<{ batchNo: string }> }) {
  const denied = await requireAdmin().then(() => null).catch((cause) => failFrom(cause, '无权限操作'));
  if (denied) return denied;

  const { batchNo: rawBatchNo } = await context.params;
  let batchNo = String(rawBatchNo ?? '').trim();
  try { batchNo = decodeURIComponent(batchNo).trim(); } catch { /* 保留原值 */ }
  if (!batchNo) return fail('批次号不正确');

  try {
    const batch = await queryOne<Record<string, unknown>>(
      `SELECT b.*, s.code AS spec_code, s.name AS spec_name, s.category_id,
              c.name AS category_name
         FROM ppr_batch b
         LEFT JOIN ppr_product_spec s ON s.id = b.spec_id
         LEFT JOIN ppr_product_category c ON c.id = s.category_id
        WHERE b.batch_no = ?`,
      [batchNo]
    );
    if (!batch) return fail(`批次「${batchNo}」不存在（该批次号下没有任何产品数据或采集数据）`, 404);

    const readings = await queryAll<Record<string, unknown>>(
      `SELECT r.id, r.record_no, r.batch_no, r.equipment_id, r.collect_time, r.temperature_c, r.pressure_mpa,
              r.haul_off_speed_mpm, r.data_source, r.remark,
              e.name AS equipment_name, e.code AS equipment_code, t.code AS type_code, t.name AS type_name
         FROM ppr_equipment_reading r
         JOIN ppr_equipment e ON e.id = r.equipment_id
         JOIN ppr_equipment_type t ON t.id = e.type_id
        WHERE r.batch_no = ?
        ORDER BY r.collect_time, r.id`,
      [batchNo]
    );

    // 设备清单由采集数据反推（不再有「批次归属哪台设备」的持久字段），同时作为页面上的设备提示。
    const linkedEquipment = await queryAll<{ id: unknown; name: unknown; role: unknown; type_code: unknown; reading_count: unknown }>(
      `SELECT e.id, e.name, t.name AS role, t.code AS type_code, COUNT(*) AS reading_count
         FROM ppr_equipment_reading r
         JOIN ppr_equipment e ON e.id = r.equipment_id
         JOIN ppr_equipment_type t ON t.id = e.type_id
        WHERE r.batch_no = ?
        GROUP BY e.id, e.name, t.name, t.code
        ORDER BY e.id`,
      [batchNo]
    );
    const hasExtruder = linkedEquipment.some((row) => String(row.type_code) === 'ETYPE-EXTRUDER');

    return NextResponse.json({
      batch,
      equipments: linkedEquipment,
      linkedEquipment,
      readings,
      recordCount: readings.length,
      dataColumns: readingColumnsForType(hasExtruder ? 'ETYPE-EXTRUDER' : undefined),
    });
  } catch (cause) {
    console.error('batch equipment readings GET failed', cause);
    return failFrom(cause, '查询设备采集数据失败');
  }
}
