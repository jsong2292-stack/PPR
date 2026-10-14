/**
 * 产品数据导入：解析一条检验记录要写入的批次维度。
 *
 * 数据模型是「批次号即唯一关联键，批次不落表」（见 scripts/init-db.sql 的 ppr_batch 视图），
 * 所以导入时不需要（也不能）先建批次，只要把两件事定下来：
 *   - batch_no：这批检验记录属于哪个批次号，设备采集数据靠它关联；
 *   - spec_id：判定限值取哪条产品规格（视图里批次规格也来自检验记录，所以必须逐行落库）。
 *
 * 取值优先级（页面上下文 > 文件内容 > 已有记录的兜底）：
 *   1. spec_id：产品台账下钻到某个规格时由页面固定，优先于文件里的 spec_code / spec_name；
 *   2. 找不到规格时，退回该批次已有检验记录上的 spec_id（同一批次保持同一规格）；
 *   3. production_group / batch_start_time 直接取文件里的值，只用于批次清单展示。
 *   4. 无论走哪条分支，只要解析出的规格与该批次已有记录的规格不一致就拒绝写入（见 assertBatchSpecUnchanged）。
 * 解析失败抛普通 Error，由调用方转成 400，不写库。
 */
import { dbClient } from '@/lib/quality';

export interface ResolvedMeasurementContext {
  batchNo: string;
  specId: number;
  specName: string | null;
  /** 同一批次已有记录时，本次导入是否延续了已有规格 */
  inheritedSpec: boolean;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value === undefined || value === null ? '' : String(value).trim();
}

/** 空字符串按「没填」处理的正整数；填了非法值时返回 null 交由后续报错。 */
function positiveNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/** 产品规格：先按页面上下文 / 文件里的编码名称查，再退回该批次已有记录上的规格。 */
async function resolveSpecId(body: Record<string, unknown>, batchNo: string): Promise<{ specId: number; specName: string | null; inherited: boolean }> {
  const explicitSpecId = positiveNumber(body.spec_id);
  if (explicitSpecId) {
    const spec = await dbClient.queryOne<{ id: number; name: string }>('SELECT id, name FROM ppr_product_spec WHERE id=?', [explicitSpecId]);
    if (!spec) throw new Error(`产品规格ID ${explicitSpecId} 不存在`);
    await assertBatchSpecUnchanged(batchNo, Number(spec.id), String(spec.name));
    return { specId: Number(spec.id), specName: String(spec.name), inherited: false };
  }

  const specKey = text(body.spec_code) || text(body.spec_name);
  if (specKey) {
    const spec = await dbClient.queryOne<{ id: number; name: string }>('SELECT id, name FROM ppr_product_spec WHERE code=? OR name=? LIMIT 1', [specKey, specKey]);
    if (!spec) throw new Error(`找不到产品规格「${specKey}」，请先在数据源管理 / 产品台账里创建`);
    await assertBatchSpecUnchanged(batchNo, Number(spec.id), String(spec.name));
    return { specId: Number(spec.id), specName: String(spec.name), inherited: false };
  }

  const existing = await dbClient.queryOne<{ spec_id: number; spec_name: string | null }>(
    `SELECT m.spec_id, s.name AS spec_name FROM ppr_product_measurement m
       JOIN ppr_product_spec s ON s.id=m.spec_id
      WHERE m.batch_no=? ORDER BY m.id LIMIT 1`,
    [batchNo]
  );
  if (existing) return { specId: Number(existing.spec_id), specName: existing.spec_name, inherited: true };

  throw new Error(`批次「${batchNo}」还没有检验记录，无法确定产品规格：请在表格里提供 spec_code（规格编码）或 spec_name（规格名称）`);
}

/**
 * 一个批次号只能对应一个产品规格。
 *
 * 新模型下批次不落表，数据库层没有「同一批次的检验记录必须是同一规格」的约束，
 * 而视图里的批次规格是 `MAX(spec_id)`。如果放任两次导入写入不同规格，同一批次的外径/壁厚限值
 * 会自相矛盾，预警结果也就不可信了。明细数据只能导入、不能编辑，所以这里宁可挡住并给出补救路径。
 */
async function assertBatchSpecUnchanged(batchNo: string, specId: number, specName: string) {
  const existing = await dbClient.queryOne<{ spec_id: number; spec_name: string }>(
    `SELECT m.spec_id, s.name AS spec_name FROM ppr_product_measurement m
       JOIN ppr_product_spec s ON s.id=m.spec_id
      WHERE m.batch_no=? ORDER BY m.id LIMIT 1`,
    [batchNo]
  );
  if (existing && Number(existing.spec_id) !== specId) {
    throw new Error(
      `批次「${batchNo}」已经属于产品规格「${existing.spec_name}」，本次要写入的是「${specName}」：`
      + '同一个批次号只能对应一个产品规格。请先在批次总览里清理这个批次（会连同检验记录与采集数据一起删掉），或者改用正确的批次号 / 规格编码。'
    );
  }
}

/**
 * 解析一条产品数据记录所属的批次号与产品规格。
 * 批次号来自页面上下文或文件；规格按上面的优先级解析，解析不出来就报错，不猜。
 */
export async function resolveMeasurementBatch(body: Record<string, unknown>): Promise<ResolvedMeasurementContext> {
  const batchNo = text(body.batch_no);
  if (!batchNo) throw new Error('缺少生产批次号：请在表格的 batch_no 列填写批次号');
  const { specId, specName, inherited } = await resolveSpecId(body, batchNo);
  return { batchNo, specId, specName, inheritedSpec: inherited };
}
