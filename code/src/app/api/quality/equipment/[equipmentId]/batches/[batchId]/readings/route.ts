import { NextRequest, NextResponse } from 'next/server';
import { query, queryAll, queryOne } from '@/storage/database/mysql-client';
import { requireAdmin } from '@/lib/auth';
import { fail, failFrom } from '@/lib/api';
import { makeBusinessNo, normalizeValue } from '@/lib/quality';
import { readingColumnsForType } from '@/lib/quality-equipment';
import { hasAnyReadingValue, loadEquipmentWithType, pickReadingValues } from '@/lib/quality-equipment-server';

export const runtime = 'nodejs';

async function adminGuard(): Promise<NextResponse | null> {
  try {
    await requireAdmin();
    return null;
  } catch (cause) {
    return failFrom(cause, '无权限操作');
  }
}

/** 批次下的采集项列表：设备与批次由页面上下文给定，列表只按 (设备, 批次) 过滤 */
export async function GET(_request: NextRequest, context: { params: Promise<{ equipmentId: string; batchId: string }> }) {
  const denied = await adminGuard(); if (denied) return denied;
  const { equipmentId, batchId } = await context.params;
  const equipmentIdNum = Number(equipmentId);
  const batchIdNum = Number(batchId);
  if (!equipmentIdNum || !batchIdNum) return fail('设备ID或批次ID不正确');

  try {
    const equipment = await loadEquipmentWithType(equipmentIdNum);
    if (!equipment) return fail('设备不存在', 404);

    const batch = await queryOne(
      `SELECT b.*, s.code AS spec_code, s.name AS spec_name
       FROM ppr_batch b JOIN ppr_product_spec s ON s.id = b.spec_id
       WHERE b.id = ?`,
      [batchIdNum]
    );
    if (!batch) return fail('批次不存在', 404);

    const readings = await queryAll(
      `SELECT * FROM ppr_equipment_reading
       WHERE equipment_id = ? AND batch_id = ?
       ORDER BY collect_time DESC, id DESC`,
      [equipmentIdNum, batchIdNum]
    );
    return NextResponse.json({
      equipment,
      batch,
      dataColumns: readingColumnsForType(equipment.type_code),
      readings,
    });
  } catch (cause) {
    console.error('equipment readings GET failed', cause);
    return failFrom(cause, '查询采集数据失败');
  }
}

/**
 * 新增采集项。
 * record_no 由服务端生成（模板里不再让用户填），batch_id / equipment_id 完全取自 URL 上下文，
 * 所以 Excel 模板只需要「采集时间 + 该设备类型的数据项」两列。
 */
export async function POST(request: NextRequest, context: { params: Promise<{ equipmentId: string; batchId: string }> }) {
  const denied = await adminGuard(); if (denied) return denied;
  const { equipmentId, batchId } = await context.params;
  const equipmentIdNum = Number(equipmentId);
  const batchIdNum = Number(batchId);
  if (!equipmentIdNum || !batchIdNum) return fail('设备ID或批次ID不正确');

  try {
    const equipment = await loadEquipmentWithType(equipmentIdNum);
    if (!equipment) return fail('设备不存在', 404);
    const batch = await queryOne('SELECT id, batch_no FROM ppr_batch WHERE id = ?', [batchIdNum]);
    if (!batch) return fail('批次不存在', 404);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (!body.collect_time) return fail('请填写采集时间');

    const metricValues = pickReadingValues(equipment.type_code, body);
    if (!hasAnyReadingValue(metricValues)) return fail('请至少填写一项采集数据');

    const collectTime = normalizeValue(body.collect_time);
    // 采集数据唯一键是 (equipment_id, batch_id, collect_time)，这里先查一次给出可读提示，
    // 避免直接抛数据库的 Duplicate entry 报错。
    const duplicated = await queryOne(
      'SELECT id FROM ppr_equipment_reading WHERE equipment_id = ? AND batch_id = ? AND collect_time = ?',
      [equipmentIdNum, batchIdNum, collectTime]
    );
    if (duplicated) return fail(`该设备在「${String(body.collect_time).replace('T', ' ')}」已有一条采集记录，请勿重复导入`, 409);

    const columns = ['record_no', 'batch_id', 'equipment_id', 'collect_time'];
    const values: unknown[] = [makeBusinessNo('ER'), batchIdNum, equipmentIdNum, collectTime];
    for (const [key, value] of Object.entries(metricValues)) {
      columns.push(key); values.push(value);
    }
    if (body.data_source) { columns.push('data_source'); values.push(String(body.data_source)); }
    if (body.remark) { columns.push('remark'); values.push(String(body.remark)); }

    const result = await query(
      `INSERT INTO ppr_equipment_reading (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      values
    );
    const row = await queryOne('SELECT * FROM ppr_equipment_reading WHERE id = ?', [result.insertId]);
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (cause) {
    console.error('equipment readings POST failed', cause);
    return failFrom(cause, '新增采集数据失败');
  }
}
