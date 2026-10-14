/**
 * 设备采集数据的领域常量。
 *
 * 采集数据不再有独立页面，而是挂在「设备台账 → 设备 → 生产批次 → 采集项」下，
 * 因此「看到哪些列」完全由设备类型决定。这里集中维护两份映射：
 *
 *   1. 设备类型编码 → 批次表里指向该设备的字段（挤出机 extruder_id / 牵引机 haul_off_id）
 *   2. 设备类型编码 → 该类型采集的数据项（顺序即页面列顺序）
 *
 * 页面动态列、Excel 模板表头、后端字段白名单三处共用这一份定义，
 * 保证「页面看到的列 = 模板里的列 = 能写进库的列」始终一致。
 *
 * 注意：本模块只放纯数据，会被客户端组件 import，不要引入任何服务端依赖。
 */

/** ppr_equipment_reading 上允许采集的数据项列 */
export type ReadingFieldKey = 'temperature_c' | 'pressure_mpa' | 'haul_off_speed_mpm';

export interface ReadingFieldMeta {
  key: ReadingFieldKey;
  /** 中文含义，例如「牵引速度」 */
  label: string;
  /** 计量单位，例如 m/min */
  unit: string;
  /** 表格列头：单位直接写进列头，例如「牵引速度(m/min)」 */
  columnLabel: string;
}

const READING_FIELDS: Record<ReadingFieldKey, ReadingFieldMeta> = {
  temperature_c: { key: 'temperature_c', label: '温度', unit: '℃', columnLabel: '温度(℃)' },
  pressure_mpa: { key: 'pressure_mpa', label: '压力', unit: 'MPa', columnLabel: '压力(MPa)' },
  haul_off_speed_mpm: { key: 'haul_off_speed_mpm', label: '牵引速度', unit: 'm/min', columnLabel: '牵引速度(m/min)' },
};

/** 所有采集项，也是未识别设备类型时的兜底列顺序 */
export const ALL_READING_FIELDS: ReadingFieldKey[] = ['temperature_c', 'pressure_mpa', 'haul_off_speed_mpm'];

/** 设备类型编码 → 该类型采集的数据项（顺序即页面列顺序） */
const TYPE_READING_FIELDS: Record<string, ReadingFieldKey[]> = {
  'ETYPE-EXTRUDER': ['temperature_c', 'pressure_mpa'],
  'ETYPE-HAULOFF': ['haul_off_speed_mpm'],
};

/** 设备类型编码 → 批次表里指向该设备的字段 */
const TYPE_BATCH_LINK: Record<string, 'extruder_id' | 'haul_off_id'> = {
  'ETYPE-EXTRUDER': 'extruder_id',
  'ETYPE-HAULOFF': 'haul_off_id',
};

export type BatchLinkField = 'extruder_id' | 'haul_off_id';

/** 批次关联字段的中文名，用于页面提示 */
export const BATCH_LINK_LABEL: Record<BatchLinkField, string> = {
  extruder_id: '挤出机',
  haul_off_id: '牵引机',
};

/** 该设备类型采集哪些数据项；未识别的类型兜底展示全部，避免新类型下页面空白 */
export function readingFieldsForType(typeCode?: string | null): ReadingFieldKey[] {
  return (typeCode && TYPE_READING_FIELDS[typeCode]) || ALL_READING_FIELDS;
}

/** 该设备类型的页面列 / 模板列定义（含单位） */
export function readingColumnsForType(typeCode?: string | null): ReadingFieldMeta[] {
  return readingFieldsForType(typeCode).map((key) => READING_FIELDS[key]);
}

/**
 * 该设备类型在批次表里的关联字段；
 * 返回 null 表示这个类型不参与生产批次（既不是挤出机也不是牵引机），页面应给出提示。
 */
export function batchLinkFieldForType(typeCode?: string | null): BatchLinkField | null {
  return (typeCode && TYPE_BATCH_LINK[typeCode]) || null;
}

/** 按列名取采集项元数据；不是采集项列时返回 null，用于接口侧做字段白名单 */
export function readingFieldMeta(key: string): ReadingFieldMeta | null {
  return (READING_FIELDS as Record<string, ReadingFieldMeta>)[key] ?? null;
}
