import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/storage/database/mysql-client';
import { requireAdmin } from '@/lib/auth';
import { fail, failFrom } from '@/lib/api';
import { normalizeValue } from '@/lib/quality';
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

type Params = { equipmentId: string; batchId: string; readingId: string };

/** 取出这条采集记录并校验它确实属于 URL 上的设备与批次，避免跨设备改数 */
async function loadOwnedReading(params: Params) {
  const equipmentId = Number(params.equipmentId);
  const batchId = Number(params.batchId);
  const readingId = Number(params.readingId);
  if (!equipmentId || !batchId || !readingId) return { error: fail('设备ID、批次ID或记录ID不正确') } as const;

  const reading = await queryOne(
    'SELECT * FROM ppr_equipment_reading WHERE id = ? AND equipment_id = ? AND batch_id = ?',
    [readingId, equipmentId, batchId]
  );
  if (!reading) return { error: fail('采集记录不存在', 404) } as const;
  return { equipmentId, batchId, readingId, reading } as const;
}

export async function PUT(request: NextRequest, context: { params: Promise<Params> }) {
  const denied = await adminGuard(); if (denied) return denied;
  const params = await context.params;

  try {
    const owned = await loadOwnedReading(params);
    if ('error' in owned) return owned.error;
    const { equipmentId, batchId, readingId, reading } = owned;

    const equipment = await loadEquipmentWithType(equipmentId);
    if (!equipment) return fail('设备不存在', 404);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const columns: string[] = [];
    const values: unknown[] = [];

    // 采集时间：允许改，但要重新做唯一性检查
    if (body.collect_time !== undefined) {
      if (!body.collect_time) return fail('采集时间不能为空');
      const collectTime = normalizeValue(body.collect_time);
      const duplicated = await queryOne(
        'SELECT id FROM ppr_equipment_reading WHERE equipment_id = ? AND batch_id = ? AND collect_time = ? AND id <> ?',
        [equipmentId, batchId, collectTime, readingId]
      );
      if (duplicated) return fail(`该设备在「${String(body.collect_time).replace('T', ' ')}」已有一条采集记录`, 409);
      columns.push('collect_time'); values.push(collectTime);
    }

    // 采集项：只接受该设备类型允许的列，且编辑后至少要剩一个有效值
    const metricValues = pickReadingValues(equipment.type_code, body);
    if (Object.keys(metricValues).length) {
      const merged: Record<string, unknown> = { ...reading, ...metricValues };
      if (!hasAnyReadingValue(pickReadingValues(equipment.type_code, merged))) {
        return fail('请至少保留一项采集数据');
      }
      for (const [key, value] of Object.entries(metricValues)) {
        columns.push(key); values.push(value);
      }
    }

    if (body.data_source !== undefined) { columns.push('data_source'); values.push(String(body.data_source) || 'SCADA'); }
    if (body.remark !== undefined) { columns.push('remark'); values.push(body.remark === '' ? null : String(body.remark)); }

    if (!columns.length) return fail('没有可更新的字段');

    values.push(readingId);
    await query(
      `UPDATE ppr_equipment_reading SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`,
      values
    );
    const row = await queryOne('SELECT * FROM ppr_equipment_reading WHERE id = ?', [readingId]);
    return NextResponse.json({ data: row });
  } catch (cause) {
    console.error('equipment reading PUT failed', cause);
    return failFrom(cause, '更新采集数据失败');
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<Params> }) {
  const denied = await adminGuard(); if (denied) return denied;
  const params = await context.params;

  try {
    const owned = await loadOwnedReading(params);
    if ('error' in owned) return owned.error;
    await query('DELETE FROM ppr_equipment_reading WHERE id = ?', [owned.readingId]);
    return NextResponse.json({ success: true });
  } catch (cause) {
    console.error('equipment reading DELETE failed', cause);
    return failFrom(cause, '删除采集数据失败');
  }
}
