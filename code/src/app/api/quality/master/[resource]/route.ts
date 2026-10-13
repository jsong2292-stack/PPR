import { NextRequest, NextResponse } from 'next/server';
import { isMasterResource, normalizeValue, RESOURCE_CONFIG, dbClient } from '@/lib/quality';
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
  const columns = config.columns.filter((column) => body[column] !== undefined);
  if (!columns.length) return error('没有可保存的字段');
  try {
    const result = await dbClient.query(
      `INSERT INTO ${config.table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      columns.map((column) => normalizeValue(body[column]))
    );
    const row = await dbClient.queryOne(`SELECT * FROM ${config.table} WHERE id=?`, [result.insertId]);
    return NextResponse.json({ data: row }, { status: 201 });
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
    await dbClient.query(
      `UPDATE ${config.table} SET ${columns.map((column) => `${column}=?`).join(', ')} WHERE id=?`,
      [...columns.map((column) => normalizeValue(body[column])), id]
    );
    const row = await dbClient.queryOne(`SELECT * FROM ${config.table} WHERE id=?`, [id]);
    return NextResponse.json({ data: row });
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
    await dbClient.query(`DELETE FROM ${config.table} WHERE id=?`, [id]);
    return NextResponse.json({ success: true });
  } catch (cause) {
    console.error('quality master DELETE failed', cause);
    return error(cause instanceof Error ? cause.message : '删除失败；请先移除关联数据', 500);
  }
}
