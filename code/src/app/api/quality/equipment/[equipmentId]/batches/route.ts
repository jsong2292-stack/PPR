import { NextRequest, NextResponse } from 'next/server';
import { queryAll } from '@/storage/database/mysql-client';
import { requireAdmin } from '@/lib/auth';
import { fail, failFrom } from '@/lib/api';
import { readingColumnsForType } from '@/lib/quality-equipment';
import { loadEquipmentWithType } from '@/lib/quality-equipment-server';

export const runtime = 'nodejs';

/** 设备台账属于后台能力，仅管理员可读写（与 /api/quality/master/* 保持一致） */
async function adminGuard(): Promise<NextResponse | null> {
  try {
    await requireAdmin();
    return null;
  } catch (cause) {
    return failFrom(cause, '无权限操作');
  }
}

/**
 * 某台设备下的生产批次列表 + 可导入采集数据的候选批次号。
 *
 * 批次不再保存「归属哪台设备」，这个关系由采集数据自身反推：
 *   batches    = 采集数据里出现过本设备的批次号（导进去就直接是本设备的批次）
 *   candidates = 批次视图里的全部批次号（来自产品数据），供导入采集数据时选择批次号；
 *                没有它就会出现「第一批采集数据没有入口」的死循环。
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ equipmentId: string }> }) {
  const denied = await adminGuard(); if (denied) return denied;
  const { equipmentId } = await context.params;
  const id = Number(equipmentId);
  if (!id) return fail('设备ID不正确');

  try {
    const equipment = await loadEquipmentWithType(id);
    if (!equipment) return fail('设备不存在', 404);

    const dataColumns = readingColumnsForType(equipment.type_code);
    if (!dataColumns.length) {
      return NextResponse.json({ equipment, dataColumns, batches: [], candidates: [] });
    }

    const batches = await queryAll(
      `SELECT b.*, s.code AS spec_code, s.name AS spec_name,
              (SELECT COUNT(*) FROM ppr_equipment_reading r
                WHERE r.batch_no = b.batch_no AND r.equipment_id = ?) AS equipment_reading_count,
              (SELECT MAX(r.collect_time) FROM ppr_equipment_reading r
                WHERE r.batch_no = b.batch_no AND r.equipment_id = ?) AS equipment_last_collect_time
       FROM ppr_batch b
       LEFT JOIN ppr_product_spec s ON s.id = b.spec_id
       WHERE EXISTS (SELECT 1 FROM ppr_equipment_reading r WHERE r.batch_no = b.batch_no AND r.equipment_id = ?)
       ORDER BY b.start_time DESC, b.batch_no DESC`,
      [id, id, id]
    );

    const candidates = await queryAll(
      `SELECT b.batch_no, b.spec_id, b.production_group, b.start_time, b.measurement_count, b.reading_count,
              s.code AS spec_code, s.name AS spec_name
       FROM ppr_batch b
       LEFT JOIN ppr_product_spec s ON s.id = b.spec_id
       ORDER BY b.start_time DESC, b.batch_no DESC`
    );

    return NextResponse.json({ equipment, dataColumns, batches, candidates });
  } catch (cause) {
    console.error('equipment batches GET failed', cause);
    return failFrom(cause, '查询批次失败');
  }
}

/**
 * 批次不能在这台设备下新建：批次是否出现，取决于有没有产品数据（或采集数据）。
 * 采集数据的入口是 POST /api/quality/equipment/{设备ID}/batches/{批次号}/readings，
 * 每个批次号导入一次采集数据，它就会出现在本设备下面。
 */
export async function POST() {
  return fail('批次由产品数据导入自动产生，不能手工新建；在本页「导入采集数据」并选择批次号即可把批次挂到本设备', 405);
}
