import { NextRequest, NextResponse } from 'next/server';
import { isMasterResource, normalizeValue, RESOURCE_CONFIG, dbClient } from '@/lib/quality';
import { refreshAlertsQuietly, type AlertEvaluationSummary } from '@/lib/quality-analysis/alert-engine';
import { resolveMeasurementBatch } from '@/lib/quality-import';
import {
  cleanupBatchMeasurements,
  describeArchivedReports,
  describeMeasurementCleanup,
  loadMeasurementCleanup,
} from '@/lib/quality-batch-cleanup';
import { requireAdmin } from '@/lib/auth';
import { failFrom } from '@/lib/api';

export const runtime = 'nodejs';

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** 批次是视图，没有可写字段：所有写入口都给出同一句提示。 */
const BATCH_READONLY_MESSAGE = '批次是由产品数据与设备数据按批次号实时关联出来的，不能手工新建或编辑；导入产品数据时会自动出现对应批次';

/** 系统管理 / 数据源管理属于后台能力，仅管理员可读写 */
async function adminGuard(): Promise<NextResponse | null> {
  try {
    await requireAdmin();
    return null;
  } catch (cause) {
    return failFrom(cause, '无权限操作');
  }
}

/**
 * 产品数据或产品规格变动后自动重算预警事件。
 * 只有 measurements 与 specs 两个资源会影响判定结果，其余主数据不触发。
 * 判定失败不影响数据写入本身，因此这里不做错误返回，只把结果带给前端提示。
 */
async function autoRefreshAlerts(resource: string, patches: { batchNos?: unknown[]; specId?: unknown }): Promise<AlertEvaluationSummary | null> {
  if (resource === 'measurements') {
    return refreshAlertsQuietly({ batchNos: (patches.batchNos ?? []).map((value) => String(value ?? '')).filter(Boolean) });
  }
  if (resource === 'specs') {
    return refreshAlertsQuietly({ specId: Number(patches.specId) });
  }
  return null;
}

