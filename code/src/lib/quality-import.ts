/**
 * 产品数据导入辅助。
 *
 * Excel 模板里让业务人员填 ppr_batch 的自增主键 batch_id 是不现实的：新批次还没有 ID。
 * 所以导入时允许只写批次号 batch_no：
 *   - 批次已存在 → 直接复用；
 *   - 批次不存在 → 按同时给出的 spec_code / spec_name 自动新建批次（规格必须能确定，不猜）。
 * 显式传了 batch_id 时以 batch_id 为准，保持原有 API 行为不变。
 */
import { dbClient } from '@/lib/quality';

export interface ResolvedBatch {
  id: number;
  batchNo: string;
  /** 该批次是否是本次导入自动新建的。 */
  created: boolean;
  specId: number | null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value === undefined || value === null ? '' : String(value).trim();
}

/**
 * 解析（必要时新建）产品数据要挂靠的生产批次。
 * 解析失败抛普通 Error，由调用方转成 400，不写库。
 */
export async function resolveMeasurementBatch(body: Record<string, unknown>): Promise<ResolvedBatch> {
  const explicitId = Number(body.batch_id);
  if (Number.isFinite(explicitId) && explicitId > 0) {
    const row = await dbClient.queryOne<{ batch_no: string; spec_id: number }>('SELECT batch_no, spec_id FROM ppr_batch WHERE id=?', [explicitId]);
    if (!row) throw new Error(`批次ID ${explicitId} 不存在`);
    return { id: explicitId, batchNo: String(row.batch_no), created: false, specId: Number(row.spec_id) };
  }

  const batchNo = text(body.batch_no);
  if (!batchNo) throw new Error('缺少生产批次：请提供 batch_no（批次号）或 batch_id');

  const found = await dbClient.queryOne<{ id: number; spec_id: number }>('SELECT id, spec_id FROM ppr_batch WHERE batch_no=?', [batchNo]);
  if (found) return { id: Number(found.id), batchNo, created: false, specId: Number(found.spec_id) };

  // 自动新建批次：规格必须明确，否则宁可报错也不猜。
  const specKey = text(body.spec_code) || text(body.spec_name);
  if (!specKey) throw new Error(`批次 ${batchNo} 不存在；自动新建批次需要同时提供 spec_code 或 spec_name`);
  const spec = await dbClient.queryOne<{ id: number; name: string }>('SELECT id, name FROM ppr_product_spec WHERE code=? OR name=? LIMIT 1', [specKey, specKey]);
  if (!spec) throw new Error(`找不到产品规格「${specKey}」，请先在系统管理 / 产品规格中创建`);

  const startTime = text(body.batch_start_time) || text(body.inspect_time);
  if (!startTime) throw new Error('自动新建批次需要 batch_start_time 或 inspect_time 作为批次开始时间');
  const productionGroup = text(body.production_group) || '导入批次';
  const result = await dbClient.query(
    `INSERT INTO ppr_batch (batch_no, spec_id, production_group, start_time, status, data_source)
     VALUES (?, ?, ?, ?, 'completed', ?)`,
    [batchNo, spec.id, productionGroup, startTime, text(body.batch_data_source) || 'Excel导入']
  );
  return { id: Number(result.insertId), batchNo, created: true, specId: Number(spec.id) };
}
