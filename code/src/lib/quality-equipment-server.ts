/**
 * 设备采集数据接口的服务端辅助。
 *
 * 只给 app/api/quality/equipment/** 下的 Route Handler 使用；
 * 客户端组件请 import `@/lib/quality-equipment`（纯常量、无数据库依赖）。
 */
import { queryOne } from '@/storage/database/mysql-client';
import {
  readingFieldsForType,
  type ReadingFieldKey,
} from './quality-equipment';

/** 设备台账行 + 其设备类型编码（编码决定采集项与批次关联字段） */
export interface EquipmentWithType extends Record<string, unknown> {
  id: number;
  code: string;
  name: string;
  type_id: number;
  type_name: string;
  type_code: string;
  line_name: string;
  status: string;
}

export async function loadEquipmentWithType(id: number): Promise<EquipmentWithType | null> {
  return queryOne<EquipmentWithType>(
    `SELECT e.id, e.code, e.name, e.type_id, e.line_name, e.status,
            t.name AS type_name, t.code AS type_code
     FROM ppr_equipment e
     JOIN ppr_equipment_type t ON t.id = e.type_id
     WHERE e.id = ?`,
    [id]
  );
}

/** 只保留空字符串与 null，其余转成数字；用于区分「没填」和「填了 0」 */
function toNumberOrNull(raw: unknown): number | null {
  if (raw === '' || raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * 从请求体里挑出该设备类型允许写入的采集项。
 * 不属于该设备类型的列会被忽略，避免出现「牵引机被写进温度」这种脏数据。
 */
export function pickReadingValues(
  typeCode: string,
  body: Record<string, unknown>
): Partial<Record<ReadingFieldKey, number | null>> {
  const picked: Partial<Record<ReadingFieldKey, number | null>> = {};
  for (const key of readingFieldsForType(typeCode)) {
    if (body[key] === undefined) continue;
    picked[key] = toNumberOrNull(body[key]);
  }
  return picked;
}

/** 至少填了一个有效采集项才算一条有意义的采集记录 */
export function hasAnyReadingValue(values: Partial<Record<ReadingFieldKey, number | null>>): boolean {
  return Object.values(values).some((value) => value !== null && value !== undefined);
}
