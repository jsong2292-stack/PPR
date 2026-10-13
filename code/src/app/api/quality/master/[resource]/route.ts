import { NextRequest, NextResponse } from 'next/server';
import { isMasterResource, normalizeValue, RESOURCE_CONFIG, dbClient } from '@/lib/quality';
import { refreshAlertsQuietly, type AlertEvaluationSummary } from '@/lib/quality-analysis/alert-engine';
import { resolveMeasurementBatch, type ResolvedBatch } from '@/lib/quality-import';
import { requireAdmin } from '@/lib/auth';
import { failFrom } from '@/lib/api';

export const runtime = 'nodejs';

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

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
async function autoRefreshAlerts(resource: string, patches: { batchIds?: unknown[]; specId?: unknown }): Promise<AlertEvaluationSummary | null> {
  if (resource === 'measurements') {
    return refreshAlertsQuietly({ batchIds: (patches.batchIds ?? []).map(Number) });
  }
  if (resource === 'specs') {
    return refreshAlertsQuietly({ specId: Number(patches.specId) });
  }
  return null;
}

export async function GET(_request: NextRequest, context: { params: Promise<{ resource: string }> }) {
  const denied = await adminGuard(); if (denied) return denied;
  const { resource } = await context.params;
  if (!isMasterResource(resource)) return error('不支持的数据资源', 404);
  try {
    const rows = await dbClient.queryAll(RESOURCE_CONFIG[resource].listSql);
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
  const body = await request.json().catch(() => ({}));
  const missing = config.required.filter((key) => body[key] === undefined || body[key] === '' || body[key] === null);
  if (missing.length) return error(`缺少必填字段：${missing.join('、')}`);
  // 产品数据可以用批次号代替批次ID（Excel 模板里没有自增主键可填），必要时顺带建批次。
  let batch: ResolvedBatch | null = null;
  if (resource === 'measurements') {
    try {
      batch = await resolveMeasurementBatch(body);
    } catch (cause) {
      return error(cause instanceof Error ? cause.message : '批次解析失败');
    }
    body.batch_id = batch.id;
  }
  // 空字符串一律当作「没填」：让 MySQL 用列默认值，而不是写入 NULL 撞上 NOT NULL 约束。
  // （编辑接口 PUT 仍保留「空字符串 = 置空」的语义，表单靠它清空可选字段。）
  const columns = config.columns.filter((column) => body[column] !== undefined && body[column] !== '');
  if (!columns.length) return error('没有可保存的字段');
  try {
    const result = await dbClient.query(
      `INSERT INTO ${config.table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      columns.map((column) => normalizeValue(body[column]))
    );
    const row = await dbClient.queryOne(`SELECT * FROM ${config.table} WHERE id=?`, [result.insertId]);
    const alerts = await autoRefreshAlerts(resource, { batchIds: [row?.batch_id] });
    return NextResponse.json({ data: row, alerts, batch }, { status: 201 });
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
  const body = await request.json().catch(() => ({}));
  const id = Number(body.id);
  if (!id) return error('缺少记录ID');
  const columns = config.columns.filter((column) => body[column] !== undefined);
  if (!columns.length) return error('没有可更新的字段');
  try {
    // 取更新前的批次，改批次或改规格限值后新旧两侧都要重算，避免旧批次留下过期事件。
    const previous = await dbClient.queryOne(`SELECT * FROM ${config.table} WHERE id=?`, [id]);
    await dbClient.query(
      `UPDATE ${config.table} SET ${columns.map((column) => `${column}=?`).join(', ')} WHERE id=?`,
      [...columns.map((column) => normalizeValue(body[column])), id]
    );
    const row = await dbClient.queryOne(`SELECT * FROM ${config.table} WHERE id=?`, [id]);
    const alerts = await autoRefreshAlerts(resource, {
      batchIds: [previous?.batch_id, row?.batch_id],
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
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!id) return error('缺少记录ID');
  try {
    // 删除产品数据后该批次的「连续点」判定可能变化，需要按批次重算。
    const previous = await dbClient.queryOne(`SELECT * FROM ${config.table} WHERE id=?`, [id]);
    await dbClient.query(`DELETE FROM ${config.table} WHERE id=?`, [id]);
    const alerts = await autoRefreshAlerts(resource, { batchIds: [previous?.batch_id] });
    return NextResponse.json({ success: true, alerts });
  } catch (cause) {
    console.error('quality master DELETE failed', cause);
    return error(cause instanceof Error ? cause.message : '删除失败；请先移除关联数据', 500);
  }
}
