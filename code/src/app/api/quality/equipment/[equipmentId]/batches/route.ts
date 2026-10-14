import { NextRequest, NextResponse } from 'next/server';
import { query, queryAll, queryOne } from '@/storage/database/mysql-client';
import { requireAdmin } from '@/lib/auth';
import { fail, failFrom } from '@/lib/api';
import { normalizeValue } from '@/lib/quality';
import { batchLinkFieldForType, readingColumnsForType } from '@/lib/quality-equipment';
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
 * 某台设备下的生产批次列表。
 *
 * 批次来源是 ppr_batch 上的挤出机 / 牵引机字段（由设备类型编码决定），
 * 而不是「采集数据里出现过的批次」——这样新建但还没采集的批次也能进来补录。
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
    const batchLinkField = batchLinkFieldForType(equipment.type_code);
    if (!batchLinkField) {
      return NextResponse.json({ equipment, batchLinkField: null, dataColumns, batches: [] });
    }

    // batchLinkField 只可能来自 quality-equipment.ts 的白名单常量，不存在注入风险。
    const batches = await queryAll(
      `SELECT b.id, b.batch_no, b.spec_id, b.production_group, b.start_time, b.end_time, b.status, b.data_source,
              s.code AS spec_code, s.name AS spec_name,
              (SELECT COUNT(*) FROM ppr_equipment_reading r
                WHERE r.batch_id = b.id AND r.equipment_id = ?) AS reading_count,
              (SELECT MAX(r.collect_time) FROM ppr_equipment_reading r
                WHERE r.batch_id = b.id AND r.equipment_id = ?) AS last_collect_time
       FROM ppr_batch b
       JOIN ppr_product_spec s ON s.id = b.spec_id
       WHERE b.${batchLinkField} = ?
       ORDER BY b.start_time DESC, b.id DESC`,
      [id, id, id]
    );
    return NextResponse.json({ equipment, batchLinkField, dataColumns, batches });
  } catch (cause) {
    console.error('equipment batches GET failed', cause);
    return failFrom(cause, '查询批次失败');
  }
}

/**
 * 在当前设备下新增生产批次：把该设备按类型写进 extruder_id 或 haul_off_id，
 * 用户不用再手工去「批次基础信息」里挑设备。
 */
export async function POST(request: NextRequest, context: { params: Promise<{ equipmentId: string }> }) {
  const denied = await adminGuard(); if (denied) return denied;
  const { equipmentId } = await context.params;
  const id = Number(equipmentId);
  if (!id) return fail('设备ID不正确');

  try {
    const equipment = await loadEquipmentWithType(id);
    if (!equipment) return fail('设备不存在', 404);

    const batchLinkField = batchLinkFieldForType(equipment.type_code);
    if (!batchLinkField) {
      return fail(`「${equipment.type_name}」既不是挤出机也不是牵引机，无法关联生产批次`);
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const batchNo = String(body.batch_no ?? '').trim();
    const specId = Number(body.spec_id);
    const productionGroup = String(body.production_group ?? '').trim();
    if (!batchNo) return fail('请填写批次号');
    if (!specId) return fail('请选择产品规格');
    if (!productionGroup) return fail('请填写生产组别');
    if (!body.start_time) return fail('请填写生产开始时间');

    const columns = ['batch_no', 'spec_id', 'production_group', 'start_time', batchLinkField];
    const values: unknown[] = [batchNo, specId, productionGroup, normalizeValue(body.start_time), id];
    if (body.end_time) { columns.push('end_time'); values.push(normalizeValue(body.end_time)); }
    if (body.status) { columns.push('status'); values.push(String(body.status)); }
    if (body.data_source) { columns.push('data_source'); values.push(String(body.data_source)); }

    const result = await query(
      `INSERT INTO ppr_batch (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      values
    );
    const row = await queryOne(
      `SELECT b.*, s.name AS spec_name FROM ppr_batch b
       JOIN ppr_product_spec s ON s.id = b.spec_id WHERE b.id = ?`,
      [result.insertId]
    );
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : '';
    if (/Duplicate entry/i.test(message)) return fail(`批次号重复，请换一个批次号`);
    if (/foreign key/i.test(message)) return fail('产品规格不存在，请重新选择');
    console.error('equipment batches POST failed', cause);
    return failFrom(cause, '新增批次失败');
  }
}