export async function GET(request: NextRequest, context: { params: Promise<{ resource: string }> }) {
  const denied = await adminGuard(); if (denied) return denied;
  const { resource } = await context.params;
  if (!isMasterResource(resource)) return error('不支持的数据资源', 404);
  const config = RESOURCE_CONFIG[resource];
  // 下钻页面用查询参数收窄列表：scopeParams 必须全部传齐才生效，缺一个就退回全量，避免误展示。
  const scopeValues = (config.scopeParams ?? []).map((key) => request.nextUrl.searchParams.get(key));
  const scoped = Boolean(config.scopedListSql && scopeValues.length && scopeValues.every((value) => value !== null && value !== ''));
  try {
    const rows = await dbClient.queryAll(scoped ? config.scopedListSql! : config.listSql, scoped ? (scopeValues as string[]) : []);
    return NextResponse.json({ data: rows });
  } catch (cause) {
    console.error('quality master GET failed', cause);
    return error(cause instanceof Error ? cause.message : '查询失败', 500);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ resource: string }> }) {
  const denied = await adminGuard(); if (denied) return denied;
  const { resource } = await context.params;
  if (!isMasterResource(resource)) return error('不支持的数据资源', 404);
  const config = RESOURCE_CONFIG[resource];
  if (config.readOnly) return error(BATCH_READONLY_MESSAGE);
  const body = await request.json().catch(() => ({}));
  const missing = config.required.filter((key) => body[key] === undefined || body[key] === '' || body[key] === null);
  if (missing.length) return error(`缺少必填字段：${missing.join('、')}`);
  // 产品数据：批次号与规格直接落在检验记录上（批次不落表），由 resolveMeasurementBatch 统一解析。
  let resolved: Awaited<ReturnType<typeof resolveMeasurementBatch>> | null = null;
  if (resource === 'measurements') {
    try {
      resolved = await resolveMeasurementBatch(body);
    } catch (cause) {
      return error(cause instanceof Error ? cause.message : '批次解析失败');
    }
    body.batch_no = resolved.batchNo;
    body.spec_id = resolved.specId;
  }
  // 空字符串一律当作「没填」：让 MySQL 用列默认值，而不是写入 NULL 撞上 NOT NULL 约束。
  // （编辑接口 PUT 仍保留「空字符串 = 置空」的语义，表单靠它清空可选字段。）
  const columns = config.columns.filter((column) => body[column] !== undefined && body[column] !== '');
  if (!columns.length) return error('没有可保存的字段');
  try {
    // 产品数据按 record_no 幂等：同一个文件重复导入（或导入修正版）会覆盖已有行，不会报主键冲突。
    const upsert = resource === 'measurements' && columns.includes('record_no')
      ? ` ON DUPLICATE KEY UPDATE ${columns.filter((column) => column !== 'record_no').map((column) => `${column}=VALUES(${column})`).join(', ')}`
      : '';
    const result = await dbClient.query(
      `INSERT INTO ${config.table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})${upsert}`,
      columns.map((column) => normalizeValue(body[column]))
    );
    const row = resource === 'measurements' && body.record_no
      ? await dbClient.queryOne(`SELECT * FROM ${config.table} WHERE record_no=?`, [body.record_no])
      : await dbClient.queryOne(`SELECT * FROM ${config.table} WHERE id=?`, [result.insertId]);
    const alerts = await autoRefreshAlerts(resource, { batchNos: [row?.batch_no] });
    return NextResponse.json({ data: row, alerts, batch: resolved }, { status: 201 });
  } catch (cause) {
    console.error('quality master POST failed', cause);
    return error(cause instanceof Error ? cause.message : '保存失败', 500);
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ resource: string }> }) {
  const denied = await adminGuard(); if (denied) return denied;
  const { resource } = await context.params;
  if (!isMasterResource(resource)) return error('不支持的数据资源', 404);
  const config = RESOURCE_CONFIG[resource];
  if (config.readOnly) return error(BATCH_READONLY_MESSAGE);
  const body = await request.json().catch(() => ({}));
  const id = Number(body.id);
  if (!id) return error('缺少记录ID');
  const columns = config.columns.filter((column) => body[column] !== undefined);
  if (!columns.length) return error('没有可更新的字段');
  try {
    // 取更新前的批次，改批次号或改规格限值后新旧两侧都要重算，避免旧批次留下过期事件。
    const previous = await dbClient.queryOne(`SELECT * FROM ${config.table} WHERE id=?`, [id]);
    await dbClient.query(
      `UPDATE ${config.table} SET ${columns.map((column) => `${column}=?`).join(', ')} WHERE id=?`,
      [...columns.map((column) => normalizeValue(body[column])), id]
    );
    const row = await dbClient.queryOne(`SELECT * FROM ${config.table} WHERE id=?`, [id]);
    const alerts = await autoRefreshAlerts(resource, {
      batchNos: [previous?.batch_no, row?.batch_no],
      specId: resource === 'specs' ? id : undefined,
    });
    return NextResponse.json({ data: row, alerts });
  } catch (cause) {
    console.error('quality master PUT failed', cause);
    return error(cause instanceof Error ? cause.message : '更新失败', 500);
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ resource: string }> }) {
  const denied = await adminGuard(); if (denied) return denied;
  const { resource } = await context.params;
  if (!isMasterResource(resource)) return error('不支持的数据资源', 404);
  const config = RESOURCE_CONFIG[resource];
  const searchParams = new URL(request.url).searchParams;
  // 批次的「id」就是批次号（视图里 id 即 batch_no），其余资源仍是自增主键。
  const rawId = searchParams.get('id') ?? '';
  const id = Number(rawId);
  if (!rawId.trim() || (resource !== 'batches' && !id)) return error('缺少记录ID');
  // 批次不落表，这里的「批次 id」就是批次号，删除 = 清理该批次的检验记录（产品侧），
  // 不碰设备采集数据（那是设备台账里按设备清理的）。必须由前端二次确认后显式带上 confirm=1。
  const confirmed = searchParams.get('confirm') === '1';
  try {
    if (resource === 'batches') {
      const blocked = await guardBatchMeasurementCleanup(rawId, confirmed);
      if (blocked) return blocked;
      if (!confirmed) return error(`批次「${rawId}」下没有检验记录`, 404);
      const deleted = await cleanupBatchMeasurements(rawId);
      // 只删数据，不新增数据，判定结果不会冒出新的预警，无需重算。
      return NextResponse.json({
        success: true,
        alerts: null,
        deleted,
        message: `已清理 ${deleted.measurements} 条检验记录与 ${deleted.alerts} 条预警事件；该批次的设备采集数据不受影响。`,
      });
    }
    const previous = await dbClient.queryOne(`SELECT * FROM ${config.table} WHERE id=?`, [id]);
    await dbClient.query(`DELETE FROM ${config.table} WHERE id=?`, [id]);
    const alerts = await autoRefreshAlerts(resource, { batchNos: [previous?.batch_no] });
    return NextResponse.json({ success: true, alerts });
  } catch (cause) {
    console.error('quality master DELETE failed', cause);
    const message = cause instanceof Error ? cause.message : '';
    // 其余资源仍然靠外键兜底，但不再把 MySQL 的英文报错甩给用户。
    if (/foreign key constraint/i.test(message)) {
      return error('存在关联数据，无法删除；请先移除关联记录后重试', 409);
    }
    return error(message || '删除失败；请先移除关联数据', 500);
  }
}

/**
 * 清理批次检验记录前的检查。
 * 有归档 8D 报告 → 直接拒绝（归档表对报告是 RESTRICT，确认了也删不掉）；
 * 有检验记录但用户还没确认 → 返回 409 + 条数，前端据此弹二次确认。
 *
 * 这里只统计产品侧（检验记录及其预警事件）；设备采集数据不参与，也不受影响。
 */
async function guardBatchMeasurementCleanup(batchNo: string, confirmed: boolean): Promise<NextResponse | null> {
  const cleanup = await loadMeasurementCleanup(batchNo);
  if (cleanup.archivedReports.length) {
    return NextResponse.json({
      error: describeArchivedReports(cleanup),
      code: 'BATCH_HAS_ARCHIVED_REPORT',
      cleanup,
    }, { status: 409 });
  }
  if (!confirmed && cleanup.measurements > 0) {
    return NextResponse.json({
      error: describeMeasurementCleanup(cleanup),
      code: 'BATCH_HAS_MEASUREMENTS',
      cleanup,
    }, { status: 409 });
  }
  return null;
}
