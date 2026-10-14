import { NextResponse } from 'next/server';
import { queryAll, queryOne } from '@/storage/database/mysql-client';
import { requireUser } from '@/lib/auth';
import { fail, failFrom } from '@/lib/api';
import { readingColumnsForType } from '@/lib/quality-equipment';

export const runtime = 'nodejs';

/**
 * 异常诊断页的「设备工艺参数」图表数据源：按批次取该批次下全部设备的采集记录。
 *
 * 注意这里用 requireUser 而不是 requireAdmin：
 *   - /quality/data/** 是后台台账维护页，改数据要管理员；
 *   - /quality/diagnosis 是质量工程师的登录页，采集数据在此只作为诊断证据被「读」，
 *     与规则引擎/Agent 已有的 get_equipment_window 工具口径一致。
 * 因此本接口是只读的，且不暴露任何写能力。
 *
 *   GET /api/quality/batches/2/equipment-readings
 *   → { batch, equipments, linkedEquipment, readings, recordCount }
 *
 * readings 按 collect_time 升序返回；每个指标的列定义由设备类型给出，
 * 与「设备台账 → 采集项」页面、Excel 模板、后端写入白名单共用同一份定义。
 */
export async function GET(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  try {
    await requireUser();
  } catch (cause) {
    return failFrom(cause, '请先登录');
  }

  const { batchId } = await context.params;
  const batchIdNum = Number(batchId);
  if (!Number.isFinite(batchIdNum) || batchIdNum <= 0) return fail('批次ID不正确');

  try {
    const batch = await queryOne<Record<string, unknown>>(
      `SELECT b.id, b.batch_no, b.production_group, b.start_time, b.end_time, b.status,
              s.name AS spec_name, s.code AS spec_code,
              b.extruder_id, b.haul_off_id,
              ex.name AS extruder_name, ha.name AS haul_off_name
       FROM ppr_batch b
       JOIN ppr_product_spec s ON s.id = b.spec_id
       LEFT JOIN ppr_equipment ex ON ex.id = b.extruder_id
       LEFT JOIN ppr_equipment ha ON ha.id = b.haul_off_id
       WHERE b.id = ?`,
      [batchIdNum]
    );
    if (!batch) return fail('批次不存在', 404);

    const [readings, equipments] = await Promise.all([
      queryAll<Record<string, unknown>>(
        `SELECT r.id, r.record_no, r.batch_id, r.equipment_id, r.collect_time,
                r.temperature_c, r.pressure_mpa, r.haul_off_speed_mpm,
                r.data_source, r.remark,
                e.code AS equipment_code, e.name AS equipment_name,
                e.line_name, t.name AS type_name, t.code AS type_code
         FROM ppr_equipment_reading r
         JOIN ppr_equipment e ON e.id = r.equipment_id
         JOIN ppr_equipment_type t ON t.id = e.type_id
         WHERE r.batch_id = ?
         ORDER BY r.collect_time ASC, r.id ASC`,
        [batchIdNum]
      ),
      queryAll<Record<string, unknown>>(
        `SELECT DISTINCT e.id, e.code, e.name, e.line_name,
                t.name AS type_name, t.code AS type_code
         FROM ppr_equipment_reading r
         JOIN ppr_equipment e ON e.id = r.equipment_id
         JOIN ppr_equipment_type t ON t.id = e.type_id
         WHERE r.batch_id = ?
         ORDER BY e.id ASC`,
        [batchIdNum]
      ),
    ]);

    // 采集项列由设备类型决定，服务端算好下发，避免前端再拼一次口径。
    const equipmentsWithColumns = equipments.map((equipment) => ({
      ...equipment,
      dataColumns: readingColumnsForType(String(equipment.type_code ?? '')),
    }));

    // 批次上登记过的设备（挤出机 / 牵引机）：即使还没有采集数据也要返回，
    // 这样诊断页能给工程师一条明确的「该去哪台设备补录」的引导。
    const linkedEquipment = [
      batch.extruder_id ? { id: Number(batch.extruder_id), name: String(batch.extruder_name ?? ''), role: '挤出机' } : null,
      batch.haul_off_id ? { id: Number(batch.haul_off_id), name: String(batch.haul_off_name ?? ''), role: '牵引机' } : null,
    ].filter(Boolean);

    return NextResponse.json({
      success: true,
      batch,
      equipments: equipmentsWithColumns,
      linkedEquipment,
      readings,
      recordCount: readings.length,
    });
  } catch (cause) {
    console.error('batch equipment readings GET failed', cause);
    return failFrom(cause, '查询批次设备采集数据失败');
  }
}
