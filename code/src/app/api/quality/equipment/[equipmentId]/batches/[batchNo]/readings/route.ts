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

/** 批次号是字符串：URL 里可能带中文或空格，统一解码 + trim 后使用 */
function readBatchNo(raw: string): string {
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return String(raw ?? '').trim();
  }
}

/** 批次下的采集项列表：设备与批次号由页面上下文给定，列表只按 (设备, 批次号) 过滤 */
export async function GET(_request: NextRequest, context: { params: Promise<{ equipmentId: string; batchNo: string }> }) {
  const denied = await adminGuard(); if (denied) return denied;
  const { equipmentId, batchNo: rawBatchNo } = await context.params;
  const equipmentIdNum = Number(equipmentId);
  const batchNo = readBatchNo(rawBatchNo);
  if (!equipmentIdNum || !batchNo) return fail('设备ID或批次号不正确');

  try {
    const equipment = await loadEquipmentWithType(equipmentIdNum);
    if (!equipment) return fail('设备不存在', 404);

    const batch = await queryOne(
      `SELECT b.*, s.code AS spec_code, s.name AS spec_name
       FROM ppr_batch b LEFT JOIN ppr_product_spec s ON s.id = b.spec_id
       WHERE b.batch_no = ?`,
      [batchNo]
    );
    if (!batch) return fail(`批次「${batchNo}」不存在（该批次号下没有任何产品数据或采集数据）`, 404);

    const readings = await queryAll(
      `SELECT * FROM ppr_equipment_reading
       WHERE equipment_id = ? AND batch_no = ?
       ORDER BY collect_time DESC, id DESC`,
      [equipmentIdNum, batchNo]
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
 * 写入采集项。
 * record_no 由服务端生成（模板里不再让用户填），batch_no / equipment_id 完全取自 URL 上下文，
 * 所以 Excel 模板只需要「采集时间 + 该设备类型的数据项」两列。
 *
 * 幂等：同一设备 + 同一批次号 + 同一采集时刻重复导入时覆盖原有数值列（不新增行、不改已有 record_no），
 * 这样导错的文件可以直接重导修正；明细数据没有编辑/删除入口，重导就是唯一的修正方式。
 */
export async function POST(request: NextRequest, context: { params: Promise<{ equipmentId: string; batchNo: string }> }) {
  const denied = await adminGuard(); if (denied) return denied;
  const { equipmentId, batchNo: rawBatchNo } = await context.params;
  const equipmentIdNum = Number(equipmentId);
  const batchNo = readBatchNo(rawBatchNo);
  if (!equipmentIdNum || !batchNo) return fail('设备ID或批次号不正确');

  try {
    const equipment = await loadEquipmentWithType(equipmentIdNum);
    if (!equipment) return fail('设备不存在', 404);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (!body.collect_time) return fail('请填写采集时间');

    const metricValues = pickReadingValues(equipment.type_code, body);
    if (!hasAnyReadingValue(metricValues)) return fail('请至少填写一项采集数据');

    const collectTime = normalizeValue(body.collect_time);
    const columns = ['record_no', 'batch_no', 'equipment_id', 'collect_time'];
    const values: unknown[] = [makeBusinessNo('ER'), batchNo, equipmentIdNum, collectTime];
    for (const [key, value] of Object.entries(metricValues)) {
      columns.push(key); values.push(value);
    }
    if (body.remark) { columns.push('remark'); values.push(String(body.remark)); }
    columns.push('data_source');
    values.push(body.data_source ? String(body.data_source) : 'Excel导入');

    // 唯一键 (equipment_id, batch_no, collect_time)：重复导入同一时刻只更新数值列，保留原 record_no。
    const updatable = columns.filter((column) => column !== 'record_no' && column !== 'equipment_id' && column !== 'batch_no' && column !== 'collect_time');
    const result = await query(
      `INSERT INTO ppr_equipment_reading (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})
       ON DUPLICATE KEY UPDATE ${updatable.map((column) => `${column}=VALUES(${column})`).join(', ')}`,
      values
    );
    // ON DUPLICATE KEY UPDATE 命中已有行时 insertId 不可靠，按唯一键回读更稳。
    const row = await queryOne(
      'SELECT * FROM ppr_equipment_reading WHERE equipment_id = ? AND batch_no = ? AND collect_time = ?',
      [equipmentIdNum, batchNo, collectTime]
    ) ?? await queryOne('SELECT * FROM ppr_equipment_reading WHERE id = ?', [result.insertId]);
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (cause) {
    console.error('equipment readings POST failed', cause);
    return failFrom(cause, '新增采集数据失败');
  }
}
